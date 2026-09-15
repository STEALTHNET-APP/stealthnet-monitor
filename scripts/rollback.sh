#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
exec 9>.update.lock
flock -n 9 || { echo "Another update or rollback is running" >&2; exit 1; }
[[ -f .previous-revision ]] || { echo 'No previous release recorded' >&2; exit 1; }
REV=$(cat .previous-revision)
[[ "$REV" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid previous revision' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Local tracked changes prevent rollback' >&2; exit 1; }
docker image inspect stealthnet-monitor:rollback >/dev/null
git checkout --detach "$REV"
docker image tag stealthnet-monitor:rollback stealthnet-monitor:local
docker compose up -d --no-build --wait
printf '%s\n' 'Previous application restored. Database retained (migrations are additive in 0.1.x).'
