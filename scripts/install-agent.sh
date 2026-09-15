#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
PANEL=''; TOKEN=''; EVENT_FILE=''
while [[ $# -gt 0 ]]; do
 case "$1" in
  --panel) PANEL="$2"; shift 2;;
  --token) TOKEN="$2"; shift 2;;
  --events) EVENT_FILE="$2"; shift 2;;
  *) echo 'Usage: install-agent.sh --panel https://monitor.example.com --token TOKEN [--events /path/events.jsonl]' >&2; exit 2;;
 esac
done
[[ $EUID -eq 0 ]] || { echo 'Run as root or sudo' >&2; exit 1; }
[[ "$PANEL" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || { echo 'A valid HTTPS panel origin is required' >&2; exit 1; }
command -v systemctl >/dev/null || { echo 'systemd is required' >&2; exit 1; }
if ! command -v python3 >/dev/null || ! command -v curl >/dev/null; then
 command -v apt-get >/dev/null || { echo 'curl and python3 are required' >&2; exit 1; }
 apt-get update && apt-get install -y ca-certificates curl python3
fi
command -v sha256sum >/dev/null || { echo 'sha256sum is required' >&2; exit 1; }
case "$(uname -m)" in x86_64) ARCH=x86_64;; aarch64|arm64) ARCH=aarch64;; *) echo 'Unsupported architecture' >&2; exit 1;; esac
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
BINARY="stealthnet-agent-linux-$ARCH"
curl -fsSL --proto '=https' --tlsv1.2 "$PANEL/downloads/$BINARY" -o "$TMP_DIR/$BINARY"
curl -fsSL --proto '=https' --tlsv1.2 "$PANEL/downloads/$BINARY.sha256" -o "$TMP_DIR/checksum"
(cd "$TMP_DIR" && sha256sum --check checksum)
chmod 755 "$TMP_DIR/$BINARY"
"$TMP_DIR/$BINARY" --version
install -d -m 700 /etc/stealthnet-monitor
if [[ ! -f /etc/stealthnet-monitor/agent.json ]]; then
 [[ "$TOKEN" =~ ^[a-f0-9]{64}$ ]] || { echo 'A one-time registration token is required' >&2; exit 1; }
 ENROLL_ARGS=(--enroll --panel "$PANEL" --config /etc/stealthnet-monitor/agent.json)
 if [[ -n "$EVENT_FILE" ]]; then ENROLL_ARGS+=(--events "$EVENT_FILE"); fi
 ENROLLMENT_TOKEN="$TOKEN" "$TMP_DIR/$BINARY" "${ENROLL_ARGS[@]}"
fi
unset TOKEN
# Remnawave configuration is written as JSON Compose: no shell evaluation of server data.
python3 - <<'PY'
import json,pathlib,subprocess,urllib.request,tempfile
p=pathlib.Path('/etc/stealthnet-monitor/agent.json');c=json.loads(p.read_text());e=c.get('enrollment') or {}
if e.get('mode')=='clean':
 if subprocess.run(['sh','-c','command -v docker'],capture_output=True).returncode:
  os_release=pathlib.Path('/etc/os-release').read_text()
  if not any('ID='+d in os_release or 'ID="'+d+'"' in os_release for d in ['debian','ubuntu']):
   raise SystemExit('Automatic Docker setup supports Debian/Ubuntu. Install Docker and rerun; registration is retained.')
  with tempfile.NamedTemporaryFile(suffix='.sh') as install:
   install.write(urllib.request.urlopen('https://get.docker.com',timeout=30).read());install.flush()
   subprocess.run(['sh',install.name],check=True)
 subprocess.run(['docker','compose','version'],check=True,stdout=subprocess.DEVNULL)
 target=pathlib.Path('/opt/stealthnet-remnawave-node');target.mkdir(mode=0o700,exist_ok=True)
 compose={'services':{'remnanode':{'image':e['node_image'],'restart':'unless-stopped','network_mode':'host','environment':{'NODE_PORT':str(e['node_port']),'SECRET_KEY':e['node_secret']},'volumes':['/var/log/remnanode:/var/log/remnanode']}}}
 f=target/'compose.json';f.write_text(json.dumps(compose));f.chmod(0o600)
 subprocess.run(['docker','compose','-p','stealthnet-remnanode','-f',str(f),'up','-d'],check=True)
 c['enrollment']=None;p.write_text(json.dumps(c));p.chmod(0o600)
