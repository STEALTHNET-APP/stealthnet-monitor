use crate::{App, Error, db};
use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use stealthnet_core::{now, valid_node_image};

const RELEASE_API: &str = "https://api.github.com/repos/remnawave/node/releases/latest";
const CACHE_KEY: &str = "remnawave_node_release";
const CACHE_TTL: i64 = 3_600_000;

#[derive(Clone, Serialize, Deserialize)]
pub struct NodeRelease {
    version: String,
    image: String,
    release_url: String,
    checked_at: i64,
}

fn parse_release(raw: &Value) -> Result<NodeRelease, Error> {
    let tag = raw["tag_name"].as_str().unwrap_or_default();
    let version = tag.strip_prefix('v').unwrap_or(tag);
    let parts: Vec<_> = version.split('.').collect();
    if raw["draft"] != false
        || raw["prerelease"] != false
        || parts.len() != 3
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.bytes().all(|c| c.is_ascii_digit()))
        || !valid_node_image(&format!("remnawave/node:{version}"))
    {
        return Err(Error::bad(
            "В официальном релизе не найдена стабильная версия образа",
        ));
    }
    Ok(NodeRelease {
        version: version.into(),
        image: format!("remnawave/node:{version}"),
        release_url: format!("https://github.com/remnawave/node/releases/tag/{tag}"),
        checked_at: now(),
    })
}

async fn fetch_release(client: &reqwest::Client, url: &str) -> Result<NodeRelease, Error> {
    let raw = client
        .get(url)
        .header(
            reqwest::header::USER_AGENT,
            concat!("stealthnet-monitor/", env!("CARGO_PKG_VERSION")),
        )
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|_| {
            Error::bad(
                "Не удалось получить версию с GitHub. Повторите попытку или укажите образ вручную.",
            )
        })?
        .json::<Value>()
        .await
        .map_err(|_| Error::bad("GitHub вернул некорректные данные о релизе"))?;
    parse_release(&raw)
}

pub async fn latest(State(app): State<App>) -> Result<Json<NodeRelease>, Error> {
    if let Some(raw) = db::setting(&app.db, CACHE_KEY).await? {
        if let Ok(cached) = serde_json::from_str::<NodeRelease>(&raw) {
            if (0..CACHE_TTL).contains(&(now() - cached.checked_at))
                && valid_node_image(&cached.image)
            {
                return Ok(Json(cached));
            }
        }
    }
    // This public GitHub request never carries the owner's Remnawave token.
    let release = fetch_release(&app.http, RELEASE_API).await?;
    db::set_setting(&app.db, CACHE_KEY, &serde_json::to_string(&release)?).await?;
    Ok(Json(release))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pins_only_stable_official_release_tags() {
        for tag in ["3.4.1", "v3.4.1"] {
            let release =
                parse_release(&json!({"tag_name": tag, "draft": false, "prerelease": false}))
                    .unwrap();
            assert_eq!(release.image, "remnawave/node:3.4.1");
        }
        for tag in ["latest", "3.4.1-rc1", "3.4", "", "3.4.1/evil"] {
            assert!(
                parse_release(&json!({"tag_name": tag, "draft": false, "prerelease": false}))
                    .is_err()
            );
        }
        assert!(
            parse_release(&json!({"tag_name": "3.4.1", "draft": false, "prerelease": true}))
                .is_err()
        );
    }

    #[tokio::test]
    async fn release_lookup_does_not_send_remnawave_credentials() {
        let upstream = axum::Router::new().fallback(|req: axum::extract::Request| async move {
            assert_eq!(req.method(), reqwest::Method::GET);
            assert!(!req.headers().contains_key(reqwest::header::AUTHORIZATION));
            assert!(req.headers().contains_key(reqwest::header::USER_AGENT));
            Json(json!({"tag_name": "3.4.1", "draft": false, "prerelease": false}))
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let release = fetch_release(&reqwest::Client::new(), &url).await.unwrap();
        assert_eq!(release.image, "remnawave/node:3.4.1");
        task.abort();
    }
}
