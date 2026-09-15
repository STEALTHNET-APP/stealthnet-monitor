use crate::{App, Error, db};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use stealthnet_core::{now, token};
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub chat_id: String,
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default)]
    pub enabled: bool,
}
pub async fn config(app: &App) -> anyhow::Result<Config> {
    match db::setting(&app.db, "telegram").await? {
        Some(v) => Ok(serde_json::from_str(&app.secrets.open(&v)?)?),
        None => Ok(Config {
            events: [
                "offline",
                "cpu",
                "ram",
                "disk",
                "traffic",
                "complaint",
                "detection",
                "recovery",
                "expiry",
                "renewal",
            ]
            .map(String::from)
            .to_vec(),
            enabled: true,
            ..Default::default()
        }),
    }
}
pub async fn save(app: &App, c: &Config) -> anyhow::Result<()> {
    db::set_setting(
        &app.db,
        "telegram",
        &app.secrets.seal(&serde_json::to_string(c)?)?,
    )
    .await
}
#[derive(Debug)]
pub struct TelegramError {
    pub reason: String,
    pub retry_after: i64,
    pub permanent: bool,
}
// Never expose reqwest errors: Telegram tokens occur inside their request URLs.
pub async fn call(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    method: &str,
    body: Value,
) -> Result<Value, TelegramError> {
    let r = client
        .post(format!("{base}/bot{token}/{method}"))
        .json(&body)
        .send()
        .await
        .map_err(|_| TelegramError {
            reason: "Telegram недоступен или превышено время ожидания".into(),
            retry_after: 30,
            permanent: false,
        })?;
    let status = r.status().as_u16();
    let value: Value = r.json().await.map_err(|_| TelegramError {
        reason: "Некорректный ответ Telegram".into(),
        retry_after: 30,
        permanent: false,
    })?;
    if value["ok"] == true {
        return Ok(value["result"].clone());
    }
    Err(TelegramError {
        reason: format!(
            "Telegram отклонил запрос (код {})",
            value["error_code"].as_u64().unwrap_or(status as u64)
        ),
        retry_after: value["parameters"]["retry_after"]
            .as_i64()
            .unwrap_or(30)
            .clamp(1, 86400),
        permanent: [400, 401, 403, 404, 409].contains(&status),
    })
}
pub async fn rpc(app: &App, token: &str, method: &str, body: Value) -> Result<Value, Error> {
    call(&app.http, "https://api.telegram.org", token, method, body)
        .await
        .map_err(|e| Error::bad(e.reason))
}
pub async fn queue(
    app: &App,
    metric: &str,
    title: &str,
    text: &str,
    node_id: Option<&str>,
    force: bool,
) -> anyhow::Result<bool> {
    let c = config(app).await?;
    if c.token.is_empty()
        || c.chat_id.is_empty()
        || (!force && (!c.enabled || !c.events.iter().any(|e| e == metric)))
    {
        return Ok(false);
    }
    let id = token();
    let payload = json!({"title":title,"text":text,"chat_id":c.chat_id,"node_id":node_id,"channel":"Telegram"});
    sqlx::query("INSERT INTO deliveries(id,payload,status,attempts,next_at,time,last_error) VALUES($1,$2,'queued',0,$3,$3,'')").bind(&id).bind(payload.to_string()).bind(now()).execute(&app.db).await?;
    Ok(true)
}
pub async fn deliver(app: &App) -> anyhow::Result<()> {
    let c = config(app).await?;
    if c.token.is_empty() {
        return Ok(());
    }
    let rows=sqlx::query("SELECT id,payload,attempts FROM deliveries WHERE status IN ('queued','retry') AND next_at<=$1 ORDER BY time LIMIT 10").bind(now()).fetch_all(&app.db).await?;
    for r in rows {
        let id: String = r.get("id");
        let p: Value = serde_json::from_str(&r.get::<String, _>("payload"))?;
        let attempt = r.get::<i64, _>("attempts") + 1;
        let mut body =
            json!({"chat_id":p["chat_id"],"text":p["text"],"disable_web_page_preview":true});
        if let Some(node) = p["node_id"].as_str() {
            body["reply_markup"] = json!({"inline_keyboard":[[{"text":"Открыть ноду","url":format!("{}/nodes/{}",app.public_url,node)}]]});
        }
        let (status, delay, error) = match call(
            &app.http,
            "https://api.telegram.org",
            &c.token,
            "sendMessage",
            body,
        )
        .await
        {
            Ok(_) => ("delivered", 0, String::new()),
            Err(e) => {
                let delay = e.retry_after.max((2_i64.pow(attempt.min(8) as u32)) * 5);
                (
                    if e.permanent || attempt >= 8 {
                        "failed"
                    } else {
                        "retry"
                    },
                    delay,
                    e.reason,
                )
            }
        };
        sqlx::query(
            "UPDATE deliveries SET status=$1,attempts=$2,next_at=$3,last_error=$4 WHERE id=$5",
        )
        .bind(status)
        .bind(attempt)
        .bind(now() + delay * 1000)
        .bind(error)
        .bind(id)
        .execute(&app.db)
        .await?;
    }
    Ok(())
}
pub async fn history(app: &App) -> anyhow::Result<Vec<Value>> {
    let mut out = vec![];
    for r in sqlx::query("SELECT id,payload,status,attempts,time,last_error FROM deliveries ORDER BY time DESC LIMIT 100").fetch_all(&app.db).await?{let mut p:Value=serde_json::from_str(&r.get::<String,_>("payload"))?;p["id"]=json!(r.get::<String,_>("id"));p["status"]=json!(r.get::<String,_>("status"));p["time"]=json!(r.get::<i64,_>("time"));p["attempts"]=json!(r.get::<i64,_>("attempts"));p["error"]=json!(r.get::<String,_>("last_error"));p.as_object_mut().unwrap().remove("chat_id");out.push(p)}
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn obeys_retry_after_and_does_not_leak_token() {
        let app = axum::Router::new().route(
            "/{*path}",
            axum::routing::post(|| async {
                (
                    axum::http::StatusCode::TOO_MANY_REQUESTS,
                    axum::Json(
                        json!({"ok":false,"error_code":429,"parameters":{"retry_after":123}}),
                    ),
                )
            }),
        );
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = l.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
        let e = call(
            &reqwest::Client::new(),
            &format!("http://{addr}"),
            "SECRET",
            "sendMessage",
            json!({}),
        )
        .await
        .unwrap_err();
        assert_eq!(e.retry_after, 123);
        assert!(!e.permanent);
        assert!(!e.reason.contains("SECRET"));
        task.abort();
    }
}
