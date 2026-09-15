#!/usr/bin/env python3
"""Read existing Xray logs, local configuration and kernel socket counters. Never change VPN state."""
import argparse
import http.client
import socket
import hashlib
import ipaddress
import json
import os
import pathlib
import re
import subprocess
import time
from collections import OrderedDict

LINE = re.compile(r"\bfrom (?:tcp:|udp:)?(?P<peer>\S+) accepted (?P<protocol>tcp|udp):\S+.*\bemail: (?P<user>\S+)")


def observation(line, timestamp):
    match = LINE.search(line)
    if not match:
        return None
    try:
        ip, port = peer(match['peer'])
    except ValueError:
        return None
    user, protocol = match['user'], match['protocol'].upper()
    if len(user.encode()) > 250:
        return None
    # Destination domains, destination IPs and browsing contents are intentionally omitted.
    identity = hashlib.sha256(f'{user}|{ip}|{protocol}'.encode()).hexdigest()
    return {'id': identity, 'time': timestamp, 'kind': 'connection', 'user': user,
            'ip': ip, 'source_port': port, 'protocol': protocol, 'evidence': 'Xray: принятое подключение'}


def peer(value):
    address, port = value.rsplit(':', 1)
    ip = ipaddress.ip_address(address.strip('[]'))
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    port = int(port)
    if not 0 < port <= 65535:
        raise ValueError('Invalid port')
    return str(ip), port


def parse_sockets(output):
    result, current = {}, None
    for line in output.splitlines():
        if not line[:1].isspace():
            current = None
            parts = line.split()
            if len(parts) < 4:
                continue
            try:
                local, remote = peer(parts[2]), peer(parts[3])
            except ValueError:
                continue
            cookie = re.search(r'\bsk:([0-9a-f]+)', line)
            if not cookie:
                continue
            current = {'cookie': cookie[1], 'local_port': local[1]}
            result[remote] = current
        elif current is not None:
            for key in ('bytes_acked', 'bytes_received'):
                match = re.search(r'\b' + key + r':(\d+)', line)
                if match:
                    current[key] = int(match[1])
            rtt = re.search(r'\brtt:([0-9.]+)', line)
            if rtt:
                current['rtt_ms'] = float(rtt[1])
    return result


def sockets(ports):
    if not ports:
        return None
    expression = '( ' + ' or '.join('sport = :' + str(p) for p in sorted(ports)) + ' )'
    output = subprocess.check_output(['ss', '-H', '-tine', 'state', 'established', expression], timeout=10, stderr=subprocess.DEVNULL, text=True)
    if len(output) > 32_000_000:
        raise ValueError('Socket snapshot too large')
    return parse_sockets(output)


def capabilities(config):
    ports, sniffed, torrent_tags = set(), set(), set()
    for inbound in config.get('inbounds', []):
        if inbound.get('protocol') not in ('vless', 'vmess', 'trojan', 'shadowsocks'):
            continue
        port = inbound.get('port')
        if isinstance(port, (str, int)) and str(port).isdigit() and 0 < int(port) <= 65535:
            ports.add(int(port))
        if inbound.get('sniffing', {}).get('enabled'):
            sniffed.add(inbound.get('tag'))
    for rule in config.get('routing', {}).get('rules', []):
        # A shared outbound label is evidence only if every rule using it detects BitTorrent.
        if rule.get('protocol') == ['bittorrent'] and set(rule) <= {'type', 'protocol', 'outboundTag', 'ruleTag'}:
            tag = rule.get('outboundTag')
            others = [r for r in config['routing']['rules'] if r.get('outboundTag') == tag]
            if tag and all(r.get('protocol') == ['bittorrent'] for r in others):
                torrent_tags.add(tag)
    return ports, sniffed, torrent_tags


