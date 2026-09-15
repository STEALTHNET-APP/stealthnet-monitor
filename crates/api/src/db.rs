use anyhow::Result;
use serde_json::{Value, json};
use sqlx::{AnyPool, Row};
use stealthnet_core::{Rule, now};
pub async fn connect(url: &str) -> Result<AnyPool> {
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new()
        .max_connections(if url.starts_with("sqlite:") { 1 } else { 10 })
        .connect(url)
        .await?;
    for sql in [
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires BIGINT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS enrollments (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, expires BIGINT NOT NULL, used BIGINT NOT NULL DEFAULT 0, config TEXT NOT NULL, node_id TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, last_seen BIGINT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS telemetry (id TEXT PRIMARY KEY, node_id TEXT NOT NULL, time BIGINT NOT NULL, payload TEXT NOT NULL)",
        "CREATE INDEX IF NOT EXISTS telemetry_node_time ON telemetry (node_id, time)",
        "CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, time BIGINT NOT NULL, PRIMARY KEY (kind,id))",
        "CREATE INDEX IF NOT EXISTS records_time ON records (kind,time)",
        "CREATE TABLE IF NOT EXISTS alert_state (id TEXT PRIMARY KEY, since BIGINT NOT NULL, active BIGINT NOT NULL, last_sent BIGINT NOT NULL, incident TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, attempts BIGINT NOT NULL, next_at BIGINT NOT NULL, time BIGINT NOT NULL, last_error TEXT NOT NULL)",
        "CREATE INDEX IF NOT EXISTS deliveries_pending ON deliveries (status,next_at)",
    ] {
        sqlx::query(sql).execute(&pool).await?;
    }
    if sqlx::query("SELECT id FROM records WHERE kind='rule' LIMIT 1")
        .fetch_optional(&pool)
        .await?
        .is_none()
    {
        for (metric, threshold, duration, name) in [
            ("offline", 120., 0, "Агент потерял связь"),
            ("cpu", 85., 300, "CPU выше 85%"),
            ("ram", 90., 300, "Высокая загрузка RAM"),
            ("disk", 90., 60, "Мало места на диске"),
            ("complaint", 1., 0, "Новая внешняя жалоба"),
            ("detection", 1., 0, "Обнаружение BitTorrent"),
        ] {
            let r = Rule {
                id: metric.into(),
                name: name.into(),
                metric: metric.into(),
                threshold,
                duration,
                repeat: 900,
                recovery: true,
                enabled: true,
                scope: "all".into(),
                severity: if metric == "offline" {
                    "critical"
                } else {
                    "warning"
                }
                .into(),
            };
            save_record(&pool, "rule", &r.id, &serde_json::to_value(&r)?, now()).await?;
        }
    }
    if sqlx::query("SELECT id FROM records WHERE kind='rule' AND id='expiry'")
        .fetch_optional(&pool)
        .await?
        .is_none()
    {
        let r = Rule {
            id: "expiry".into(),
            name: "Окончание аренды сервера".into(),
            metric: "expiry".into(),
            threshold: 7.,
            duration: 0,
            repeat: 86400,
            recovery: true,
            enabled: true,
            scope: "all".into(),
            severity: "warning".into(),
        };
        save_record(&pool, "rule", "expiry", &serde_json::to_value(r)?, now()).await?;
    }
    Ok(pool)
}
pub async fn setting(pool: &AnyPool, key: &str) -> Result<Option<String>> {
    Ok(sqlx::query("SELECT value FROM settings WHERE key=$1")
        .bind(key)
        .fetch_optional(pool)
        .await?
        .map(|r| r.get("value")))
}
pub async fn set_setting(pool: &AnyPool, key: &str, value: &str) -> Result<()> {
    sqlx::query("INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key).bind(value).execute(pool).await?;
    Ok(())
}
pub async fn save_record(
    pool: &AnyPool,
    kind: &str,
    id: &str,
    payload: &Value,
    time: i64,
) -> Result<()> {
    sqlx::query("INSERT INTO records(kind,id,payload,time) VALUES($1,$2,$3,$4) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,time=excluded.time").bind(kind).bind(id).bind(payload.to_string()).bind(time).execute(pool).await?;
    Ok(())
}
pub async fn records(pool: &AnyPool, kind: &str, limit: i64) -> Result<Vec<Value>> {
    sqlx::query("SELECT payload FROM records WHERE kind=$1 ORDER BY time DESC LIMIT $2")
        .bind(kind)
        .bind(limit)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|r| Ok(serde_json::from_str(&r.get::<String, _>("payload"))?))
        .collect()
}
pub async fn nodes(pool: &AnyPool) -> Result<Vec<Value>> {
    let mut out = vec![];
    for r in sqlx::query("SELECT payload,last_seen FROM nodes ORDER BY id")
        .fetch_all(pool)
        .await?
    {
        let mut p: Value = serde_json::from_str(&r.get::<String, _>("payload"))?;
        let seen: i64 = r.get("last_seen");
        if now() - seen > 120000 {
            p["status"] = json!("offline");
            for k in ["cpu", "ram", "disk", "rx", "tx"] {
                p[k] = Value::Null;
            }
        }
        if let Some(meta) = setting(
            pool,
            &format!("billing:{}", p["id"].as_str().unwrap_or_default()),
        )
        .await?
        {
            let b: Value = serde_json::from_str(&meta)?;
            for (k, v) in b.as_object().unwrap() {
                p[k] = v.clone();
            }
        }
        out.push(p);
    }
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn sqlite_schema_roundtrip() {
        let p = connect("sqlite::memory:").await.unwrap();
        set_setting(&p, "k", "v").await.unwrap();
        assert_eq!(setting(&p, "k").await.unwrap().as_deref(), Some("v"));
        let rules = records(&p, "rule", 100).await.unwrap();
        assert_eq!(rules.len(), 7);
    }
}
