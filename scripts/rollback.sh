#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
PANEL_DIR=$(cd "${STEALTHNET_PANEL_DIR:-$(dirname "$0")/..}" && pwd)
if [[ "${STEALTHNET_ROLLBACK_STAGED:-}" != 1 ]]; then
 RUN_DIR=$(mktemp -d)
 trap 'rm -rf -- "$RUN_DIR"' EXIT
 cp "$0" "$RUN_DIR/rollback.sh"
 cp "$(dirname "$0")/update_history.py" "$RUN_DIR/update_history.py"
 STEALTHNET_PANEL_DIR="$PANEL_DIR" STEALTHNET_ROLLBACK_STAGED=1 bash "$RUN_DIR/rollback.sh" "$@"
 exit 0
fi
cd "$PANEL_DIR"
WRITER="$(dirname "$0")/update_history.py"
exec 9>.update.lock
flock -n 9 || { echo 'Another update or rollback is running' >&2; exit 1; }
[[ -f .previous-revision ]] || { echo 'No previous release recorded' >&2; exit 1; }
REV=$(cat .previous-revision)
[[ "$REV" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid previous revision' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Local tracked changes prevent rollback' >&2; exit 1; }
docker image inspect stealthnet-monitor:rollback >/dev/null
OLD_REV=$(git rev-parse HEAD)
OLD_VERSION=$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)
NEW_VERSION=$(git describe --tags --exact-match "$REV" 2>/dev/null || printf '%.12s' "$REV")
OPERATION_ID=$(python3 "$WRITER" begin --action rollback --old "$OLD_VERSION" --new "$NEW_VERSION" --old-revision "$OLD_REV" --new-revision "$REV")
record(){ python3 "$WRITER" change --id "$OPERATION_ID" "$@" || echo 'Could not write update history' >&2; }
failed(){ local code=$1; trap - ERR INT TERM; record --status failed --exit-code "$code"; exit "$code"; }
trap 'failed $?' ERR
trap 'failed 130' INT
trap 'failed 143' TERM
record --stage rollback
git checkout --detach "$REV"
docker image tag stealthnet-monitor:rollback stealthnet-monitor:local
docker compose up -d --no-build --wait
record --status succeeded
trap - ERR INT TERM
printf '%s\n' 'Previous application restored. Database retained (migrations are additive in 0.1.x).'
