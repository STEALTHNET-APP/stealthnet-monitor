#!/usr/bin/env python3
"""Read an existing Xray log. No container exec, restart, config writes or network API calls."""
import argparse
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
        ip = str(ipaddress.ip_address(match['peer'].rsplit(':', 1)[0].strip('[]')))
    except ValueError:
        return None
    user, protocol = match['user'], match['protocol'].upper()
    if len(user.encode()) > 250:
        return None
    # Destination domains, destination IPs and browsing contents are intentionally omitted.
    identity = hashlib.sha256(f'{user}|{ip}|{protocol}'.encode()).hexdigest()
    return {'id': identity, 'time': timestamp, 'kind': 'connection', 'user': user,
            'ip': ip, 'protocol': protocol, 'evidence': 'Xray: принятое подключение'}


def log_path(container):
    pid = int(subprocess.check_output(
        ['docker', '--host', 'unix:///var/run/docker.sock', 'inspect', '--type', 'container', '--format', '{{.State.Pid}}', container],
        timeout=10, stderr=subprocess.DEVNULL, text=True).strip())
    if pid <= 0:
        raise OSError('Container is stopped')
    return pathlib.Path(f'/proc/{pid}/root/var/log/xray/current')


def run(container, directory):
    output = directory / 'events.jsonl'
    cursor = directory / 'cursor.json'
    state = json.loads(cursor.read_text()) if cursor.exists() else {}
    identity, offset = state.get('identity'), state.get('offset', 0)
    pending = OrderedDict((event['id'], event) for event in state.get('pending', []))
    path, next_inspect, next_flush = None, 0, 0
    while True:
        try:
            clock = time.monotonic()
            if path is None or clock >= next_inspect:
                path = log_path(container)
                next_inspect = clock + 30
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
                    event = observation(line.decode('utf-8', errors='replace'), int(time.time() * 1000))
                    if event:
                        # Keep one recent observation per user/IP/transport; flush oldest pending keys first.
                        pending[event['id']] = event
                        if len(pending) > 10000:
                            pending.popitem(last=False)
            if clock >= next_flush:
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
                temporary.write_text(json.dumps({'identity': identity, 'offset': offset, 'pending': list(pending.values())}))
                temporary.chmod(0o600)
                temporary.replace(cursor)
                next_flush = clock + 15
        except (OSError, ValueError, subprocess.SubprocessError):
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
