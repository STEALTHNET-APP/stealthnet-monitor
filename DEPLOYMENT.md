# Эксплуатация

## Резервное копирование и восстановление

`make backup` записывает PostgreSQL custom dump и копию `.env` с правами владельца в `backups/<UTC timestamp>`. Скопируйте каталог в независимое хранилище. Ключ шифрования необходим для восстановления токенов.

Пробное восстановление в отдельную временную базу без замены рабочих данных:

```bash
# Укажите путь к сделанной копии вместо BACKUP.
docker compose exec -T db createdb -U stealthnet stealthnet_restore_check
docker compose exec -T db pg_restore -U stealthnet -d stealthnet_restore_check --exit-on-error < BACKUP/database.dump
docker compose exec -T db psql -U stealthnet -d stealthnet_restore_check -c 'SELECT count(*) FROM nodes;'
docker compose exec -T db dropdb -U stealthnet stealthnet_restore_check
```

Для аварийного восстановления рабочей БД сначала остановите API; сохраните текущее состояние, восстановите dump в новую БД, проверьте его и переключите DATABASE_URL. Не применяйте `--clean` к работающей базе без подготовленного отката. Изменение схемы в 0.1.x должно оставаться совместимым с предыдущим приложением.

## Обновление

- Публичные релизы имеют теги `vMAJOR.MINOR.PATCH`. `make update VERSION=v0.1.0` выбирает конкретный тег.
- Установщик использует публичный GitHub API; лимиты GitHub могут временно отказать в получении latest. В таком случае передайте `--version` / `VERSION` явно.
- Перед обновлением tracked-файлы должны быть чистыми. Настройки меняйте в `.env` и данных, а локальные изменения кода оформляйте отдельными коммитами.
- На первой установке предыдущей версии нет. `make rollback` появляется после первого успешного обновления.
- Обновление агента выполняется повторным запуском его установщика с `--panel`; регистрация и очередь остаются на сервере.

## Проверка

```bash
make status
curl -fsS https://monitor.example.com/api/health
systemctl status stealthnet-monitor-agent
journalctl -u stealthnet-monitor-agent --since '10 minutes ago'
```

Проверьте свежий `last_seen` в карточке, сохранение хостера и даты после перезагрузки, затем тест Telegram через рабочий интерфейс. Реальная проверка Telegram требует токена и разрешённого чата. Окончание аренды проверяется каждые 15 секунд по UTC.
