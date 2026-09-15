use crate::{App, Error, db};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use stealthnet_core::now;
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Config {
    pub url: String,
    pub token: String,
    #[serde(default)]
    pub last_sync: i64,
    #[serde(default)]
    pub last_error: String,
}
pub async fn config(app: &App) -> anyhow::Result<Config> {
    match db::setting(&app.db, "remnawave").await? {
        Some(v) => Ok(serde_json::from_str(&app.secrets.open(&v)?)?),
        None => Ok(Config::default()),
    }
}
pub async fn save(app: &App, c: &Config) -> anyhow::Result<()> {
    db::set_setting(
        &app.db,
        "remnawave",
        &app.secrets.seal(&serde_json::to_string(c)?)?,
    )
    .await
}
fn timestamp(v: &Value) -> Value {
    v.as_str()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| json!(d.timestamp_millis()))
        .unwrap_or(Value::Null)
}
async fn get(app: &App, c: &Config, path: &str) -> Result<Value, Error> {
    let base = if c.url.ends_with("/api") {
        c.url.clone()
    } else {
        format!("{}/api", c.url)
    };
    let response = app
        .http
        .get(format!("{base}{path}"))
        .bearer_auth(&c.token)
        .send()
        .await
        .map_err(|_| Error::bad("Remnawave не отвечает"))?;
    if !response.status().is_success() {
        return Err(Error::bad(format!(
            "Remnawave: HTTP {}",
            response.status().as_u16()
        )));
    }
    let raw: Value = response
        .json()
        .await
        .map_err(|_| Error::bad("Remnawave вернула некорректный JSON"))?;
    Ok(raw.get("response").cloned().unwrap_or(raw))
}
pub async fn sync(app: &App) -> Result<Value, Error> {
    let _guard = app.sync_lock.lock().await;
    let mut c = config(app).await?;
    if c.url.is_empty() || c.token.is_empty() {
        return Ok(json!({"nodes":0,"users":0,"configured":false}));
    }
    let result = sync_inner(app, &c).await;
    match &result {
        Ok(_) => {
            c.last_sync = now();
            c.last_error.clear()
        }
        Err(e) => c.last_error = e.1.clone(),
    }
    save(app, &c).await?;
    result
}
async fn sync_inner(app: &App, c: &Config) -> Result<Value, Error> {
    let nodes = get(app, c, "/nodes").await?;
    let node_rows = nodes
        .as_array()
        .or_else(|| nodes["nodes"].as_array())
        .ok_or_else(|| Error::bad("Формат нод Remnawave не поддерживается"))?;
    for n in node_rows {
        let id = n["uuid"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| n["id"].as_i64().map(|n| n.to_string()))
            .ok_or_else(|| Error::bad("Remnawave: у ноды нет идентификатора"))?;
        db::save_record(&app.db,"remna_node",&id,&json!({"id":id,"name":n["name"],"address":n["address"],"is_connected":n["isConnected"],"users_online":n["usersOnline"],"country_code":n["countryCode"],"source":"Remnawave"}),now()).await?;
    }
    let mut start = 0;
    let mut users = 0;
    let sync_time = now();
    loop {
        let page = get(app, c, &format!("/users?start={start}&size=500")).await?;
        let rows = page["users"]
            .as_array()
            .ok_or_else(|| Error::bad("Формат пользователей Remnawave не поддерживается"))?;
        for u in rows {
            let id = u["uuid"]
                .as_str()
                .map(str::to_owned)
                .or_else(|| u["id"].as_i64().map(|n| n.to_string()))
                .ok_or_else(|| Error::bad("Remnawave: у пользователя нет ID"))?;
            let traffic = u.get("userTraffic").unwrap_or(u);
            let node_id = traffic["lastConnectedNodeUuid"]
                .as_str()
                .unwrap_or_default();
            let node_name = node_rows
                .iter()
                .find(|n| n["uuid"] == node_id)
                .and_then(|n| n["name"].as_str())
                .unwrap_or("—");
            let payload = json!({"id":id,"name":u["username"],"status":match u["status"].as_str(){Some("ACTIVE")=>"Учётная запись активна",Some("DISABLED")=>"Отключена",Some("EXPIRED")=>"Истекла",_=>"Не определён"},"connections":null,"devices":null,"traffic":traffic["usedTrafficBytes"].as_f64().map(|v|v/1e9),"node":node_name,"region":"—","last_seen":timestamp(&traffic["onlineAt"]),"source":"Remnawave API","synced_at":sync_time});
            db::save_record(&app.db, "user", &id, &payload, sync_time).await?;
        }
        users += rows.len();
        if rows.len() < 500 {
            break;
        }
        start += 500;
        if start >= 100000 {
            return Err(Error::bad(
                "Превышен лимит синхронизации в 100 000 пользователей",
            ));
        }
    }
    // HWID is optional on supported Remnawave versions. Failure is exposed, never converted to invented devices.
    let hwid_result = get(app, c, "/hwid/devices?start=0&size=500").await;
    let mut devices = 0;
    if let Ok(page) = &hwid_result {
        if let Some(rows) = page["devices"].as_array() {
            for d in rows {
                let hwid = d["hwid"].as_str().unwrap_or_default();
                let user = d["userUuid"]
                    .as_str()
                    .map(str::to_owned)
                    .or_else(|| d["userId"].as_i64().map(|n| n.to_string()))
                    .unwrap_or_default();
                let id = format!("{user}:{hwid}");
                let payload = json!({"id":id,"user":user,"device":d["deviceModel"].as_str().unwrap_or("Неизвестно"),"os":d["platform"].as_str().unwrap_or("Неизвестно"),"client":d["userAgent"].as_str().unwrap_or("Неизвестно"),"hwid":hwid,"last_seen":timestamp(&d["updatedAt"]),"source":"Remnawave HWID"});
                db::save_record(&app.db, "device", &id, &payload, now()).await?;
                devices += 1;
            }
        }
    }
    // Delete users only after every page was received successfully.
    sqlx::query("DELETE FROM records WHERE kind='user' AND time<$1")
        .bind(sync_time)
        .execute(&app.db)
        .await?;
    Ok(
        json!({"nodes":node_rows.len(),"users":users,"devices":devices,"hwid_available":hwid_result.is_ok(),"hwid_page_limit":500}),
    )
}
