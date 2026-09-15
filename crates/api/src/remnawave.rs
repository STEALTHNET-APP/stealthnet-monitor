use crate::{App, Error, db};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use std::collections::{HashMap, HashSet};
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
    let current = config(app).await?;
    if current.url == c.url && current.token == c.token {
        save(app, &c).await?;
    }
    result
}
async fn sync_nodes_inner(app: &App, c: &Config) -> Result<Vec<Value>, Error> {
    let sync_time = now();
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
        db::save_record(&app.db,"remna_node",&id,&json!({"id":id,"name":n["name"],"address":n["address"],"is_connected":n["isConnected"],"users_online":n["usersOnline"],"country_code":n["countryCode"],"source":"Remnawave"}),sync_time).await?;
    }
    let bucket = sync_time / 60000;
    let mut tx = app.db.begin().await?;
    for n in node_rows {
        let node_id = id(&n["uuid"]).or_else(|| id(&n["id"])).unwrap_or_default();
        if let Some(value) = n["usersOnline"].as_f64().filter(|v| *v >= 0.) {
            let value = if n["isConnected"] == false { 0. } else { value };
            let payload = json!({"node_id":node_id,"value":value});
            sqlx::query("INSERT INTO records(kind,id,payload,time) VALUES('node_online',$1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,time=excluded.time")
                .bind(format!("{node_id}:{bucket}")).bind(payload.to_string()).bind(sync_time).execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;
    sqlx::query("DELETE FROM records WHERE kind='remna_node' AND time<$1")
        .bind(sync_time)
        .execute(&app.db)
        .await?;
    Ok(node_rows.clone())
}
pub async fn sync_nodes(app: &App) -> Result<(), Error> {
    let c = config(app).await?;
    if !c.url.is_empty() && !c.token.is_empty() {
        sync_nodes_inner(app, &c).await?;
    }
    Ok(())
}
fn rows<'a>(page: &'a Value, key: &str) -> Result<&'a Vec<Value>, Error> {
    page.as_array()
        .or_else(|| page[key].as_array())
        .ok_or_else(|| Error::bad(format!("Remnawave: неподдерживаемый формат {key}")))
}
fn id(value: &Value) -> Option<String> {
    value
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .or_else(|| value.as_i64().map(|n| n.to_string()))
}
fn user_payload(u: &Value, nodes: &[Value], sync_time: i64) -> Result<Value, Error> {
    let id = id(&u["uuid"])
        .or_else(|| id(&u["id"]))
        .ok_or_else(|| Error::bad("Remnawave: у пользователя нет ID"))?;
    let traffic = u.get("userTraffic").filter(|v| v.is_object()).unwrap_or(u);
    let field = |key: &str| {
        traffic
            .get(key)
            .filter(|v| !v.is_null())
            .or_else(|| u.get(key))
            .cloned()
            .unwrap_or(Value::Null)
    };
    let node_id = field("lastConnectedNodeUuid");
    let node = nodes
        .iter()
        .find(|n| n["uuid"] == node_id)
        .and_then(|n| n["name"].as_str())
        .unwrap_or("—");
    Ok(
        json!({"id":id,"remna_id":u["id"],"name":u["username"],"status":match u["status"].as_str(){Some("ACTIVE")=>"Учётная запись активна",Some("DISABLED")=>"Отключена",Some("EXPIRED")=>"Истекла",_=>"Не определён"},"traffic":field("usedTrafficBytes").as_f64().map(|v|v/1e9),"node":node,"region":"—","last_seen":timestamp(&field("onlineAt")),"source":"Remnawave API","synced_at":sync_time}),
    )
}
async fn sync_inner(app: &App, c: &Config) -> Result<Value, Error> {
    let sync_time = now();
    let node_rows = sync_nodes_inner(app, c).await?;
    let mut start = 0;
    let mut users = HashSet::new();
    loop {
        let page = get(app, c, &format!("/users?start={start}&size=500")).await?;
        let batch = rows(&page, "users")?;
        if batch.is_empty() && page["total"].as_u64().is_some_and(|n| n > start as u64) {
            return Err(Error::bad(
                "Remnawave вернула неполную страницу пользователей",
            ));
        }
        let mut previous = HashMap::new();
        if !batch.is_empty() {
            let ids = batch
                .iter()
                .filter_map(|u| id(&u["uuid"]).or_else(|| id(&u["id"])))
                .collect::<Vec<_>>();
            if !ids.is_empty() {
                let placeholders = (1..=ids.len())
                    .map(|n| format!("${n}"))
                    .collect::<Vec<_>>()
                    .join(",");
                let sql = format!(
                    "SELECT id,payload FROM records WHERE kind='user' AND id IN ({placeholders})"
                );
                let mut query = sqlx::query(&sql);
                for id in &ids {
                    query = query.bind(id);
                }
                for r in query.fetch_all(&app.db).await? {
                    let p: Value = serde_json::from_str(&r.get::<String, _>("payload"))?;
                    previous.insert(r.get::<String, _>("id"), p["traffic"].clone());
                }
            }
        }
        let before_count = users.len();
        let mut tx = app.db.begin().await?;
        for u in batch {
            let payload = user_payload(u, &node_rows, sync_time)?;
            let id = payload["id"].as_str().unwrap();
            if !users.insert(id.to_owned()) {
                continue;
            }
            sqlx::query("INSERT INTO records(kind,id,payload,time) VALUES('user',$1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,time=excluded.time")
                .bind(id).bind(payload.to_string()).bind(sync_time).execute(&mut *tx).await?;
            if payload["traffic"].is_number() && previous.get(id) != Some(&payload["traffic"]) {
                let point = json!({"user":id,"time":sync_time,"value":payload["traffic"]});
                sqlx::query("INSERT INTO records(kind,id,payload,time) VALUES('user_traffic',$1,$2,$3) ON CONFLICT(kind,id) DO NOTHING")
                    .bind(format!("{id}:{sync_time}")).bind(point.to_string()).bind(sync_time).execute(&mut *tx).await?;
            }
        }
        tx.commit().await?;
        if !batch.is_empty() && users.len() == before_count {
            return Err(Error::bad(
                "Remnawave повторяет страницу пользователей; прежние записи сохранены",
            ));
        }
        start += batch.len();
        if batch.is_empty()
            || page["total"].as_u64().is_some_and(|n| start as u64 >= n)
            || (page["total"].is_null() && batch.len() < 500)
        {
            break;
        }
        if start >= 1_000_000 {
            return Err(Error::bad("Превышен предел импорта пользователей"));
        }
    }
    if users.len() == start {
        sqlx::query("DELETE FROM records WHERE kind='user' AND time<$1")
            .bind(sync_time)
            .execute(&app.db)
            .await?;
    }
    // Optional API capability: failure preserves cached devices and reports an explicit reason.
    let devices = sync_devices(app, c).await;
    let status = json!({"nodes":node_rows.len(),"users":users.len(),"devices":devices.as_ref().ok(),"hwid_available":devices.is_ok(),"hwid_error":devices.as_ref().err().map(|e| &e.1),"synced_at":now()});
    db::set_setting(&app.db, "remnawave_capabilities", &status.to_string()).await?;
    Ok(status)
}
async fn sync_devices(app: &App, c: &Config) -> Result<usize, Error> {
    let sync_time = now();
    let mut seen = HashSet::new();
    let mut start = 0;
    loop {
        let page = get(app, c, &format!("/hwid/devices?start={start}&size=500")).await?;
        let batch = rows(&page, "devices")?;
        if batch.is_empty() && page["total"].as_u64().is_some_and(|n| n > start as u64) {
            return Err(Error::bad("Remnawave вернула неполную страницу устройств"));
        }
        let before_count = seen.len();
        let mut tx = app.db.begin().await?;
        for d in batch {
            let hwid =
                id(&d["hwid"]).ok_or_else(|| Error::bad("Remnawave: устройство без HWID"))?;
            let user = id(&d["userUuid"])
                .or_else(|| id(&d["userId"]))
                .ok_or_else(|| Error::bad("Remnawave: устройство без пользователя"))?;
            let id = format!("{user}:{hwid}");
            if !seen.insert(id.clone()) {
                continue;
            }
            let payload = json!({"id":id,"user":user,"device":d["deviceModel"].as_str().unwrap_or("Неизвестно"),"os":d["platform"].as_str().unwrap_or("Неизвестно"),"client":d["userAgent"].as_str().unwrap_or("Неизвестно"),"hwid":hwid,"last_seen":timestamp(&d["updatedAt"]),"source":"Remnawave HWID"});
            sqlx::query("INSERT INTO records(kind,id,payload,time) VALUES('device',$1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,time=excluded.time")
                .bind(&id).bind(payload.to_string()).bind(sync_time).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        if !batch.is_empty() && seen.len() == before_count {
            return Err(Error::bad(
                "Remnawave повторяет страницу устройств; прежние записи сохранены",
            ));
        }
        start += batch.len();
        if batch.is_empty()
            || page["total"].as_u64().is_some_and(|n| start as u64 >= n)
            || (page["total"].is_null() && batch.len() < 500)
        {
            break;
        }
        if start >= 1_000_000 {
            return Err(Error::bad("Превышен предел импорта устройств"));
        }
    }
    // Only this monitor's cached copies are removed; upstream requests remain GET-only.
    if seen.len() == start {
        sqlx::query("DELETE FROM records WHERE kind='device' AND time<$1")
            .bind(sync_time)
            .execute(&app.db)
            .await?;
    }
    Ok(seen.len())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn current_and_legacy_user_shapes_are_equivalent_and_exclude_credentials() {
        let base = json!({"uuid":"u1","id":123,"username":"Example","status":"ACTIVE","usedTrafficBytes":123000000,"onlineAt":"2026-09-15T12:00:00Z","vlessUuid":"secret","subscriptionUrl":"secret"});
        let mut current = base.clone();
        current["userTraffic"] =
            json!({"usedTrafficBytes":123000000,"onlineAt":"2026-09-15T12:00:00Z"});
        let a = user_payload(&base, &[], 42).unwrap();
        assert_eq!(a, user_payload(&current, &[], 42).unwrap());
        assert_eq!(a["traffic"], 0.123);
        assert!(!a.to_string().contains("secret"));
        assert!(rows(&json!({"devices":[]}), "devices").is_ok());
        assert!(rows(&json!([]), "devices").is_ok());
        assert!(rows(&json!({}), "devices").is_err());
    }
}
