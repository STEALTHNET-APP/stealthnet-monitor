#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
PANEL_DIR=$(cd "${STEALTHNET_PANEL_DIR:-$(dirname "$0")/..}" && pwd)
# Execute a private snapshot: git checkout may replace the updater itself.
if [[ "${STEALTHNET_UPDATE_STAGED:-}" != 1 ]]; then
 RUN_DIR=$(mktemp -d)
 trap 'rm -rf -- "$RUN_DIR"' EXIT
 cp "$0" "$RUN_DIR/update.sh"
 cp "$(dirname "$0")/update_history.py" "$RUN_DIR/update_history.py"
 STEALTHNET_PANEL_DIR="$PANEL_DIR" STEALTHNET_UPDATE_STAGED=1 bash "$RUN_DIR/update.sh" "$@"
 exit 0
fi
cd "$PANEL_DIR"
WRITER="$(dirname "$0")/update_history.py"
command -v flock >/dev/null || { echo 'flock is required' >&2; exit 1; }
exec 9>.update.lock
flock -n 9 || { echo 'Another update is running' >&2; exit 1; }
# Read only the repository setting; never source an environment file as code.
REPO=$(python3 -c 'from pathlib import Path; print(next((s.split("=",1)[1] for s in Path(".env").read_text().splitlines() if s.startswith("GITHUB_REPO=")), ""))')
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo 'Set GITHUB_REPO=owner/stealthnet-monitor in .env' >&2; exit 1; }
[[ -d .git ]] || { echo 'Update requires a Git checkout made by install-panel.sh' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Tracked files have local changes; commit or move them before updating' >&2; exit 1; }
OLD_REV=$(git rev-parse HEAD)
OLD_VERSION=$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)
OLD_IMAGE=$(docker compose images -q api | head -1)
[[ -n "$OLD_IMAGE" ]] || { echo 'Start the current installation before updating' >&2; exit 1; }
NEW_REF=${VERSION:-$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')}
[[ "$NEW_REF" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || { echo 'A versioned release tag is required' >&2; exit 1; }
OPERATION_ID=$(python3 "$WRITER" begin --old "$OLD_VERSION" --new "$NEW_REF" --old-revision "$OLD_REV")
record(){ python3 "$WRITER" change --id "$OPERATION_ID" "$@" || echo 'Could not write update history' >&2; }
CHANGED=0
failed(){
 local code=$1
 trap - ERR INT TERM
 record --status failed --exit-code "$code"
 if [[ "$CHANGED" == 1 ]]; then
  echo 'Update failed. Restoring the previous application.' >&2
  record --stage rollback
  if git checkout --detach "$OLD_REV" && docker image tag stealthnet-monitor:rollback stealthnet-monitor:local && docker compose up -d --no-build --wait; then
   record --status rolled_back
  else
   record --status rollback_failed
  fi
 fi
 exit "$code"
}
trap 'failed $?' ERR
trap 'failed 130' INT
trap 'failed 143' TERM
record --stage download
git fetch "https://github.com/$REPO.git" "refs/tags/$NEW_REF:refs/tags/$NEW_REF"
NEW_REV=$(git rev-parse "$NEW_REF^{commit}")
record --new-revision "$NEW_REV"
if [[ "$OLD_REV" == "$NEW_REV" ]]; then
 record --status unchanged
 echo 'Already up to date'
 exit 0
fi
record --stage backup
BACKUP_DIR="backups/$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_DIR" bash scripts/backup.sh
record --backup "$BACKUP_DIR"
docker image tag "$OLD_IMAGE" stealthnet-monitor:rollback
printf '%s\n' "$OLD_REV" > .previous-revision
printf '%s\n' "$BACKUP_DIR" > .previous-backup
CHANGED=1
git checkout --detach "$NEW_REV"
record --stage build
docker compose build api
record --stage start
docker compose up -d --no-build --wait
record --stage health
HEALTH_PORT=$(python3 -c 'from pathlib import Path; print(next((s.split("=",1)[1] for s in Path(".env").read_text().splitlines() if s.startswith("LOCAL_PORT=")), "8787"))')
[[ "$HEALTH_PORT" =~ ^[0-9]+$ ]]
curl -fsS "http://127.0.0.1:$HEALTH_PORT/api/health" >/dev/null
record --status succeeded
trap - ERR INT TERM
printf '%s\n' "Updated to $NEW_REF"
