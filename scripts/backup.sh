#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$BACKUP_DIR"
docker compose exec -T db pg_dump -U stealthnet -d stealthnet -Fc > "$BACKUP_DIR/database.dump.tmp"
# Validate the dump index before accepting it as a backup.
docker compose exec -T db pg_restore --list < "$BACKUP_DIR/database.dump.tmp" >/dev/null
mv "$BACKUP_DIR/database.dump.tmp" "$BACKUP_DIR/database.dump"
cp .env "$BACKUP_DIR/environment"
docker compose images -q api > "$BACKUP_DIR/image-id"
printf '%s\n' "Backup created: $BACKUP_DIR"
