use argon2::{
    Argon2, PasswordHasher,
    password_hash::{SaltString, rand_core::OsRng},
};
use std::{path::PathBuf, sync::Arc};
use stealthnet_api::{App, alerts, db, remnawave, router, secrets::Secrets, telegram};
use tokio::sync::Mutex;
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()))
        .init();
    let data = PathBuf::from(std::env::var("DATA_DIR").unwrap_or_else(|_| ".runtime/data".into()));
    if std::env::var("DATABASE_URL").is_err() || std::env::var("ENCRYPTION_KEY").is_err() {
        std::fs::create_dir_all(&data)?;
    }
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| format!("sqlite://{}/monitor.db?mode=rwc", data.display()));
    let password = std::env::var("ADMIN_PASSWORD")
        .map_err(|_| anyhow::anyhow!("Set ADMIN_PASSWORD (at least 12 characters)"))?;
    anyhow::ensure!(
        password.len() >= 12,
        "ADMIN_PASSWORD must contain at least 12 characters"
    );
    let key = if let Ok(k) = std::env::var("ENCRYPTION_KEY") {
        k
    } else {
        let p = data.join("encryption.key");
        if p.exists() {
            std::fs::read_to_string(p)?
        } else {
            let k = Secrets::generate();
            use std::io::Write;
            let mut o = std::fs::OpenOptions::new();
            o.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                o.mode(0o600);
            }
            let mut f = o.open(p)?;
            f.write_all(k.as_bytes())?;
            k
        }
    };
    let public_url = std::env::var("PUBLIC_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8787".into())
        .trim_end_matches('/')
        .to_owned();
    let parsed = reqwest::Url::parse(&public_url)?;
    anyhow::ensure!(
        parsed.scheme() == "https"
            || parsed.host_str() == Some("127.0.0.1")
            || parsed.host_str() == Some("localhost"),
        "PUBLIC_URL must use HTTPS outside localhost"
    );
    anyhow::ensure!(
        parsed.path() == "/"
            && parsed.query().is_none()
            && parsed.fragment().is_none()
            && parsed.username().is_empty()
            && parsed.password().is_none(),
        "PUBLIC_URL must be an origin"
    );
    let app = App {
        db: db::connect(&db_url).await?,
        secrets: Secrets::new(key.trim())?,
        http: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(15))
            .build()?,
        public_url,
        password_hash: Arc::new(
            Argon2::default()
                .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
                .map_err(|_| anyhow::anyhow!("password hashing failed"))?
                .to_string(),
        ),
        logins: Arc::new(Mutex::new(vec![])),
        sync_lock: Arc::new(Mutex::new(())),
        geoip: stealthnet_api::geoip::GeoIp::start(PathBuf::from(
            std::env::var("GEOIP_DIR")
                .unwrap_or_else(|_| data.join("geoip").to_string_lossy().into_owned()),
        )),
    };
    // Independent loops: a large Remnawave import must never delay Telegram delivery.
    let delivery = app.clone();
    tokio::spawn(async move {
        let mut timer = tokio::time::interval(std::time::Duration::from_secs(3));
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            timer.tick().await;
            if telegram::deliver(&delivery).await.is_err() {
                tracing::warn!("delivery worker failed");
            }
        }
    });
    let sync = app.clone();
    tokio::spawn(async move {
        let mut timer = tokio::time::interval(std::time::Duration::from_secs(60));
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            timer.tick().await;
            if remnawave::sync(&sync).await.is_err() {
                tracing::warn!("Remnawave synchronization unavailable");
            }
        }
    });
    let worker = app.clone();
    tokio::spawn(async move {
        let mut timer = tokio::time::interval(std::time::Duration::from_secs(15));
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut tick = 0;
        loop {
            timer.tick().await;
            if alerts::evaluate(&worker).await.is_err() {
                tracing::warn!("alert evaluation failed");
            }
            if tick % 240 == 0 {
                let days = std::env::var("RETENTION_DAYS")
                    .ok()
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or(30)
                    .clamp(1, 365);
                let cutoff = stealthnet_core::now() - days * 86400000;
                for sql in [
                    "DELETE FROM telemetry WHERE time<$1",
                    "DELETE FROM deliveries WHERE time<$1 AND status IN ('delivered','failed')",
                    "DELETE FROM records WHERE time<$1 AND kind IN ('connection','detection')",
                ] {
                    let _ = sqlx::query(sql).bind(cutoff).execute(&worker.db).await;
                }
                let _ = sqlx::query("DELETE FROM sessions WHERE expires<$1")
                    .bind(stealthnet_core::now())
                    .execute(&worker.db)
                    .await;
            }
            tick += 1;
        }
    });
    let web = std::env::var("WEB_DIR").unwrap_or_else(|_| "web/dist".into());
    let downloads = std::env::var("DOWNLOAD_DIR").unwrap_or_else(|_| "dist/downloads".into());
    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(address=%addr,"stealthnet-monitor ready");
    axum::serve(listener, router(app, &web, &downloads))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
