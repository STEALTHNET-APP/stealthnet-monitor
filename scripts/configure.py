#!/usr/bin/env python3
import argparse
import base64
import os
import pathlib
import re
import secrets


def https_port(value):
    if not re.fullmatch(r"[1-9][0-9]{0,4}", value) or not 1 <= int(value) <= 65535 or value == "80":
        raise argparse.ArgumentTypeError("HTTPS port must be 1–65535, excluding 80")
    return int(value)


parser = argparse.ArgumentParser()
parser.add_argument("--domain", required=True)
parser.add_argument("--repo", default="")
parser.add_argument("--directory", default=".")
parser.add_argument("--port", type=https_port, default=443)
args = parser.parse_args()
if not re.fullmatch(r"[a-zA-Z0-9.-]+", args.domain) or "." not in args.domain:
    raise SystemExit("Invalid domain")
if args.repo and not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo):
    raise SystemExit("Invalid GitHub repository")

root = pathlib.Path(args.directory)
root.mkdir(parents=True, exist_ok=True)
target = root / ".env"
content = (
    f"DOMAIN={args.domain}\n"
    f"POSTGRES_PASSWORD={secrets.token_hex(24)}\n"
    f"ADMIN_PASSWORD={secrets.token_urlsafe(24)}\n"
    f"ENCRYPTION_KEY={base64.b64encode(secrets.token_bytes(32)).decode()}\n"
    "RETENTION_DAYS=30\n"
    f"HTTPS_PORT={args.port}\n"
    f"LOCAL_PORT={8788 if args.port == 8787 else 8787}\n"
    f"GITHUB_REPO={args.repo}\n"
    "RELEASE_CHANNEL=stable\n"
)
try:
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit(".env already exists; configuration retained")
with os.fdopen(fd, "w") as out:
    out.write(content)
print("Configuration created. The panel password is stored in .env (ADMIN_PASSWORD).")