def config_capabilities(container_pid):
    namespace = os.readlink(f'/proc/{container_pid}/ns/mnt')
    for process in pathlib.Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            if (process / 'comm').read_text().strip() not in ('rw-core', 'xray') or os.readlink(process / 'ns/mnt') != namespace:
                continue
            args = (process / 'cmdline').read_bytes().split(b'\0')
            source = next((a.decode() for a in args if a.startswith(b'@') and b':/' in a), None)
            if not source:
                # Older Xray/Remnawave builds can use a regular JSON configuration file.
                paths = []
                for i, argument in enumerate(args):
                    if argument in (b'-c', b'-config', b'--config') and i + 1 < len(args):
                        paths.append(args[i + 1].decode())
                    elif argument.startswith((b'-config=', b'--config=')):
                        paths.append(argument.split(b'=', 1)[1].decode())
                for filename in paths:
                    if not filename.startswith('/') or '..' in pathlib.PurePosixPath(filename).parts:
                        continue
                    path = process / 'root' / filename.lstrip('/')
                    if path.stat().st_size <= 32_000_000:
                        return capabilities(json.loads(path.read_text()))
                continue
            endpoint, request = source.split(':', 1)
            if '\r' in request or '\n' in request:
                continue
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as stream:
                stream.settimeout(8)
                stream.connect('\0' + endpoint[1:])
                stream.sendall(('GET ' + request + ' HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n').encode())
                response = http.client.HTTPResponse(stream)
                response.begin()
                if response.status != 200:
                    continue
                raw = response.read(32_000_001)
                if len(raw) > 32_000_000:
                    raise ValueError('Configuration too large')
                return capabilities(json.loads(raw))
        except (OSError, ValueError, http.client.HTTPException):
            continue
    return set(), set(), set()


def torrent_observation(line, event, sniffed, tags):
    route = re.search(r'\[([^\[\]]+) (?:>>|->) ([^\[\]]+)\]', line)
    if not route or route[1] not in sniffed or route[2] not in tags:
        return None
    identity = hashlib.sha256(f"{event['user']}|{event['ip']}|{event['time'] // 300000}".encode()).hexdigest()
    return {**event, 'id': identity, 'kind': 'detection', 'evidence': 'Xray: маршрут правила protocol=bittorrent; одно событие на пользователя/IP за 5 минут'}


class Sessions:
    def __init__(self, state=None):
        self.rows = state or {}

    def observe(self, event, snapshot):
        remote = (event['ip'], event['source_port'])
        measured = (snapshot or {}).get(remote)
        cookie = measured['cookie'] if measured else 'log'
        key = hashlib.sha256(f"{remote}|{cookie}|{event['user']}".encode()).hexdigest()
        old = self.rows.get(key)
        if old and cookie == 'log' and event['time'] - old['time'] > 180000:
            old = None
        if not old:
            old = {**event, 'id': key + ':' + str(event['time']), 'first_seen': event['time'], 'cookie': cookie,
                   'base_rx': measured.get('bytes_received') if measured else None,
                   'base_tx': measured.get('bytes_acked') if measured else None}
            self.rows[key] = old
        old.update(time=event['time'], last_activity=event['time'], protocol=event['protocol'])
        if len(self.rows) > 20000:
            oldest = min(self.rows, key=lambda k: self.rows[k]['time'])
            self.rows.pop(oldest)

    def sample(self, snapshot, timestamp):
        output, owners = [], {}
        for row in self.rows.values():
            owners.setdefault((row['ip'], row['source_port'], row['cookie']), set()).add(row['user'])
        for key, row in list(self.rows.items()):
            measured = (snapshot or {}).get((row['ip'], row['source_port']))
            connected = measured and measured['cookie'] == row['cookie']
            if connected:
                row['time'] = timestamp
                row['status'] = 'online'
                # A multiplexed socket shared by multiple accounts has no per-account byte allocation.
                if len(owners[(row['ip'], row['source_port'], row['cookie'])]) == 1:
                    for target, source, base in [('bytes_rx', 'bytes_received', 'base_rx'), ('bytes_tx', 'bytes_acked', 'base_tx')]:
                        if measured.get(source) is not None and row.get(base) is not None:
                            row[target] = max(0, measured[source] - row[base])
                    row['rtt_ms'] = measured.get('rtt_ms')
                else:
                    row.pop('bytes_rx', None)
                    row.pop('bytes_tx', None)
            elif snapshot is not None and row['cookie'] != 'log':
                row['status'] = 'ended'
            else:
                row['status'] = 'observed'
            event = {k: v for k, v in row.items() if k not in ('cookie', 'base_rx', 'base_tx')}
            event['evidence'] = 'TCP-канал: счётчики ядра с начала наблюдения' if row.get('bytes_rx') is not None else 'Xray: активность с начала наблюдения'
            output.append(event)
            if row['status'] == 'ended' or (not connected and timestamp - row['time'] > 180000):
                self.rows.pop(key)
        return output


