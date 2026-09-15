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

#[tokio::test]
async fn deployment_history_requires_administrator_session() {
    let a = app().await;
    let token = admin(&a).await;
    let r = router(a, "/tmp/no-web", "/tmp/no-downloads");
    let (status, _) = request(&r, "GET", "/api/updates", Value::Null, None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, data) = request(&r, "GET", "/api/updates", Value::Null, Some(&token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(data["rows"].is_array());
    assert_eq!(data["installed_version"], env!("CARGO_PKG_VERSION"));
}

#[tokio::test]
async fn traffic_uses_measured_intervals_and_online_history_links_physical_nodes() {
    let a = app().await;
    let time = now();
    for (i, seconds) in [(0, Some(15.0)), (1, Some(15.0)), (2, None)] {
        let mut value = sample(10.);
        value.time = time - (2 - i) * 300000;
        value.rx_bytes_per_sec = 100.;
        value.tx_bytes_per_sec = 200.;
        value.interval_seconds = seconds;
        sqlx::query("INSERT INTO telemetry(id,node_id,time,payload) VALUES($1,'agent-1',$2,$3)")
            .bind(format!("metric-{i}"))
            .bind(value.time)
            .bind(serde_json::to_string(&value).unwrap())
            .execute(&a.db)
            .await
            .unwrap();
    }
    let traffic = stealthnet_api::traffic::totals(&a, 24).await.unwrap();
    assert_eq!(traffic["rx_bytes"], 3000.);
    assert_eq!(traffic["tx_bytes"], 6000.); // Five-minute unmeasured gap is excluded.
    db::save_record(
        &a.db,
        "node_online",
        "online",
        &json!({"node_id":"remna-1","value":42}),
        time,
    )
    .await
    .unwrap();
    let metrics = stealthnet_api::inventory::online_metrics(
        &a.db,
        &[json!({"id":"agent-1","remnawave_id":"remna-1"})],
    )
    .await
    .unwrap();
    assert_eq!(metrics[0]["node_id"], "agent-1");
    assert_eq!(metrics[0]["metric"], "users");
    assert_eq!(metrics[0]["value"], 42.);
}

#[tokio::test]
async fn inventory_search_resolves_names_and_profile_uses_all_saved_records() {
    let a = app().await;
    let token = admin(&a).await;
    for (kind, id, payload) in [
        (
            "user",
            "user-1",
            json!({"id":"user-1","name":"Example_User_A","remna_id":781,"traffic":1.5}),
        ),
        (
            "user",
            "user-2",
            json!({"id":"user-2","name":"ExampleXUser_A","remna_id":782}),
        ),
        (
            "connection",
            "c1",
            json!({"id":"c1","user":"781","ip":"1.1.1.1","node":"NL","time":10}),
        ),
        (
            "connection",
            "c2",
            json!({"id":"c2","user":"user-1","ip":"1.0.0.1","node":"NL","time":11}),
        ),
        (
            "connection",
            "c3",
            json!({"id":"c3","user":"782","ip":"8.8.8.8","node":"DE","time":12}),
        ),
        (
            "device",
            "d1",
            json!({"id":"d1","user":"user-1","hwid":"a","os":"Android"}),
        ),
        (
            "device",
            "d2",
            json!({"id":"d2","user":"781","hwid":"b","os":"Windows"}),
        ),
    ] {
        db::save_record(&a.db, kind, id, &payload, now())
            .await
            .unwrap();
    }
    let r = router(a.clone(), "/tmp/no-web", "/tmp/no-downloads");
    assert_eq!(
        request(
            &r,
            "GET",
            "/api/inventory/connection?q=Example_User_A",
            Value::Null,
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, page) = request(
        &r,
        "GET",
        "/api/inventory/connection?q=example_user_a&limit=1",
        Value::Null,
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{page}");
    assert_eq!(page["total"], 2); // '_' is literal, and numeric/UUID references both match.
    assert_eq!(page["rows"].as_array().unwrap().len(), 1);
    assert_eq!(page["rows"][0]["user_name"], "Example_User_A");
    let (_, profile) = request(
        &r,
        "GET",
        "/api/users/user-1/detail",
        Value::Null,
        Some(&token),
        None,
    )
    .await;
    assert_eq!(profile["user"]["connections"], 2, "{profile}");
    assert_eq!(profile["user"]["devices"], 2);
    let (_, devices) = request(
        &r,
        "GET",
        "/api/inventory/device?user_id=user-1",
        Value::Null,
        Some(&token),
        None,
    )
    .await;
    assert_eq!(devices["total"], 2);
    let (_, empty) = request(
        &r,
        "GET",
        "/api/inventory/connection?q=%25",
        Value::Null,
        Some(&token),
        None,
    )
    .await;
    assert_eq!(empty["total"], 0);
}
#[tokio::test]
async fn search_prefilter_preserves_decoded_strings_and_ignores_metadata_only_matches() {
    let a = app().await;
    for (name, query) in [
        ("телефон", "тел"),
        ("Phone \"A\"", "\"A\""),
        ("A\\B", "A\\B"),
        ("line\nbreak", "line\nb"),
    ] {
        db::save_record(
            &a.db,
            "device",
            "escaped",
            &json!({"id":"escaped","device":name,"source":"metadata-only"}),
            now(),
        )
        .await
        .unwrap();
        let result = stealthnet_api::inventory::page(
            &a,
            "device",
            &stealthnet_api::inventory::Filter {
                q: query.into(),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(result["total"], 1, "{name}");
    }
    let result = stealthnet_api::inventory::page(
        &a,
        "device",
        &stealthnet_api::inventory::Filter {
            q: "metadata-only".into(),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result["total"], 0);
    db::save_record(
        &a.db,
        "device",
        "spanning",
        &json!({"id":"spanning","name":"Alpha","user":"Beta"}),
        now(),
    )
    .await
    .unwrap();
    let result = stealthnet_api::inventory::page(
        &a,
        "device",
        &stealthnet_api::inventory::Filter {
            q: "alpha beta".into(),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result["total"], 1);
}

async fn app() -> App {
    App {
        db: db::connect("sqlite::memory:").await.unwrap(),
        secrets: Secrets::new(&Secrets::generate()).unwrap(),
        http: reqwest::Client::new(),
        public_url: "https://monitor.example.com".into(),
        password_hash: Arc::new(String::new()),
        logins: Arc::new(Mutex::new(vec![])),
        sync_lock: Arc::new(Mutex::new(())),
        geoip: Default::default(),
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
        addresses: vec![],
        events: vec![],
        collector: None,
        interval_seconds: None,
    }
}
#[tokio::test]
async fn cyrillic_names_register_and_clean_nodes_keep_the_selected_image() {
    let app = app().await;
    let router = router(app.clone(), "web/dist", "dist/downloads");
    let session = admin(&app).await;
    for (name, mode) in [
        ("Нидерланды".to_owned(), "existing"),
        ("Я".repeat(80), "clean"),
    ] {
        let mut config = enrollment();
        config["name"] = json!(name);
        config["mode"] = json!(mode);
        config["node_image"] = json!("remnawave/node:3.4.1");
        config["node_secret"] = json!("a-synthetic-node-secret");
        let (status, result) = request(
            &router,
            "POST",
            "/api/enrollments",
            config,
            Some(&session),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{result}");
        let token = result["command"]
            .as_str()
            .unwrap()
            .split("--token '")
            .nth(1)
            .unwrap()
            .split('\'')
            .next()
            .unwrap();
        let (status, registered) = request(
            &router,
            "POST",
            "/api/agent/register",
            json!({"token": token}),
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(registered["enrollment"]["name"], name);
        assert_eq!(
            registered["enrollment"]["node_image"],
            "remnawave/node:3.4.1"
        );
        assert!(
            db::nodes(&app.db)
                .await
                .unwrap()
                .iter()
                .any(|node| node["name"] == name)
        );
    }
    for name in [
        " ".into(),
        "Я".repeat(81),
        "node\nname".into(),
        "$(command)".into(),
    ] {
        let mut config = enrollment();
        config["name"] = json!(name);
        assert_eq!(
            request(
                &router,
                "POST",
                "/api/enrollments",
                config,
                Some(&session),
                None
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
    for image in [
        "remnawave/node:",
        "remnawave/node:latest",
        "remnawave/node:3.4.1:other",
        "other/node:3.4.1",
    ] {
        let mut config = enrollment();
        config["mode"] = json!("clean");
        config["node_secret"] = json!("a-synthetic-node-secret");
        config["node_image"] = json!(image);
        assert_eq!(
            request(
                &router,
                "POST",
                "/api/enrollments",
                config,
                Some(&session),
                None
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
}

#[tokio::test]
async fn node_image_lookup_requires_login_and_reuses_recent_release() {
    let app = app().await;
    let cached = json!({"version":"3.4.1","image":"remnawave/node:3.4.1","release_url":"https://github.com/remnawave/node/releases/tag/3.4.1","checked_at":now()});
    db::set_setting(&app.db, "remnawave_node_release", &cached.to_string())
        .await
        .unwrap();
    let session = admin(&app).await;
    let router = router(app, "web/dist", "dist/downloads");
    assert_eq!(
        request(
            &router,
            "GET",
            "/api/node-image/latest",
            Value::Null,
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, release) = request(
        &router,
        "GET",
        "/api/node-image/latest",
        Value::Null,
        Some(&session),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(release, cached);
}

#[tokio::test]
async fn telemetry_auto_fills_ip_merges_remnawave_and_updates_connection_activity() {
    let app = app().await;
    let router = router(app.clone(), "web/dist", "dist/downloads");
    let session = admin(&app).await;
    let (_, enrollment) = request(
        &router,
        "POST",
        "/api/enrollments",
        enrollment(),
        Some(&session),
        None,
    )
    .await;
    let token = enrollment["command"]
        .as_str()
        .unwrap()
        .split("--token '")
        .nth(1)
        .unwrap()
        .split('\'')
        .next()
        .unwrap();
    let (_, registered) = request(
        &router,
        "POST",
        "/api/agent/register",
        json!({"token": token}),
        None,
        None,
    )
    .await;
    let credential = registered["credential"].as_str().unwrap();
    db::save_record(&app.db, "remna_node", "remna-nl", &json!({"id":"remna-nl","name":"Netherlands","address":"192.0.2.9","country_code":"NL","users_online":914,"is_connected":true}), now()).await.unwrap();
    let mut telemetry = sample(11.);
    telemetry.addresses = vec!["192.0.2.9".into()];
    telemetry.events = vec![serde_json::from_value(json!({"id":"user-ip-tcp","time":now(),"kind":"connection","ip":"192.0.2.10","user":"12345","protocol":"TCP","evidence":"Xray: принятое подключение"})).unwrap()];
    assert_eq!(
        request(
            &router,
            "POST",
            "/api/agent/telemetry",
            serde_json::to_value(&telemetry).unwrap(),
            None,
            Some(credential)
        )
        .await
        .0,
        StatusCode::OK
    );
    let nodes = db::nodes(&app.db).await.unwrap();
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0]["ip"], "192.0.2.9");
    assert_eq!(nodes[0]["code"], "nl");
    assert_eq!(nodes[0]["users"], 914);
    telemetry.id = uuid::Uuid::new_v4().to_string();
    telemetry.events[0].time += 1000;
    assert_eq!(
        request(
            &router,
            "POST",
            "/api/agent/telemetry",
            serde_json::to_value(&telemetry).unwrap(),
            None,
            Some(credential)
        )
        .await
        .0,
        StatusCode::OK
    );
    let connections = db::records(&app.db, "connection", 10).await.unwrap();
    assert_eq!(connections.len(), 1);
    assert_eq!(connections[0]["protocol"], "TCP");
    assert_eq!(connections[0]["last_seen"], telemetry.events[0].time);
    assert_eq!(connections[0]["node_id"], registered["node_id"]);
}

#[tokio::test]
async fn remnawave_sync_only_reads_upstream_and_preserves_cache_on_partial_failure() {
    use axum::{Json, extract::State};
    use std::sync::atomic::{AtomicBool, Ordering};
    use stealthnet_api::remnawave;
    #[derive(Clone, Default)]
    struct Upstream {
        requests: Arc<Mutex<Vec<(String, String)>>>,
        fail_page: Arc<AtomicBool>,
    }
    async fn reply(
        State(state): State<Upstream>,
        req: axum::extract::Request,
    ) -> (StatusCode, Json<Value>) {
        state
            .requests
            .lock()
            .await
            .push((req.method().to_string(), req.uri().to_string()));
        let body = match (req.method().as_str(), req.uri().to_string().as_str()) {
            ("GET", "/api/nodes") => json!({"response":[{"uuid":"node-1","name":"Test node"}]}),
            ("GET", "/api/users?start=0&size=500") => {
                json!({"response":{"users":(0..500).map(|i|json!({"uuid":format!("user-{i}"),"username":format!("client-{i}"),"status":"ACTIVE"})).collect::<Vec<_>>()}})
            }
            ("GET", "/api/users?start=500&size=500")
                if !state.fail_page.load(Ordering::Relaxed) =>
            {
                json!({"response":{"users":[{"uuid":"user-500","username":"client-500","status":"ACTIVE"}]}})
            }
            ("GET", "/api/hwid/devices?start=0&size=500") => {
                json!({"response":{"total":501,"devices":(0..500).map(|i|json!({"hwid":format!("hw-{i}"),"userUuid":"user-0","platform":"Android"})).collect::<Vec<_>>()}})
            }
            ("GET", "/api/hwid/devices?start=500&size=500") => {
                json!({"response":{"total":501,"devices":[{"hwid":"last-device","userUuid":"user-500","platform":"Windows"}]}})
            }
            _ => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error":"unexpected request or simulated page failure"})),
                );
            }
        };
        (StatusCode::OK, Json(body))
    }
    let upstream = Upstream::default();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let service = Router::new().fallback(reply).with_state(upstream.clone());
    let task = tokio::spawn(async move { axum::serve(listener, service).await.unwrap() });
    let app = app().await;
    remnawave::save(
        &app,
        &remnawave::Config {
            url,
            token: "synthetic-api-token".into(),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    db::save_record(
        &app.db,
        "user",
        "stale-local-copy",
        &json!({"id":"stale-local-copy"}),
        1,
    )
    .await
    .unwrap();
    let result = remnawave::sync(&app).await.unwrap();
    assert_eq!(result["users"], 501);
    assert_eq!(result["devices"], 501);
    assert_eq!(
        db::records(&app.db, "device", 1000).await.unwrap().len(),
        501
    );
    let local_users = db::records(&app.db, "user", 1000).await.unwrap();
    assert_eq!(local_users.len(), 501);
    assert!(
        !local_users
            .iter()
            .any(|user| user["id"] == "stale-local-copy")
    );
    // A failed later page must not delete users absent from the pages received so far.
    upstream.fail_page.store(true, Ordering::Relaxed);
    assert!(remnawave::sync(&app).await.is_err());
    assert_eq!(db::records(&app.db, "user", 1000).await.unwrap().len(), 501);
    let seen = upstream.requests.lock().await;
    assert_eq!(seen.len(), 8);
    assert!(seen.iter().all(|(method, path)| {
        method == "GET"
            && [
                "/api/nodes",
                "/api/users?start=0&size=500",
                "/api/users?start=500&size=500",
                "/api/hwid/devices?start=0&size=500",
                "/api/hwid/devices?start=500&size=500",
            ]
            .contains(&path.as_str())
    }));
    task.abort();
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
async fn monthly_payment_reminders_are_deduplicated_and_schedule_changes_are_reported() {
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
    assert!(rows.iter().any(|r| {
        r["title"]
            .as_str()
            .unwrap()
            .contains("Дата оплаты изменена")
    }));
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
        "warning"
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
    // Persisted state from the preceding cycle must not suppress this month's
    // same reminder stage or claim a payment/renewal on automatic rollover.
    db::set_setting(
        &app.db,
        "billing:rental-node",
        &json!({"provider":"Test hoster","expires_at":expiry,"currency":"EUR"}).to_string(),
    )
    .await
    .unwrap();
    db::set_setting(
        &app.db,
        "expiry-state:expiry:rental-node",
        &json!({"anchor":expiry,"expires_at":expiry-31*86400000,"stage":7}).to_string(),
    )
    .await
    .unwrap();
    alerts::evaluate(&app).await.unwrap();
    alerts::evaluate(&app).await.unwrap();
    let rows = stealthnet_api::telegram::history(&app).await.unwrap();
    assert_eq!(rows.len(), 5);
    assert_eq!(
        rows.iter()
            .filter(|r| r["title"]
                .as_str()
                .unwrap()
                .contains("Дата оплаты изменена"))
            .count(),
        1
    );
    let node = db::nodes(&app.db).await.unwrap().remove(0);
    assert_eq!(node["expires_at"], expiry);
    assert_eq!(
        node["next_payment_at"],
        stealthnet_api::billing::next_payment(expiry, now()).unwrap()
    );
}
