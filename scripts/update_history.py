#!/usr/bin/env python3
"""Write bounded deployment metadata; never copy command output or environment secrets."""
import argparse
import json
import os
from pathlib import Path
import tempfile
import time
import uuid

STAGES = ('download', 'backup', 'build', 'start', 'health', 'rollback')
STATUSES = ('running', 'succeeded', 'failed', 'rolled_back', 'rollback_failed', 'interrupted', 'unchanged')


def save(directory, history):
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(0o755)
    fd, name = tempfile.mkstemp(prefix='.history-', dir=directory)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(history[:100], stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
        os.replace(name, directory / 'history.json')
    finally:
        if os.path.exists(name):
            os.unlink(name)


def load(directory):
    path = directory / 'history.json'
    return json.loads(path.read_text()) if path.exists() else []


def begin(directory, action, old, new, old_revision='', new_revision=''):
    history = load(directory)
    now = int(time.time() * 1000)
    # A new process owns the update lock, so an older running operation was interrupted.
    for row in history:
        if row['status'] == 'running':
            row['status'] = 'interrupted'
            row['finished_at'] = now
            for step in row['steps']:
                if step['status'] == 'running':
                    step['status'] = 'interrupted'
    operation = {
        'id': str(uuid.uuid4()), 'action': action, 'from_version': old[:100],
        'to_version': new[:100], 'from_revision': old_revision[:40],
        'to_revision': new_revision[:40], 'started_at': now, 'finished_at': None,
        'updated_at': now, 'status': 'running', 'stage': None, 'steps': [],
        'backup': None, 'exit_code': None, 'source': 'updater',
    }
    save(directory, [operation, *history])
    return operation['id']


def change(directory, operation_id, status='running', stage=None, backup=None, exit_code=None, new_revision=None):
    assert status in STATUSES
    assert stage is None or stage in STAGES
    history = load(directory)
    row = next(row for row in history if row['id'] == operation_id)
    now = int(time.time() * 1000)
    for step in row['steps']:
        if step['status'] == 'running' and ((stage is not None and step['name'] != stage) or status != 'running'):
            step['status'] = 'succeeded' if status in ('running', 'succeeded', 'rolled_back', 'unchanged') else 'failed'
            step['finished_at'] = now
    if stage and stage != row['stage']:
        row['steps'].append({'name': stage, 'status': 'running', 'started_at': now, 'finished_at': None})
    row['stage'] = stage or row['stage']
    row['status'] = status
    row['updated_at'] = now
    row['finished_at'] = None if status == 'running' else now
    if backup is not None:
        row['backup'] = backup[:250]
    if exit_code is not None:
        row['exit_code'] = exit_code
    if new_revision is not None:
        row['to_revision'] = new_revision[:40]
    save(directory, history)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, default=Path('.state/updates'))
    sub = parser.add_subparsers(dest='command', required=True)
    start = sub.add_parser('begin')
    start.add_argument('--action', choices=['update', 'rollback'], default='update')
    start.add_argument('--old', required=True)
    start.add_argument('--new', required=True)
    start.add_argument('--old-revision', default='')
    start.add_argument('--new-revision', default='')
    update = sub.add_parser('change')
    update.add_argument('--id', required=True)
    update.add_argument('--status', choices=STATUSES, default='running')
    update.add_argument('--stage', choices=STAGES)
    update.add_argument('--backup')
    update.add_argument('--exit-code', type=int)
    update.add_argument('--new-revision')
    args = parser.parse_args()
    if args.command == 'begin':
        print(begin(args.directory, args.action, args.old, args.new, args.old_revision, args.new_revision))
    else:
        change(args.directory, args.id, args.status, args.stage, args.backup, args.exit_code, args.new_revision)


if __name__ == '__main__':
    main()
