#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
# Example after publishing: curl -fsSL https://raw.githubusercontent.com/OWNER/stealthnet-monitor/main/scripts/install-panel.sh -o install.sh && sudo bash install.sh --repo OWNER/stealthnet-monitor --domain monitor.example.com
REPO=''; DOMAIN=''; VERSION=''; INSTALL_DIR=/opt/stealthnet-monitor
while [[ $# -gt 0 ]]; do case "$1" in --repo) REPO="$2";shift 2;;--domain) DOMAIN="$2";shift 2;;--version) VERSION="$2";shift 2;;--directory) INSTALL_DIR="$2";shift 2;;*) echo 'Use --repo owner/repo --domain monitor.example.com [--version v0.1.0]' >&2;exit 2;;esac;done
[[ $EUID -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'Valid repository and domain required' >&2; exit 1; }
[[ ! -e "$INSTALL_DIR" ]] || { echo 'Installation directory exists. Use make update inside it.' >&2; exit 1; }
command -v apt-get >/dev/null || { echo 'This installer supports Debian/Ubuntu; use Docker Compose on other systems.' >&2; exit 1; }
apt-get update
apt-get install -y ca-certificates curl git make python3
if ! command -v docker >/dev/null; then
 DOCKER_INSTALL_SCRIPT=$(mktemp)
 trap 'rm -f "$DOCKER_INSTALL_SCRIPT"' EXIT
 curl -fsSL https://get.docker.com -o "$DOCKER_INSTALL_SCRIPT"
 sh "$DOCKER_INSTALL_SCRIPT"
 rm -f "$DOCKER_INSTALL_SCRIPT"
 trap - EXIT
fi
docker compose version >/dev/null
if [[ -z "$VERSION" ]]; then VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | python3 -c 'import json,sys;print(json.load(sys.stdin)["tag_name"])'); fi
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || { echo 'Versioned release required' >&2;exit 1; }
git clone --branch "$VERSION" --depth 1 "https://github.com/$REPO.git" "$INSTALL_DIR"
cd "$INSTALL_DIR"
python3 scripts/configure.py --domain "$DOMAIN" --repo "$REPO"
docker compose build api
docker compose up -d --wait
printf '%s\n' "Panel installed: https://$DOMAIN" "Administrator password: ADMIN_PASSWORD in $INSTALL_DIR/.env" 'Manage with make start, make stop, make update.'
