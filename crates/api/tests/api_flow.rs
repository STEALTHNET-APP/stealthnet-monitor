use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use std::sync::Arc;
use stealthnet_api::{App, alerts, db, router, secrets::Secrets};
use stealthnet_core::{Telemetry, now};
use tokio::sync::Mutex;
use tower::ServiceExt;
async fn app() -> App {
    App {
        db: db::connect("sqlite::memory:").await.unwrap(),
        secrets: Secrets::new(&Secrets::generate()).unwrap(),
        http: reqwest::Client::new(),
        public_url: "https://monitor.example.com".into(),
        password_hash: Arc::new(String::new()),
        logins: Arc::new(Mutex::new(vec![])),
        sync_lock: Arc::new(Mutex::new(())),
    }
}
async fn request(
    router: &Router,
    method: &str,
    path: &str,
    body: Value,
    cookie: Option<&str>,
    bearer: Option<&str>,
) -> (StatusCode, Value) {
    let mut b = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if let Some(c) = cookie {
        b = b.header("cookie", format!("sn_session={c}"))
    }
    if let Some(t) = bearer {
        b = b.header("authorization", format!("Bearer {t}"))
    }
    let r = router
        .clone()
        .oneshot(b.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = r.status();
    let bytes = r.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
async fn admin(a: &App) -> String {
    let token = stealthnet_core::token();
    sqlx::query("INSERT INTO sessions(hash,expires) VALUES($1,$2)")
        .bind(stealthnet_core::hash(&token))
        .bind(now() + 100000)
        .execute(&a.db)
        .await
        .unwrap();
    token
}
fn enrollment() -> Value {
    json!({"name":"test-node","mode":"existing","country":"Test","code":"xx","city":"Lab","lat":50.,"lon":8.,"group":"test"})
}
fn sample(cpu: f64) -> Telemetry {
    Telemetry {
        id: uuid::Uuid::new_v4().to_string(),
        time: now(),
        cpu,
        ram: 30.,
        disk: 25.,
        rx_bytes_per_sec: 125000.,
        tx_bytes_per_sec: 125000.,
        hostname: "test-node".into(),
        version: "0.1.0".into(),
        events: vec![],
    }
}
#[tokio::test]
async fn enrollment_is_atomic_and_metrics_are_idempotent() {
    let app = app().await;
    let router = router(app.clone(), "web/dist", "dist/downloads");
    let (status, _) = request(&router, "GET", "/api/snapshot", Value::Null, None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let session = admin(&app).await;
    let (s, e) = request(
        &router,
        "POST",
        "/api/enrollments",
        enrollment(),
        Some(&session),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let command = e["command"].as_str().unwrap();
    let token = command
        .split("--token '")
        .nth(1)
        .unwrap()
        .trim_end_matches('\'');
    let a = request(
        &router,
        "POST",
        "/api/agent/register",
        json!({"token":token}),
        None,
        None,
    );
    let b = request(
        &router,
        "POST",
        "/api/agent/register",
        json!({"token":token}),
        None,
        None,
    );
    let (r1, r2) = tokio::join!(a, b);
    assert!(r1.0.is_success() ^ r2.0.is_success());
    let cfg = if r1.0.is_success() { r1.1 } else { r2.1 };
    let credential = cfg["credential"].as_str().unwrap();
    let mut t = sample(32.);
    for i in 0..2 {
        let (s, r) = request(
            &router,
            "POST",
            "/api/agent/telemetry",
            serde_json::to_value(&t).unwrap(),
            None,
            Some(credential),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(r["duplicate"], i == 1)
    }
    let (_, snap) = request(
        &router,
        "GET",
        "/api/snapshot",
        Value::Null,
        Some(&session),
        None,
    )
    .await;
    assert_eq!(snap["nodes"][0]["cpu"], 32.);
    assert!(!snap.to_string().contains(credential));
    t.id = uuid::Uuid::new_v4().to_string();
    t.time -= 1000;
    t.cpu = 98.;
    request(
        &router,
        "POST",
        "/api/agent/telemetry",
        serde_json::to_value(&t).unwrap(),
        None,
        Some(credential),
    )
    .await;
    let (_, snap) = request(
        &router,
        "GET",
        "/api/snapshot",
        Value::Null,
        Some(&session),
        None,
    )
    .await;
    assert_eq!(snap["nodes"][0]["cpu"], 32.);
    let (s, _) = request(
        &router,
        "POST",
        "/api/agent/telemetry",
        serde_json::to_value(&t).unwrap(),
        None,
        Some(&stealthnet_core::token()),
    )
    .await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
}
#[tokio::test]
async fn secrets_are_encrypted_masked_and_cross_site_requests_rejected() {
    let app = app().await;
    let session = admin(&app).await;
    let r = router(app.clone(), "web/dist", "dist/downloads");
    let token = "123456:abcdefghijklmnopqrstuvwxyz_0123456789";
    let (s, _) = request(
        &r,
        "PUT",
        "/api/settings/telegram",
        json!({"token":token,"chat_id":"-100123","events":["cpu"],"enabled":true}),
        Some(&session),
        None,
    )
    .await;
    assert!(s.is_success());
    let stored = db::setting(&app.db, "telegram").await.unwrap().unwrap();
    assert!(!stored.contains(token));
    let (_, data) = request(
        &r,
        "GET",
        "/api/settings/telegram",
        Value::Null,
        Some(&session),
        None,
    )
    .await;
    assert_eq!(data["has_token"], true);
    assert!(!data.to_string().contains(token));
    let bad = Request::builder()
        .method("PUT")
        .uri("/api/settings/telegram")
        .header("content-type", "application/json")
        .header("origin", "https://evil.example")
        .header("cookie", format!("sn_session={session}"))
        .body(Body::from("{}"))
        .unwrap();
    assert_eq!(
        r.oneshot(bad).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}
#[tokio::test]
async fn threshold_opens_one_incident_and_recovers() {
    let app = app().await;
    let id = "node1";
    let mut n = json!({"id":id,"name":"test","country":"Lab","cpu":98.,"ram":1.,"disk":1.,"rx":1.,"tx":1.,"last_seen":now()});
    sqlx::query("INSERT INTO nodes(id,secret_hash,payload,last_seen) VALUES($1,$2,$3,$4)")
        .bind(id)
        .bind("h")
        .bind(n.to_string())
        .bind(now())
        .execute(&app.db)
        .await
        .unwrap();
    let mut rule = db::records(&app.db, "rule", 100)
        .await
        .unwrap()
        .into_iter()
        .find(|r| r["id"] == "cpu")
        .unwrap();
    rule["duration"] = json!(0);
    db::save_record(&app.db, "rule", "cpu", &rule, now())
        .await
        .unwrap();
    alerts::evaluate(&app).await.unwrap();
    alerts::evaluate(&app).await.unwrap();
    let incidents = db::records(&app.db, "incident", 100).await.unwrap();
    assert_eq!(incidents.len(), 1);
    assert_eq!(incidents[0]["status"], "warning");
    n["cpu"] = json!(20.);
    sqlx::query("UPDATE nodes SET payload=$1 WHERE id=$2")
        .bind(n.to_string())
        .bind(id)
        .execute(&app.db)
        .await
        .unwrap();
    alerts::evaluate(&app).await.unwrap();
    let incidents = db::records(&app.db, "incident", 100).await.unwrap();
    assert_eq!(incidents.len(), 1);
    assert_eq!(incidents[0]["status"], "resolved");
}

#[tokio::test]
async fn rental_reminders_are_deduplicated_and_renewal_is_reported() {
    let app = app().await;
    stealthnet_api::telegram::save(
        &app,
        &stealthnet_api::telegram::Config {
            token: "123:fake-token-for-queue-test".into(),
            username: "test".into(),
            chat_id: "42".into(),
            events: vec!["expiry".into(), "renewal".into()],
            enabled: true,
        },
    )
    .await
    .unwrap();
    let expiry = now() + 6 * 86400000;
    let node = json!({"id":"rental-node","name":"rental-test","provider":"Test hoster","country":"Lab","last_seen":now(),"cpu":0.,"ram":0.,"disk":0.,"rx":0.,"tx":0.,"expires_at":expiry});
    sqlx::query("INSERT INTO nodes(id,secret_hash,payload,last_seen) VALUES('rental-node','rental-hash',$1,$2)").bind(node.to_string()).bind(now()).execute(&app.db).await.unwrap();
    alerts::evaluate(&app).await.unwrap();
    alerts::evaluate(&app).await.unwrap();
    let rows = stealthnet_api::telegram::history(&app).await.unwrap();
    assert_eq!(rows.len(), 1);
    assert!(rows[0]["text"].as_str().unwrap().contains("Test hoster"));
    db::set_setting(&app.db,"billing:rental-node",&json!({"provider":"Test hoster","expires_at":now()+2*86400000,"monthly_cost":20,"currency":"EUR"}).to_string()).await.unwrap();
    alerts::evaluate(&app).await.unwrap();
    assert_eq!(
        stealthnet_api::telegram::history(&app).await.unwrap().len(),
        2
    );
    db::set_setting(&app.db,"billing:rental-node",&json!({"provider":"Test hoster","expires_at":now()+30*86400000,"monthly_cost":20,"currency":"EUR"}).to_string()).await.unwrap();
    alerts::evaluate(&app).await.unwrap();
    alerts::evaluate(&app).await.unwrap();
    let rows = stealthnet_api::telegram::history(&app).await.unwrap();
    assert_eq!(rows.len(), 3);
    assert!(
        rows.iter()
            .any(|r| r["title"].as_str().unwrap().contains("продлён"))
    );
    let incidents = db::records(&app.db, "incident", 10).await.unwrap();
    assert_eq!(incidents[0]["status"], "resolved");
    db::set_setting(
        &app.db,
        "billing:rental-node",
        &json!({"provider":"Test hoster","expires_at":now()-1000,"currency":"EUR"}).to_string(),
    )
    .await
    .unwrap();
    alerts::evaluate(&app).await.unwrap();
    alerts::evaluate(&app).await.unwrap();
    assert_eq!(
        stealthnet_api::telegram::history(&app).await.unwrap().len(),
        4
    );
    assert_eq!(
        db::records(&app.db, "incident", 10).await.unwrap()[0]["status"],
        "critical"
    );
    db::set_setting(
        &app.db,
        "billing:rental-node",
        &json!({"provider":"Test hoster","expires_at":null,"currency":"EUR"}).to_string(),
    )
    .await
    .unwrap();
    alerts::evaluate(&app).await.unwrap();
    assert_eq!(
        db::records(&app.db, "incident", 10).await.unwrap()[0]["status"],
        "resolved"
    );
    assert_eq!(
        stealthnet_api::telegram::history(&app).await.unwrap().len(),
        4
    );
}
