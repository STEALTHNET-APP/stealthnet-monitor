#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/.."
command -v flock >/dev/null || { echo 'flock is required' >&2; exit 1; }
exec 9>.update.lock
flock -n 9 || { echo 'Another update is running' >&2; exit 1; }
# Read only the repository setting; never source an environment file as code.
REPO=$(python3 -c 'from pathlib import Path; print(next((s.split("=",1)[1] for s in Path(".env").read_text().splitlines() if s.startswith("GITHUB_REPO=")), ""))')
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo 'Set GITHUB_REPO=owner/stealthnet-monitor in .env' >&2; exit 1; }
[[ -d .git ]] || { echo 'Update requires a Git checkout made by install-panel.sh' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Tracked files have local changes; commit or move them before updating' >&2; exit 1; }
OLD_REV=$(git rev-parse HEAD)
OLD_IMAGE=$(docker compose images -q api | head -1)
[[ -n "$OLD_IMAGE" ]] || { echo 'Start the current installation before updating' >&2; exit 1; }
NEW_REF=${VERSION:-$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')}
[[ "$NEW_REF" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || { echo 'A versioned release tag is required' >&2; exit 1; }
git fetch "https://github.com/$REPO.git" "refs/tags/$NEW_REF:refs/tags/$NEW_REF"
NEW_REV=$(git rev-parse "$NEW_REF^{commit}")
[[ "$OLD_REV" != "$NEW_REV" ]] || { echo 'Already up to date'; exit 0; }
BACKUP_DIR="backups/$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_DIR" bash scripts/backup.sh
docker image tag "$OLD_IMAGE" stealthnet-monitor:rollback
printf '%s\n' "$OLD_REV" > .previous-revision
printf '%s\n' "$BACKUP_DIR" > .previous-backup
restore(){
 echo 'Update failed. Restoring the previous application.' >&2
 git checkout --detach "$OLD_REV"
 docker image tag stealthnet-monitor:rollback stealthnet-monitor:local
 docker compose up -d --no-build --wait
}
trap restore ERR
git checkout --detach "$NEW_REV"
docker compose build api
docker compose up -d --no-build --wait
HEALTH_PORT=$(python3 -c 'from pathlib import Path; print(next((s.split("=",1)[1] for s in Path(".env").read_text().splitlines() if s.startswith("LOCAL_PORT=")), "8787"))')
[[ "$HEALTH_PORT" =~ ^[0-9]+$ ]]
curl -fsS "http://127.0.0.1:$HEALTH_PORT/api/health" >/dev/null
trap - ERR
printf '%s\n' "Updated to $NEW_REF"
