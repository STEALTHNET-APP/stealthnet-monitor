use crate::{App, db, telegram};
use serde_json::{Value, json};
use sqlx::Row;
use stealthnet_core::{Rule, now};
pub async fn evaluate(app: &App) -> anyhow::Result<()> {
    let rules = db::records(&app.db, "rule", 1000).await?;
    for node in db::nodes(&app.db).await? {
        let id = node["id"].as_str().unwrap_or_default();
        let raw_seen = node["last_seen"].as_i64().unwrap_or(0);
        for value in &rules {
            let rule: Rule = serde_json::from_value(value.clone())?;
            if !rule.enabled
                || rule.scope != "all" && rule.scope != id
                || ["complaint", "detection"].contains(&rule.metric.as_str())
            {
                continue;
            }
            if rule.metric == "expiry" {
                evaluate_expiry(app, &node, &rule).await?;
                continue;
            }
            // Agent resource rules apply only after an agent has been installed.
            if node["source"] == "remnawave" {
                continue;
            }
            let metric = match rule.metric.as_str() {
                "offline" => Some((now() - raw_seen) as f64 / 1000.),
                "traffic" => node["rx"]
                    .as_f64()
                    .zip(node["tx"].as_f64())
                    .map(|(a, b)| a + b),
                m => node[m].as_f64(),
            };
            let Some(metric) = metric else { continue };
            let key = format!("{}:{id}", rule.id);
            let current =
                sqlx::query("SELECT since,active,last_sent,incident FROM alert_state WHERE id=$1")
                    .bind(&key)
                    .fetch_optional(&app.db)
                    .await?;
            let (since, active, last_sent, incident) = current
                .map(|r| {
                    (
                        r.get::<i64, _>("since"),
                        r.get::<i64, _>("active") != 0,
                        r.get::<i64, _>("last_sent"),
                        r.get::<String, _>("incident"),
                    )
                })
                .unwrap_or((0, false, 0, String::new()));
            if rule.matches(metric) {
                let since = if since == 0 { now() } else { since };
                let fire = now() - since >= rule.duration * 1000;
                let incident_id = if incident.is_empty() {
                    uuid::Uuid::new_v4().to_string()
                } else {
                    incident
                };
                let mut sent = last_sent;
                if fire && (!active || now() - last_sent >= rule.repeat * 1000) {
                    let title = format!("{}: {}", rule.name, node["name"].as_str().unwrap_or(id));
                    let text = format!(
                        "{} {}\n\nНода: {}\nРегион: {}\nЗначение: {:.2}\nПорог: {}\nИсточник: агент stealthnet-monitor\n\n{}",
                        if rule.severity == "critical" {
                            "🔴"
                        } else {
                            "🟡"
                        },
                        rule.name,
                        node["name"].as_str().unwrap_or(id),
                        node["country"].as_str().unwrap_or("—"),
                        metric,
                        rule.threshold,
                        app.public_url
                    );
                    telegram::queue(app, &rule.metric, &title, &text, Some(id), false).await?;
                    sent = now();
                    db::save_record(&app.db,"incident",&incident_id,&json!({"id":incident_id,"node":node["name"],"node_id":id,"title":rule.name,"status":rule.severity,"started":since,"value":format!("{metric:.2}"),"source":"Агент stealthnet-monitor","rule_id":rule.id}),since).await?;
                }
                sqlx::query("INSERT INTO alert_state(id,since,active,last_sent,incident) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET since=excluded.since,active=excluded.active,last_sent=excluded.last_sent,incident=excluded.incident").bind(&key).bind(since).bind(if fire{1_i64}else{0}).bind(sent).bind(&incident_id).execute(&app.db).await?;
            } else if since != 0 {
                if active {
                    if rule.recovery {
                        let title =
                            format!("Восстановление: {}", node["name"].as_str().unwrap_or(id));
                        telegram::queue(
                            app,
                            "recovery",
                            &title,
                            &format!(
                                "🟢 Восстановление\n{}\n{}\nТекущее значение: {metric:.2}",
                                node["name"].as_str().unwrap_or(id),
                                rule.name
                            ),
                            Some(id),
                            false,
                        )
                        .await?;
                    }
                    if let Some(r) =
                        sqlx::query("SELECT payload FROM records WHERE kind='incident' AND id=$1")
                            .bind(&incident)
                            .fetch_optional(&app.db)
                            .await?
                    {
                        let mut p: Value = serde_json::from_str(&r.get::<String, _>("payload"))?;
                        p["status"] = json!("resolved");
                        p["resolved_at"] = json!(now());
                        db::save_record(&app.db, "incident", &incident, &p, now()).await?;
                    }
                }
                sqlx::query("DELETE FROM alert_state WHERE id=$1")
                    .bind(&key)
                    .execute(&app.db)
                    .await?;
            }
        }
    }
    Ok(())
}
pub async fn event(
    app: &App,
    kind: &str,
    title: &str,
    node_id: Option<&str>,
) -> anyhow::Result<()> {
    for r in db::records(&app.db, "rule", 1000).await? {
        let rule: Rule = serde_json::from_value(r)?;
        if rule.enabled
            && rule.metric == kind
            && (rule.scope == "all" || Some(rule.scope.as_str()) == node_id)
        {
            telegram::queue(app, kind, title, title, node_id, false).await?;
            break;
        }
    }
    Ok(())
}

