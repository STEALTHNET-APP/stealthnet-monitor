SHELL := /bin/bash
.PHONY: help configure start stop restart status logs build update backup rollback test dev-api dev-web
help:
	@printf '%s\n' 'stealthnet-monitor: configure start stop restart status logs build update backup rollback test' 'First run: make configure DOMAIN=monitor.example.com'
configure:
	python3 scripts/configure.py --domain '$(DOMAIN)' --repo '$(GITHUB_REPO)'
build:
	docker compose build
start:
	docker compose up -d --wait
stop:
	docker compose stop
restart:
	docker compose restart
status:
	docker compose ps
logs:
	docker compose logs --tail=100 -f
update:
	bash scripts/update.sh
backup:
	bash scripts/backup.sh
rollback:
	bash scripts/rollback.sh
test:
	cargo test --workspace --locked
	node --test web/tests/metrics.test.ts
	npm --prefix web run build
	bash -n scripts/*.sh
dev-api:
	cargo run -p stealthnet-api
dev-web:
	npm --prefix web run dev