def log_path(container):
    pid = int(subprocess.check_output(
        ['docker', '--host', 'unix:///var/run/docker.sock', 'inspect', '--type', 'container', '--format', '{{.State.Pid}}', container],
        timeout=10, stderr=subprocess.DEVNULL, text=True).strip())
    if pid <= 0:
        raise OSError('Container is stopped')
    return pathlib.Path(f'/proc/{pid}/root/var/log/xray/current'), pid


def run(container, directory):
    output = directory / 'events.jsonl'
    cursor = directory / 'cursor.json'
    state = json.loads(cursor.read_text()) if cursor.exists() else {}
    identity, offset = state.get('identity'), state.get('offset', 0)
    pending = OrderedDict((event['id'], event) for event in state.get('pending', []))
    path, next_inspect, next_flush, next_config = None, 0, 0, 0
    tracked = Sessions(state.get('sessions'))
    ports, sniffed, torrent_tags = set(), set(), set()
    snapshot, pid = None, 0
    while True:
        try:
            clock = time.monotonic()
            if path is None or clock >= next_inspect:
                path, pid = log_path(container)
                next_inspect = clock + 30
            if clock >= next_config:
                ports, sniffed, torrent_tags = config_capabilities(pid)
                next_config = clock + 300
            if clock >= next_flush:
                try:
                    snapshot = sockets(ports)
                except (OSError, ValueError, subprocess.SubprocessError):
                    snapshot = None
            with path.open('rb') as stream:
                meta = os.fstat(stream.fileno())
                current = f'{meta.st_dev}:{meta.st_ino}'
                if identity != current or meta.st_size < offset:
                    # First installation starts with new events, rotations start at byte zero.
                    offset = meta.st_size if identity is None else 0
                    identity = current
                stream.seek(offset)
                for _ in range(10000):
                    line = stream.readline(16384)
                    if not line or (not line.endswith(b'\n') and len(line) < 16384):
                        break
                    offset = stream.tell()
                    if not line.endswith(b'\n'):
                        continue
                    decoded = line.decode('utf-8', errors='replace')
                    event = observation(decoded, int(time.time() * 1000))
                    if event:
                        tracked.observe(event, snapshot)
                        detection = torrent_observation(decoded, event, sniffed, torrent_tags)
                        if detection:
                            pending['d:' + detection['id']] = detection
                            if len(pending) > 20000:
                                pending.popitem(last=False)
            if clock >= next_flush:
                timestamp = int(time.time() * 1000)
                for event in tracked.sample(snapshot, timestamp):
                    pending[event['id']] = event
                    if len(pending) > 20000:
                        pending.popitem(last=False)
                # Keep diagnostics separate from access records. No raw configuration or credentials.
                status = {'time': timestamp, 'connections': True, 'socket_counters': snapshot is not None,
                          'torrent_detection': bool(sniffed and torrent_tags), 'tracked_sessions': len(tracked.rows)}
                status_path = directory / 'status.tmp'
                status_path.write_text(json.dumps(status))
                status_path.chmod(0o640)
                status_path.replace(directory / 'status.json')
                if output.exists() and output.stat().st_size > 10_000_000:
                    output.replace(directory / 'events.previous.jsonl')
                with output.open('a', encoding='utf-8') as stream:
                    for _ in range(min(1000, len(pending))):
                        _, event = pending.popitem(last=False)
                        stream.write(json.dumps(event, ensure_ascii=False) + '\n')
                    stream.flush()
                    os.fsync(stream.fileno())
                output.chmod(0o640)
                temporary = cursor.with_suffix('.tmp')
                temporary.write_text(json.dumps({'identity': identity, 'offset': offset, 'pending': list(pending.values()), 'sessions': tracked.rows}))
                temporary.chmod(0o600)
                temporary.replace(cursor)
                next_flush = clock + 15
        except (OSError, ValueError, subprocess.SubprocessError, http.client.HTTPException):
            # Do not put client identifiers or raw log lines in the service journal.
            print('Xray log unavailable; retrying read-only discovery', flush=True)
            path = None
        time.sleep(2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--container', required=True)
    parser.add_argument('--directory', default='/var/lib/stealthnet-monitor-xray')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', args.container):
        parser.error('Invalid container name')
    os.umask(0o027)
    run(args.container, pathlib.Path(args.directory))
