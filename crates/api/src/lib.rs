pub mod alerts;
pub mod billing;
pub mod db;
pub mod geoip;
pub mod inventory;
pub mod node_inventory;
pub mod node_release;
pub mod remnawave;
pub mod secrets;
pub mod telegram;
pub mod traffic;
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, patch, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{AnyPool, Row};
use std::sync::Arc;
use stealthnet_core::{EnrollmentConfig, Rule, Telemetry, hash, now, token};
use tokio::sync::Mutex;
#[derive(Clone)]
pub struct App {
    pub db: AnyPool,
    pub secrets: secrets::Secrets,
    pub http: reqwest::Client,
    pub public_url: String,
    pub password_hash: Arc<String>,
    pub logins: Arc<Mutex<Vec<i64>>>,
    pub sync_lock: Arc<Mutex<()>>,
    pub geoip: geoip::GeoIp,
}
#[derive(Debug)]
pub struct Error(pub StatusCode, pub String);
impl Error {
    pub fn bad(s: impl Into<String>) -> Self {
        Self(StatusCode::BAD_REQUEST, s.into())
    }
    pub fn unauthorized() -> Self {
        Self(StatusCode::UNAUTHORIZED, "Требуется вход в панель".into())
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
impl From<anyhow::Error> for Error {
    fn from(_: anyhow::Error) -> Self {
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Не удалось выполнить операцию. Проверьте состояние сервера.".into(),
        )
    }
}
impl From<sqlx::Error> for Error {
    fn from(_: sqlx::Error) -> Self {
        Self(StatusCode::INTERNAL_SERVER_ERROR, "Ошибка хранилища".into())
    }
}
impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self {
        Self::bad("Некорректные данные")
    }
}
type Result<T> = std::result::Result<T, Error>;
pub fn router(app: App, web: &str, downloads: &str) -> Router {
    let private = Router::new()
        .route("/snapshot", get(snapshot))
        .route("/inventory-summary", get(inventory::summary))
        .route("/traffic-summary", get(traffic::summary))
        .route("/inventory/{kind}", get(inventory::list))
        .route("/users/{id}/detail", get(inventory::detail))
        .route("/enrollments", post(enroll))
        .route("/node-image/latest", get(node_release::latest))
        .route("/enrollments/{id}", get(enrollment_status))
        .route("/nodes/{id}/billing", patch(billing_update))
        .route("/alert-rules/{id}", put(rule_save))
        .route("/complaints", post(complaint_create))
        .route("/complaints/{id}", patch(complaint_update))
        .route("/incidents/{id}/ack", post(ack))
        .route("/settings/telegram", get(tg_get).put(tg_save))
        .route("/settings/telegram/validate", post(tg_validate))
        .route("/settings/telegram/link", post(tg_link))
        .route("/settings/telegram/link/check", post(tg_poll))
        .route("/settings/telegram/test", post(tg_test))
        .route("/settings/remnawave", get(remna_get).put(remna_save))
        .route("/settings/remnawave/sync", post(remna_sync))
        .route_layer(middleware::from_fn_with_state(app.clone(), authorized));
    let api = Router::new()
        .route("/health", get(health))
        .route("/session", get(session).post(login).delete(logout))
        .route("/agent/register", post(register))
        .route("/agent/telemetry", post(telemetry))
        .merge(private)
        .fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error":"Endpoint not found"})),
            )
        });
    Router::new()
        .nest("/api", api)
        .route(
            "/xray-collector.py",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/x-python")],
                    include_str!("../../../scripts/xray_collector.py"),
                )
            }),
        )
        .route(
            "/install-agent.sh",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/x-shellscript")],
                    include_str!("../../../scripts/install-agent.sh"),
                )
            }),
        )
        .nest_service("/downloads", tower_http::services::ServeDir::new(downloads))
        .fallback_service(tower_http::services::ServeDir::new(web).not_found_service(
            tower_http::services::ServeFile::new(format!("{web}/index.html")),
        ))
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(app.clone(), same_origin))
        .layer(tower_http::compression::CompressionLayer::new())
        .with_state(app)
}
async fn same_origin(State(app): State<App>, req: Request, next: Next) -> Response {
    if !["GET", "HEAD", "OPTIONS"].contains(&req.method().as_str())
        && !req.uri().path().starts_with("/api/agent/")
    {
        if let Some(origin) = req
            .headers()
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
        {
            let local = app.public_url.starts_with("http://127.0.0.1")
                && ["http://127.0.0.1:5178", "http://localhost:5178"].contains(&origin);
            if origin != app.public_url && !local {
                return Error(StatusCode::FORBIDDEN, "Источник запроса не разрешён".into())
                    .into_response();
            }
        }
        if req
            .headers()
            .get("sec-fetch-site")
            .is_some_and(|v| v == "cross-site")
        {
            return Error(StatusCode::FORBIDDEN, "Межсайтовый запрос отклонён".into())
                .into_response();
        }
    }
    let mut response = next.run(req).await;
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    response
        .headers_mut()
        .insert("referrer-policy", "same-origin".parse().unwrap());
    response
        .headers_mut()
        .insert("x-frame-options", "DENY".parse().unwrap());
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}
fn cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|v| v.trim().strip_prefix("sn_session=").map(str::to_owned))
}
async fn authenticated(app: &App, headers: &HeaderMap) -> Result<()> {
    let t = cookie(headers).ok_or_else(Error::unauthorized)?;
    if sqlx::query("SELECT hash FROM sessions WHERE hash=$1 AND expires>$2")
        .bind(hash(&t))
        .bind(now())
        .fetch_optional(&app.db)
        .await?
        .is_none()
    {
        return Err(Error::unauthorized());
    }
    Ok(())
}
async fn authorized(State(app): State<App>, req: Request, next: Next) -> Response {
    match authenticated(&app, req.headers()).await {
        Ok(()) => next.run(req).await,
        Err(e) => e.into_response(),
    }
}
async fn health(State(app): State<App>) -> Result<Json<Value>> {
    sqlx::query("SELECT 1").execute(&app.db).await?;
    Ok(Json(
        json!({"status":"ok","version":env!("CARGO_PKG_VERSION")}),
    ))
}
async fn session(State(app): State<App>, headers: HeaderMap) -> Result<Json<Value>> {
    authenticated(&app, &headers).await?;
    Ok(Json(json!({"authenticated":true})))
}
#[derive(Deserialize)]
struct Login {
    password: String,
}
async fn login(State(app): State<App>, Json(input): Json<Login>) -> Result<Response> {
    let mut attempts = app.logins.lock().await;
    attempts.retain(|t| *t > now() - 60000);
    if attempts.len() >= 10 {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Слишком много попыток. Подождите минуту.".into(),
        ));
    }
    attempts.push(now());
    drop(attempts);
    if input.password.len() > 1024 {
        return Err(Error::unauthorized());
    }
    let password_hash = app.password_hash.clone();
    let valid = tokio::task::spawn_blocking(move || {
        PasswordHash::new(&password_hash).ok().is_some_and(|h| {
            Argon2::default()
                .verify_password(input.password.as_bytes(), &h)
                .is_ok()
        })
    })
    .await
    .unwrap_or(false);
    if !valid {
        return Err(Error(StatusCode::UNAUTHORIZED, "Неверный пароль".into()));
    }
    let secret = token();
    sqlx::query("INSERT INTO sessions(hash,expires) VALUES($1,$2)")
        .bind(hash(&secret))
        .bind(now() + 12 * 3600000)
        .execute(&app.db)
        .await?;
    let secure = if app.public_url.starts_with("https:") {
        "; Secure"
    } else {
        ""
    };
    Ok((
        [(
            header::SET_COOKIE,
            format!(
                "sn_session={secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200{secure}"
            ),
        )],
        Json(json!({"authenticated":true})),
    )
        .into_response())
}
async fn logout(State(app): State<App>, headers: HeaderMap) -> Result<Response> {
    if let Some(c) = cookie(&headers) {
        sqlx::query("DELETE FROM sessions WHERE hash=$1")
            .bind(hash(&c))
            .execute(&app.db)
            .await?;
    }
    Ok((
        [(
            header::SET_COOKIE,
            "sn_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/",
        )],
        StatusCode::NO_CONTENT,
    )
        .into_response())
}
async fn snapshot(State(app): State<App>) -> Result<Json<Value>> {
    let mut connections = db::records(&app.db, "connection", 1000).await?;
    inventory::enrich_users(&app.db, &mut connections).await?;
    let geoip = app.geoip.enrich(&mut connections);
    let nodes = db::nodes(&app.db).await?;
    let mut metrics = inventory::online_metrics(&app.db, &nodes).await?;
    let rows = sqlx::query(
        "SELECT node_id,payload FROM telemetry WHERE time>$1 ORDER BY time DESC LIMIT 2000",
    )
    .bind(now() - 86400000)
    .fetch_all(&app.db)
    .await?;
    for row in rows.iter().rev() {
        let t: Telemetry = serde_json::from_str(&row.get::<String, _>("payload"))?;
        let id: String = row.get("node_id");
        for (m, v) in [
            ("cpu", t.cpu),
            ("ram", t.ram),
            ("disk", t.disk),
            ("rx", t.rx_bytes_per_sec * 8. / 1e9),
            ("tx", t.tx_bytes_per_sec * 8. / 1e9),
        ] {
            metrics.push(json!({"node_id":id,"time":t.time,"metric":m,"value":v}));
        }
    }
    Ok(Json(
        json!({"mode":"live","updated_at":now(),"nodes":nodes,"users":db::records(&app.db,"user",5000).await?,"devices":db::records(&app.db,"device",5000).await?,"connections":connections,"geoip":geoip,"detections":db::records(&app.db,"detection",1000).await?,"incidents":db::records(&app.db,"incident",1000).await?,"complaints":db::records(&app.db,"complaint",1000).await?,"rules":db::records(&app.db,"rule",1000).await?,"deliveries":telegram::history(&app).await?,"metrics":metrics}),
    ))
}
async fn enroll(
    State(app): State<App>,
    Json(config): Json<EnrollmentConfig>,
) -> Result<Json<Value>> {
    config.validate().map_err(Error::bad)?;
    let id = uuid::Uuid::new_v4().to_string();
    let secret = token();
    let node_id = uuid::Uuid::new_v4().to_string();
    let expires = now() + 900000;
    let sealed = app.secrets.seal(&serde_json::to_string(&config)?)?;
    sqlx::query(
        "INSERT INTO enrollments(id,hash,expires,used,config,node_id) VALUES($1,$2,$3,0,$4,$5)",
    )
    .bind(&id)
    .bind(hash(&secret))
    .bind(expires)
    .bind(sealed)
    .bind(node_id)
    .execute(&app.db)
    .await?;
    let command = format!(
        "curl -fsSL '{}/install-agent.sh' -o /tmp/stealthnet-agent-install.sh && sudo bash /tmp/stealthnet-agent-install.sh --panel '{}' --token '{}'",
        app.public_url, app.public_url, secret
    );
    Ok(Json(json!({"id":id,"expires":expires,"command":command})))
}
async fn enrollment_status(State(app): State<App>, Path(id): Path<String>) -> Result<Json<Value>> {
    let r = sqlx::query("SELECT used,node_id,expires FROM enrollments WHERE id=$1")
        .bind(id)
        .fetch_optional(&app.db)
        .await?
        .ok_or_else(|| Error(StatusCode::NOT_FOUND, "Регистрация не найдена".into()))?;
    let used = r.get::<i64, _>("used") != 0;
    let id: String = r.get("node_id");
    let online = sqlx::query("SELECT last_seen FROM nodes WHERE id=$1 AND last_seen>0")
        .bind(&id)
        .fetch_optional(&app.db)
        .await?
        .is_some();
    Ok(Json(
        json!({"used":used,"node_id":if online{Some(id)}else{None},"expires":r.get::<i64,_>("expires")}),
    ))
}
#[derive(Deserialize)]
struct Register {
    token: String,
}
async fn register(State(app): State<App>, Json(body): Json<Register>) -> Result<Json<Value>> {
    if body.token.len() != 64 {
        return Err(Error::unauthorized());
    }
    let mut tx = app.db.begin().await?;
    let r=sqlx::query("UPDATE enrollments SET used=1 WHERE hash=$1 AND used=0 AND expires>$2 RETURNING config,node_id").bind(hash(&body.token)).bind(now()).fetch_optional(&mut *tx).await?.ok_or_else(||Error::bad("Токен регистрации истёк или уже использован"))?;
    let conf: EnrollmentConfig =
        serde_json::from_str(&app.secrets.open(&r.get::<String, _>("config"))?)?;
    let id: String = r.get("node_id");
    let credential = token();
    let node = json!({"id":id,"name":conf.name,"country":conf.country,"code":conf.code,"city":conf.city,"lat":conf.lat,"lon":conf.lon,"group":conf.group,"cpu":null,"ram":null,"disk":null,"rx":null,"tx":null,"users":null,"status":"offline","ip":if conf.address.is_empty(){"—"}else{&conf.address},"agent":"—","last_seen":0,"provider":conf.billing.provider,"expires_at":conf.billing.expires_at,"monthly_cost":conf.billing.monthly_cost,"currency":conf.billing.currency});
    sqlx::query("INSERT INTO nodes(id,secret_hash,payload,last_seen) VALUES($1,$2,$3,0)")
        .bind(&id)
        .bind(hash(&credential))
        .bind(node.to_string())
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE enrollments SET config='' WHERE node_id=$1")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"panel":app.public_url,"node_id":id,"credential":credential,"enrollment":conf}),
    ))
}
fn bearer(headers: &HeaderMap) -> Result<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| v.len() == 64)
        .ok_or_else(Error::unauthorized)
}
async fn telemetry(
    State(app): State<App>,
    headers: HeaderMap,
    Json(sample): Json<Telemetry>,
) -> Result<Json<Value>> {
    sample.validate(now()).map_err(Error::bad)?;
    let secret = bearer(&headers)?;
    let r = sqlx::query("SELECT id,payload,last_seen FROM nodes WHERE secret_hash=$1")
        .bind(hash(secret))
        .fetch_optional(&app.db)
        .await?
        .ok_or_else(Error::unauthorized)?;
    let id: String = r.get("id");
    let seen: i64 = r.get("last_seen");
    let mut node: Value = serde_json::from_str(&r.get::<String, _>("payload"))?;
    let mut tx = app.db.begin().await?;
    let mut metric_sample = sample.clone();
    metric_sample.events.clear();
    let inserted=sqlx::query("INSERT INTO telemetry(id,node_id,time,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING").bind(format!("{}:{}",id,sample.id)).bind(&id).bind(sample.time).bind(serde_json::to_string(&metric_sample)?).execute(&mut *tx).await?.rows_affected()>0;
    if inserted && sample.time >= seen {
        for (k, v) in [
            ("cpu", sample.cpu),
            ("ram", sample.ram),
            ("disk", sample.disk),
            ("rx", sample.rx_bytes_per_sec * 8. / 1e9),
            ("tx", sample.tx_bytes_per_sec * 8. / 1e9),
        ] {
            node[k] = json!(v)
        }
        node["last_seen"] = json!(sample.time);
        node["agent"] = json!(sample.version);
        node["hostname"] = json!(sample.hostname);
        if let Some(c) = &sample.collector {
            node["collector_time"] = json!(c.time);
            node["collector_connections"] = json!(c.connections);
            node["collector_sockets"] = json!(c.socket_counters);
            node["collector_torrents"] = json!(c.torrent_detection);
            node["collector_sessions"] = json!(c.tracked_sessions);
        }
        node["addresses"] = json!(sample.addresses);
        if node["ip"]
            .as_str()
            .is_none_or(|ip| ip.parse::<std::net::IpAddr>().is_err())
        {
            if let Some(ip) = sample
                .addresses
                .iter()
                .find(|ip| ip.parse::<std::net::Ipv4Addr>().is_ok())
                .or_else(|| sample.addresses.first())
            {
                node["ip"] = json!(ip);
            }
        }
        node["status"] = json!(
            if sample.cpu > 85. || sample.ram > 90. || sample.disk > 90. {
                "warning"
            } else {
                "online"
            }
        );
        sqlx::query("UPDATE nodes SET payload=$1,last_seen=$2 WHERE id=$3 AND last_seen<=$2")
            .bind(node.to_string())
            .bind(sample.time)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    if inserted {
        for e in &sample.events {
            let event_id = format!("{id}:{}", e.id);
            let mut payload = json!({"id":event_id,"user":e.user.as_deref().unwrap_or("Не определён"),"ip":e.ip,"region":"Не определён","node":node["name"],"node_id":id,"protocol":if e.kind=="detection"{"BitTorrent"}else{e.protocol.as_deref().unwrap_or("Не определён")},"evidence":e.evidence,"status":"new","time":e.time,"last_seen":e.time,"source":"Агент · журнал подключений","confidence":"Сигнал"});
            if e.kind == "connection" {
                payload["first_seen"] = json!(e.first_seen);
                payload["last_activity"] = json!(e.last_activity);
                payload["source_port"] = json!(e.source_port);
                payload["bytes_rx"] = json!(e.bytes_rx);
                payload["bytes_tx"] = json!(e.bytes_tx);
                payload["rtt_ms"] = json!(e.rtt_ms);
                payload["status"] = json!(e.status.as_deref().unwrap_or("observed"));
                payload["duration_seconds"] =
                    json!(e.first_seen.map(|start| (e.time - start).max(0) / 1000));
                payload["traffic"] = json!(
                    e.bytes_rx
                        .zip(e.bytes_tx)
                        .map(|(rx, tx)| (rx + tx) as f64 / 1e6)
                );
                payload["traffic_scope"] = json!(if e.bytes_rx.is_some() {
                    "TCP-канал · с начала наблюдения"
                } else {
                    "Счётчики канала недоступны"
                });
                sqlx::query("INSERT INTO records(kind,id,payload,time) VALUES($1,$2,$3,$4) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,time=excluded.time WHERE records.time<=excluded.time")
                    .bind(&e.kind).bind(&event_id).bind(payload.to_string()).bind(e.time).execute(&app.db).await?;
                continue;
            }
            let inserted=sqlx::query("INSERT INTO records(kind,id,payload,time) VALUES($1,$2,$3,$4) ON CONFLICT(kind,id) DO NOTHING").bind(&e.kind).bind(&event_id).bind(payload.to_string()).bind(e.time).execute(&app.db).await?.rows_affected()>0;
            if inserted && e.kind == "detection" {
                alerts::event(
                    &app,
                    "detection",
                    &format!(
                        "Признак BitTorrent: {}",
                        node["name"].as_str().unwrap_or(&id)
                    ),
                    Some(&id),
                )
                .await?;
            }
        }
    }
    Ok(Json(json!({"accepted":true,"duplicate":!inserted})))
}
async fn rule_save(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(rule): Json<Rule>,
) -> Result<Json<Value>> {
    rule.validate().map_err(Error::bad)?;
    if id != rule.id {
        return Err(Error::bad("ID правила не совпадает"));
    }
    db::save_record(&app.db, "rule", &id, &serde_json::to_value(&rule)?, now()).await?;
    Ok(Json(json!({"saved":true})))
}
async fn complaint_create(
    State(app): State<App>,
    Json(mut body): Json<Value>,
) -> Result<Json<Value>> {
    if body["subject"]
        .as_str()
        .is_none_or(|s| s.is_empty() || s.len() > 250)
        || body["body"]
            .as_str()
            .is_none_or(|s| s.is_empty() || s.len() > 10000)
        || body["provider"]
            .as_str()
            .is_none_or(|s| s.is_empty() || s.len() > 250)
    {
        return Err(Error::bad("Укажите тему, отправителя и текст жалобы"));
    }
    if body["ip"]
        .as_str()
        .is_none_or(|v| v.parse::<std::net::IpAddr>().is_err())
    {
        return Err(Error::bad("Неверный IP-адрес"));
    }
    let id = format!("AB-{}", uuid::Uuid::new_v4().simple());
    body["id"] = json!(id);
    body["time"] = json!(now());
    body["status"] = json!("new");
    db::save_record(&app.db, "complaint", &id, &body, now()).await?;
    alerts::event(
        &app,
        "complaint",
        &format!(
            "Новая внешняя жалоба {id}\n{}",
            body["subject"].as_str().unwrap_or_default()
        ),
        None,
    )
    .await?;
    Ok(Json(body))
}
async fn complaint_update(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>> {
    if !["new", "reviewed", "closed"].contains(&body["status"].as_str().unwrap_or_default())
        || body["comment"].as_str().is_none_or(|s| s.len() > 1000)
    {
        return Err(Error::bad("Неверный статус или комментарий"));
    }
    let r = sqlx::query("SELECT payload FROM records WHERE kind='complaint' AND id=$1")
        .bind(&id)
        .fetch_optional(&app.db)
        .await?
        .ok_or_else(|| Error(StatusCode::NOT_FOUND, "Жалоба не найдена".into()))?;
    let mut p: Value = serde_json::from_str(&r.get::<String, _>("payload"))?;
    p["status"] = body["status"].clone();
    p["comment"] = body["comment"].clone();
    p["updated_at"] = json!(now());
    db::save_record(&app.db, "complaint", &id, &p, now()).await?;
    Ok(Json(p))
}
async fn ack(State(app): State<App>, Path(id): Path<String>) -> Result<Json<Value>> {
    let r = sqlx::query("SELECT payload FROM records WHERE kind='incident' AND id=$1")
        .bind(&id)
        .fetch_optional(&app.db)
        .await?
        .ok_or_else(|| Error(StatusCode::NOT_FOUND, "Инцидент не найден".into()))?;
    let mut p: Value = serde_json::from_str(&r.get::<String, _>("payload"))?;
    p["acknowledged"] = json!(true);
    db::save_record(&app.db, "incident", &id, &p, now()).await?;
    Ok(Json(p))
}
async fn tg_get(State(app): State<App>) -> Result<Json<Value>> {
    let c = telegram::config(&app).await?;
    Ok(Json(
        json!({"has_token":!c.token.is_empty(),"username":c.username,"chat_id":c.chat_id,"events":c.events,"enabled":c.enabled}),
    ))
}
async fn tg_save(State(app): State<App>, Json(body): Json<Value>) -> Result<Json<Value>> {
    let mut c = telegram::config(&app).await?;
    if let Some(t) = body["token"].as_str() {
        validate_tg_token(t)?;
        c.token = t.into();
        c.username = String::new();
    }
    if let Some(chat) = body["chat_id"].as_str() {
        if !chat.is_empty() && chat.parse::<i64>().is_err() {
            return Err(Error::bad("Chat ID должен быть числом"));
        }
        c.chat_id = chat.into();
    }
    if let Some(events) = body["events"].as_array() {
        c.events = events
            .iter()
            .filter_map(|e| e.as_str().map(str::to_owned))
            .filter(|s| {
                [
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
                .contains(&s.as_str())
            })
            .collect();
    }
    c.enabled = body["enabled"].as_bool().unwrap_or(c.enabled);
    telegram::save(&app, &c).await?;
    Ok(Json(json!({"saved":true})))
}
fn validate_tg_token(t: &str) -> Result<()> {
    let Some((id, secret)) = t.split_once(':') else {
        return Err(Error::bad("Неверный формат токена Telegram"));
    };
    if id.parse::<u64>().is_err()
        || secret.len() < 20
        || secret.len() > 150
        || !secret
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
    {
        return Err(Error::bad("Неверный формат токена Telegram"));
    }
    Ok(())
}
async fn tg_validate(State(app): State<App>, Json(body): Json<Value>) -> Result<Json<Value>> {
    let mut c = telegram::config(&app).await?;
    let t = body["token"].as_str().unwrap_or(&c.token).to_owned();
    validate_tg_token(&t)?;
    let bot = telegram::rpc(&app, &t, "getMe", json!({})).await?;
    if t == c.token {
        c.username = bot["username"].as_str().unwrap_or_default().into();
        telegram::save(&app, &c).await?;
    }
    Ok(Json(json!({"username":bot["username"]})))
}
async fn tg_link(State(app): State<App>) -> Result<Json<Value>> {
    let c = telegram::config(&app).await?;
    if c.token.is_empty() {
        return Err(Error::bad("Сначала сохраните токен бота"));
    }
    let webhook = telegram::rpc(&app, &c.token, "getWebhookInfo", json!({})).await?;
    if webhook["url"].as_str().is_some_and(|s| !s.is_empty()) {
        return Err(Error::bad(
            "У бота настроен webhook. Используйте отдельного бота или укажите Chat ID напрямую.",
        ));
    }
    let code = token()[..32].to_string();
    db::set_setting(
        &app.db,
        "tg_link",
        &json!({"hash":hash(&code),"expires":now()+600000,"offset":0}).to_string(),
    )
    .await?;
    Ok(Json(json!({"code":code})))
}
async fn tg_poll(State(app): State<App>) -> Result<Json<Value>> {
    let _guard = app.sync_lock.lock().await;
    let c = telegram::config(&app).await?;
    let mut link: Value = serde_json::from_str(
        &db::setting(&app.db, "tg_link")
            .await?
            .ok_or_else(|| Error::bad("Создайте новую команду привязки"))?,
    )?;
    if link["expires"].as_i64().unwrap_or(0) < now() {
        return Err(Error::bad("Команда истекла. Создайте новую."));
    }
    let result = telegram::rpc(
        &app,
        &c.token,
        "getUpdates",
        json!({"offset":link["offset"],"timeout":0,"limit":100,"allowed_updates":["message"]}),
    )
    .await?;
    for u in result.as_array().into_iter().flatten() {
        link["offset"] = json!(u["update_id"].as_i64().unwrap_or(0) + 1);
        if let Some(text) = u["message"]["text"].as_str() {
            if let Some(code) = text.strip_prefix("/start ") {
                if json!(hash(code.trim())) == link["hash"] {
                    let chat = u["message"]["chat"]["id"]
                        .as_i64()
                        .ok_or_else(|| Error::bad("Chat ID не найден"))?
                        .to_string();
                    let mut conf = c.clone();
                    conf.chat_id = chat.clone();
                    telegram::save(&app, &conf).await?;
                    db::set_setting(&app.db, "tg_link", "{}").await?;
                    return Ok(Json(json!({"chat_id":chat})));
                }
            }
        }
    }
    db::set_setting(&app.db, "tg_link", &link.to_string()).await?;
    Ok(Json(json!({"chat_id":null})))
}
async fn tg_test(State(app): State<App>) -> Result<Json<Value>> {
    let sent = telegram::queue(
        &app,
        "test",
        "Тестовое уведомление",
        "✅ stealthnet-monitor\nТестовое уведомление. Канал Telegram подключён.",
        None,
        true,
    )
    .await?;
    if !sent {
        return Err(Error::bad("Сохраните токен и привяжите получателя"));
    }
    Ok(Json(json!({"queued":true})))
}
async fn remna_get(State(app): State<App>) -> Result<Json<Value>> {
    let c = remnawave::config(&app).await?;
    Ok(Json(
        json!({"url":c.url,"has_token":!c.token.is_empty(),"last_sync":c.last_sync,"last_error":c.last_error}),
    ))
}
async fn remna_save(State(app): State<App>, Json(body): Json<Value>) -> Result<Json<Value>> {
    let mut c = remnawave::config(&app).await?;
    let url = body["url"]
        .as_str()
        .ok_or_else(|| Error::bad("Нужен адрес Remnawave"))?;
    let u = reqwest::Url::parse(url).map_err(|_| Error::bad("Неверный URL"))?;
    if u.scheme() != "https"
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
    {
        return Err(Error::bad("Нужен HTTPS URL без пароля и параметров"));
    }
    c.url = url.trim_end_matches('/').into();
    if let Some(t) = body["token"].as_str() {
        if t.len() < 10 || t.len() > 4096 {
            return Err(Error::bad("Неверный токен Remnawave"));
        }
        c.token = t.into();
    }
    remnawave::save(&app, &c).await?;
    Ok(Json(json!({"saved":true})))
}
async fn remna_sync(State(app): State<App>) -> Result<Json<Value>> {
    Ok(Json(remnawave::sync(&app).await?))
}

async fn billing_update(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(body): Json<stealthnet_core::Billing>,
) -> Result<Json<Value>> {
    body.validate().map_err(Error::bad)?;
    if !db::nodes(&app.db)
        .await?
        .iter()
        .any(|node| node["id"] == id)
    {
        return Err(Error(StatusCode::NOT_FOUND, "Сервер не найден".into()));
    }
    db::set_setting(
        &app.db,
        &format!("billing:{id}"),
        &serde_json::to_string(&body)?,
    )
    .await?;
    Ok(Json(json!({"saved":true})))
}
