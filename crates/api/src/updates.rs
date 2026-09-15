use crate::{Error, Result};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::Path;
use tokio::io::AsyncReadExt;

#[derive(Deserialize, Serialize)]
struct Step {
    name: String,
    status: String,
    started_at: Option<i64>,
    finished_at: Option<i64>,
}
#[derive(Deserialize, Serialize)]
struct Operation {
    id: String,
    action: String,
    from_version: String,
    to_version: String,
    started_at: Option<i64>,
    finished_at: Option<i64>,
    updated_at: i64,
    status: String,
    stage: Option<String>,
    steps: Vec<Step>,
    backup: Option<String>,
    exit_code: Option<i32>,
    source: String,
}

pub async fn history() -> Result<Json<Value>> {
    let directory = std::env::var("UPDATE_HISTORY_DIR").unwrap_or(".state/updates".into());
    Ok(Json(
        read_history(&Path::new(&directory).join("history.json")).await?,
    ))
}

pub async fn read_history(path: &Path) -> Result<Value> {
    let file = match tokio::fs::File::open(path).await {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(
                json!({"installed_version":env!("CARGO_PKG_VERSION"),"history_available":false,"rows":[]}),
            );
        }
        Err(_) => return Err(history_error()),
    };
    let mut raw = Vec::new();
    file.take(1024 * 1024 + 1)
        .read_to_end(&mut raw)
        .await
        .map_err(|_| history_error())?;
    if raw.len() > 1024 * 1024 {
        return Err(history_error());
    }
    // Deserialize an explicit public shape; unknown fields such as logs or secrets are excluded.
    let mut rows: Vec<Operation> = serde_json::from_slice(&raw).map_err(|_| history_error())?;
    rows.sort_by_key(|r| std::cmp::Reverse(r.updated_at));
    rows.truncate(100);
    Ok(json!({"installed_version":env!("CARGO_PKG_VERSION"),"history_available":true,"rows":rows}))
}
fn history_error() -> Error {
    Error(
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        "Не удалось прочитать журнал обновлений на сервере".into(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn persisted_history_is_read_after_restart_and_excludes_private_fields() {
        let root =
            std::env::temp_dir().join(format!("stealthnet-updates-{}", uuid::Uuid::new_v4()));
        let path = root.join("history.json");
        assert_eq!(
            read_history(&path).await.unwrap()["history_available"],
            false
        );
        tokio::fs::create_dir_all(&root).await.unwrap();
        let row = json!({"id":"one","action":"update","from_version":"v0.1.5","to_version":"v0.1.6","started_at":100,"finished_at":200,"updated_at":200,"status":"succeeded","stage":"health","steps":[{"name":"health","status":"succeeded","started_at":190,"finished_at":200}],"backup":"backups/test","exit_code":null,"source":"updater","logs":"private-output","token":"private-token"});
        tokio::fs::write(&path, serde_json::to_vec(&vec![row]).unwrap())
            .await
            .unwrap();
        for _ in 0..2 {
            let data = read_history(&path).await.unwrap();
            assert_eq!(data["rows"][0]["status"], "succeeded");
            assert!(data["rows"][0].get("logs").is_none());
            assert!(data["rows"][0].get("token").is_none());
        }
        tokio::fs::write(&path, b"broken").await.unwrap();
        assert!(read_history(&path).await.is_err());
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
