#!/usr/bin/env python3
import argparse,base64,os,pathlib,re,secrets
p=argparse.ArgumentParser();p.add_argument('--domain',required=True);p.add_argument('--repo',default='');p.add_argument('--directory',default='.');args=p.parse_args()
if not re.fullmatch(r'[a-zA-Z0-9.-]+',args.domain) or '.' not in args.domain:raise SystemExit('Invalid domain')
if args.repo and not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',args.repo):raise SystemExit('Invalid GitHub repository')
root=pathlib.Path(args.directory);root.mkdir(parents=True,exist_ok=True)
f=root/'.env'
if f.exists():raise SystemExit('.env already exists; configuration retained')
password=secrets.token_urlsafe(24)
content=f'DOMAIN={args.domain}\nPOSTGRES_PASSWORD={secrets.token_hex(24)}\nADMIN_PASSWORD={password}\nENCRYPTION_KEY={base64.b64encode(secrets.token_bytes(32)).decode()}\nRETENTION_DAYS=30\nLOCAL_PORT=8787\nGITHUB_REPO={args.repo}\nRELEASE_CHANNEL=stable\n'
fd=os.open(f,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as out:out.write(content)
print('Configuration created. The panel password is stored in .env (ADMIN_PASSWORD).')