PY
getent passwd stealthnet-agent >/dev/null || useradd --system --home /var/lib/stealthnet-monitor-agent --shell /usr/sbin/nologin stealthnet-agent
install -d -o stealthnet-agent -g stealthnet-agent -m 700 /var/lib/stealthnet-monitor-agent
chown -R stealthnet-agent:stealthnet-agent /etc/stealthnet-monitor
if command -v docker >/dev/null && docker --host unix:///var/run/docker.sock info >/dev/null 2>&1 && [[ -z "$EVENT_FILE" ]]; then
 # Discover exactly one official node container. These commands only inspect Docker state.
 XRAY_CONTAINER=$(docker --host unix:///var/run/docker.sock ps --format '{{.Names}} {{.Image}}' | python3 -c 'import sys; rows=[line.split()[0] for line in sys.stdin if len(line.split())==2 and line.split()[1].startswith(("remnawave/node:","ghcr.io/remnawave/node:"))]; print(rows[0] if len(rows)==1 else "")')
 if [[ "$XRAY_CONTAINER" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]]; then
  COLLECTOR_ENABLED=$(python3 - <<'PY'
import json,pathlib
c=json.loads(pathlib.Path('/etc/stealthnet-monitor/agent.json').read_text())
print('yes' if not c.get('event_file') or c.get('event_file')=='/var/lib/stealthnet-monitor-xray/events.jsonl' else 'no')
PY
)
  if [[ "$COLLECTOR_ENABLED" == yes ]]; then
   install -d -m 755 /usr/local/lib/stealthnet-monitor
   install -d -o root -g stealthnet-agent -m 750 /var/lib/stealthnet-monitor-xray
   curl -fsSL --proto '=https' --tlsv1.2 "$PANEL/xray-collector.py" -o "$TMP_DIR/xray_collector.py"
   install -o root -g root -m 644 "$TMP_DIR/xray_collector.py" /usr/local/lib/stealthnet-monitor/xray_collector.py
   cat > /etc/systemd/system/stealthnet-monitor-xray.service <<UNIT
[Unit]
Description=Read existing Xray connection log for stealthnet-monitor
After=docker.service
[Service]
User=root
Group=stealthnet-agent
Environment=DOCKER_CONFIG=/run/stealthnet-monitor-docker
ExecStart=/usr/bin/python3 /usr/local/lib/stealthnet-monitor/xray_collector.py --container $XRAY_CONTAINER
Restart=always
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/stealthnet-monitor-xray
RestrictAddressFamilies=AF_UNIX
MemoryMax=64M
CPUQuota=5%
[Install]
WantedBy=multi-user.target
UNIT
   python3 - <<'PY'
import json,pathlib
p=pathlib.Path('/etc/stealthnet-monitor/agent.json');c=json.loads(p.read_text())
c['event_file']='/var/lib/stealthnet-monitor-xray/events.jsonl'
p.write_text(json.dumps(c));p.chmod(0o600)
PY
   systemctl daemon-reload
   systemctl enable --now stealthnet-monitor-xray
   systemctl restart stealthnet-monitor-xray
  fi
 fi
fi
install -m 755 "$TMP_DIR/$BINARY" /usr/local/bin/stealthnet-agent.new
mv /usr/local/bin/stealthnet-agent.new /usr/local/bin/stealthnet-agent
cat > /etc/systemd/system/stealthnet-monitor-agent.service <<'UNIT'
[Unit]
Description=stealthnet-monitor node agent
After=network-online.target
Wants=network-online.target
[Service]
User=stealthnet-agent
Group=stealthnet-agent
ExecStart=/usr/local/bin/stealthnet-agent --config /etc/stealthnet-monitor/agent.json
Restart=always
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/stealthnet-monitor-agent
MemoryMax=128M
CPUQuota=10%
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now stealthnet-monitor-agent
systemctl restart stealthnet-monitor-agent
systemctl is-active --quiet stealthnet-monitor-agent
printf '%s\n' 'Agent installed. Metrics will appear within 30 seconds.'