async fn evaluate_expiry(app: &App, node: &Value, rule: &Rule) -> anyhow::Result<()> {
    let id = node["id"].as_str().unwrap_or_default();
    let key = format!("expiry-state:{}:{id}", rule.id);
    let old: Value = db::setting(&app.db, &key)
        .await?
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    let current_time = now();
    let anchor = node["expires_at"].as_i64();
    let Some(expires) = anchor.and_then(|date| crate::billing::next_payment(date, current_time))
    else {
        if old["stage"].is_number() {
            let incident_id = format!("expiry:{id}:{}", rule.id);
            db::save_record(&app.db, "incident", &incident_id, &json!({"id":incident_id,"node":node["name"],"node_id":id,"title":"Дата оплаты удалена","status":"resolved","started":now(),"value":"Напоминание отключено","source":"График оплаты"}), now()).await?;
        }
        if !old.is_null() {
            db::set_setting(&app.db, &key, "null").await?;
        }
        return Ok(());
    };
    let previous = old["expires_at"].as_i64();
    let days = expires.div_euclid(86400000) - current_time.div_euclid(86400000);
    let stage = crate::billing::reminder_stage(expires, current_time, rule.threshold);
    let name = node["name"].as_str().unwrap_or(id);
    let provider = node["provider"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("Не указан");
    let date = chrono::DateTime::from_timestamp_millis(expires)
        .map(|d| d.format("%d.%m.%Y (UTC)").to_string())
        .unwrap_or_default();
    // A new calendar month is not evidence of a payment. Only an explicit
    // schedule edit can produce the legacy `renewal` notification category.
    let date_changed = old["anchor"].as_i64().is_some_and(|v| Some(v) != anchor);
    if date_changed && rule.recovery && stage.is_none() {
        let title = format!("Дата оплаты изменена: {name}");
        telegram::queue(
            app,
            "renewal",
            &title,
            &format!("📅 Дата оплаты изменена\n\n{name}\nХостер: {provider}\nСледующий платёж: {date}\nПовтор: каждый месяц"),
            Some(id),
            false,
        )
        .await?;
    }
    if let Some(stage) = stage {
        if old["stage"].as_i64() != Some(stage) || previous != Some(expires) {
            let title = if stage == 0 {
                format!("Сегодня оплата сервера: {name}")
            } else {
                format!("Скоро оплата сервера: {name}")
            };
            let cost = node["monthly_cost"]
                .as_f64()
                .map(|v| {
                    format!(
                        "\nСумма: {v:.2} {}",
                        node["currency"].as_str().unwrap_or("USD")
                    )
                })
                .unwrap_or_default();
            let text = format!(
                "📅 {title}\n\nСервер: {name}\nХостер: {provider}\nДата оплаты: {date}{cost}\nОсталось: {days} дн.\nПовтор: каждый месяц\nИсточник: график оплаты в настройках сервера"
            );
            telegram::queue(app, "expiry", &title, &text, Some(id), false).await?;
            let incident_id = format!("expiry:{id}:{}", rule.id);
            db::save_record(&app.db,"incident",&incident_id,&json!({"id":incident_id,"node":name,"node_id":id,"title":title,"status":"warning","started":now(),"value":format!("{days} дн."),"source":"График оплаты","next_payment_at":expires,"provider":provider}),now()).await?;
        }
    } else if old["stage"].is_number() {
        let incident_id = format!("expiry:{id}:{}", rule.id);
        db::save_record(&app.db,"incident",&incident_id,&json!({"id":incident_id,"node":name,"node_id":id,"title":"Следующий платёж запланирован","status":"resolved","started":now(),"value":date,"source":"График оплаты","provider":provider}),now()).await?;
    }
    db::set_setting(
        &app.db,
        &key,
        &json!({"anchor":anchor,"expires_at":expires,"stage":stage}).to_string(),
    )
    .await?;
    Ok(())
}
