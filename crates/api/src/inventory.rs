use crate::{App, Error, db};
use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{AnyPool, Row};
use std::collections::HashMap;

// Column and key names are constants controlled by this module, never request input.
fn field(pg: bool, alias: &str, key: &str) -> String {
    if pg {
        format!("({alias}.payload::jsonb ->> '{key}')")
    } else {
        format!("CAST(json_extract({alias}.payload, '$.{key}') AS TEXT)")
    }
}
async fn postgres(pool: &AnyPool) -> Result<bool, sqlx::Error> {
    Ok(pool.acquire().await?.backend_name() == "PostgreSQL")
}
pub async fn indexes(pool: &AnyPool) -> anyhow::Result<()> {
    let pg = postgres(pool).await?;
    for key in ["user", "remna_id", "name"] {
        let expression = field(pg, "records", key).replace("records.", "");
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS records_{key}_lookup ON records (kind, ({expression}))"
        ))
        .execute(pool)
        .await?;
    }
    Ok(())
}
fn reference(v: &Value) -> String {
    v.as_str()
        .map(str::to_owned)
        .or_else(|| v.as_i64().map(|n| n.to_string()))
        .unwrap_or_default()
}
fn refs(user: &Value) -> [String; 3] {
    [
        reference(&user["id"]),
        reference(&user["remna_id"]),
        reference(&user["name"]),
    ]
}
fn pattern(value: &str) -> String {
    format!(
        "%{}%",
        value
            .trim()
            .to_lowercase()
            .replace('!', "!!")
            .replace('%', "!%")
            .replace('_', "!_")
    )
}
#[derive(Default, Deserialize)]
pub struct Filter {
    #[serde(default)]
    pub q: String,
    #[serde(default)]
    pub filter: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub offset: i64,
    pub limit: Option<i64>,
}
pub async fn list(
    State(app): State<App>,
    Path(kind): Path<String>,
    Query(filter): Query<Filter>,
) -> Result<Json<Value>, Error> {
    Ok(Json(page(&app, &kind, &filter).await?))
}
pub async fn page(app: &App, kind: &str, input: &Filter) -> Result<Value, Error> {
    if !["user", "connection", "device", "detection"].contains(&kind)
        || input.q.len() > 500
        || input.filter.len() > 250
        || input.user_id.len() > 250
    {
        return Err(Error::bad("Некорректный запрос поиска"));
    }
    let pg = postgres(&app.db).await?;
    let rf = |key| field(pg, "r", key);
    let uf = |key| field(pg, "u", key);
    let user = if input.user_id.is_empty() {
        Value::Null
    } else {
        find_user(&app.db, &input.user_id).await?
    };
    let aliases = refs(&user);
    let search = [
        "name", "user", "ip", "node", "os", "client", "hwid", "remna_id", "device",
    ]
    .iter()
    .map(|key| format!("COALESCE({}, '')", rf(key)))
    .collect::<Vec<_>>()
    .join(" || ' ' || ");
    let user_search = format!(
        "LOWER(COALESCE({}, '') || ' ' || u.id || ' ' || COALESCE({}, '')) LIKE $2 ESCAPE '!'",
        uf("name"),
        uf("remna_id")
    );
    let user_match = format!(
        "{} IN (SELECT id FROM matched_users UNION SELECT remna_id FROM matched_users UNION SELECT name FROM matched_users)",
        rf("user")
    );
    let prefix = format!(
        "WITH matched_users AS (SELECT u.id, {} AS remna_id, {} AS name FROM records u WHERE u.kind='user' AND $2 <> '%%' AND {user_search}) ",
        uf("remna_id"),
        uf("name")
    );
    let condition = format!(
        "FROM records r WHERE r.kind=$1 AND ($2='%%' OR LOWER(r.id || ' ' || {search}) LIKE $2 ESCAPE '!' OR {user_match}) AND ($3='' OR $3='all' OR {}=$3 OR {}=$3 OR {}=$3) AND ($4='' OR {} IN ($5,$6,$7))",
        rf("node"),
        rf("node_id"),
        rf("os"),
        rf("user")
    );
    let q = pattern(&input.q);
    let count_sql = format!("{prefix}SELECT COUNT(*) AS count {condition}");
    let total: i64 = sqlx::query(&count_sql)
        .bind(kind)
        .bind(&q)
        .bind(&input.filter)
        .bind(&input.user_id)
        .bind(&aliases[0])
        .bind(&aliases[1])
        .bind(&aliases[2])
        .fetch_one(&app.db)
        .await?
        .get("count");
    let limit = input.limit.unwrap_or(50).clamp(1, 100);
    let sql = format!(
        "{prefix}SELECT r.payload {condition} ORDER BY r.time DESC,r.id LIMIT $8 OFFSET $9"
    );
    let raw = sqlx::query(&sql)
        .bind(kind)
        .bind(&q)
        .bind(&input.filter)
        .bind(&input.user_id)
        .bind(&aliases[0])
        .bind(&aliases[1])
        .bind(&aliases[2])
        .bind(limit)
        .bind(input.offset.max(0))
        .fetch_all(&app.db)
        .await?;
    let mut rows = raw
        .into_iter()
        .map(|r| serde_json::from_str::<Value>(&r.get::<String, _>("payload")))
        .collect::<Result<Vec<_>, _>>()?;
    if kind == "user" {
        counts(&app.db, &mut rows).await?;
    } else {
        enrich_users(&app.db, &mut rows).await?;
    }
    if kind == "connection" {
        app.geoip.enrich(&mut rows);
    }
    Ok(json!({"rows":rows,"total":total,"offset":input.offset.max(0),"limit":limit}))
}
pub async fn find_user(pool: &AnyPool, id: &str) -> Result<Value, Error> {
    let row = sqlx::query("SELECT payload FROM records WHERE kind='user' AND id=$1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    row.map(|r| serde_json::from_str(&r.get::<String, _>("payload")))
        .transpose()?
        .ok_or_else(|| {
            Error(
                axum::http::StatusCode::NOT_FOUND,
                "Пользователь не найден".into(),
            )
        })
}
pub async fn detail(State(app): State<App>, Path(id): Path<String>) -> Result<Json<Value>, Error> {
    let mut users = vec![find_user(&app.db, &id).await?];
    counts(&app.db, &mut users).await?;
    let mut user = users.remove(0);
    let connections = page(
        &app,
        "connection",
        &Filter {
            user_id: id.clone(),
            limit: Some(10),
            ..Default::default()
        },
    )
    .await?;
    if let Some(latest) = connections["rows"].as_array().and_then(|v| v.first()) {
        user["region"] = latest["region"].clone();
        if latest["last_seen"].as_i64().unwrap_or(0) > user["last_seen"].as_i64().unwrap_or(0) {
            user["last_seen"] = latest["last_seen"].clone();
            user["node"] = latest["node"].clone();
        }
    }
    let sync = db::setting(&app.db, "remnawave_capabilities")
        .await?
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    let pg = postgres(&app.db).await?;
    let sql = format!(
        "SELECT r.payload FROM records r WHERE r.kind='user_traffic' AND {}=$1 AND r.time>$2 ORDER BY r.time DESC LIMIT 2016",
        field(pg, "r", "user")
    );
    let mut history = sqlx::query(&sql)
        .bind(&id)
        .bind(stealthnet_core::now() - 7 * 86400000)
        .fetch_all(&app.db)
        .await?
        .into_iter()
        .map(|r| serde_json::from_str::<Value>(&r.get::<String, _>("payload")))
        .collect::<Result<Vec<_>, _>>()?;
    history.reverse();
    Ok(Json(
        json!({"user":user,"capabilities":sync,"traffic_history":history}),
    ))
}
pub async fn enrich_users(pool: &AnyPool, rows: &mut [Value]) -> Result<(), Error> {
    let pg = postgres(pool).await?;
    let mut values = rows
        .iter()
        .map(|r| reference(&r["user"]))
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    let mut users = HashMap::new();
    for chunk in values.chunks(300) {
        let placeholders = (1..=chunk.len())
            .map(|n| format!("${n}"))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT u.payload FROM records u WHERE u.kind='user' AND (u.id IN ({placeholders}) OR {} IN ({placeholders}) OR {} IN ({placeholders})) ORDER BY u.id",
            field(pg, "u", "remna_id"),
            field(pg, "u", "name")
        );
        let mut query = sqlx::query(&sql);
        for item in chunk {
            query = query.bind(item);
        }
        for row in query.fetch_all(pool).await? {
            let user: Value = serde_json::from_str(&row.get::<String, _>("payload"))?;
            for (priority, alias) in refs(&user).into_iter().enumerate() {
                if alias.is_empty() {
                    continue;
                }
                let entry = users.entry(alias).or_insert((priority, user.clone()));
                if priority < entry.0 {
                    *entry = (priority, user.clone());
                }
            }
        }
    }
    for row in rows {
        if let Some((_, user)) = users.get(&reference(&row["user"])) {
            row["user_id"] = user["id"].clone();
            row["user_name"] = user["name"].clone();
        }
    }
    Ok(())
}
async fn counts(pool: &AnyPool, users: &mut [Value]) -> Result<(), Error> {
    if users.is_empty() {
        return Ok(());
    }
    let pg = postgres(pool).await?;
    let mut aliases = users
        .iter()
        .flat_map(refs)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    aliases.sort();
    aliases.dedup();
    let mut counts = HashMap::new();
    for chunk in aliases.chunks(300) {
        let placeholders = (1..=chunk.len())
            .map(|n| format!("${n}"))
            .collect::<Vec<_>>()
            .join(",");
        let rf = field(pg, "r", "user");
        let sql = format!(
            "SELECT r.kind,{rf} AS user_ref,COUNT(*) AS count FROM records r WHERE r.kind IN ('connection','device') AND {rf} IN ({placeholders}) GROUP BY r.kind,{rf}"
        );
        let mut query = sqlx::query(&sql);
        for item in chunk {
            query = query.bind(item);
        }
        for row in query.fetch_all(pool).await? {
            counts.insert(
                (
                    row.get::<String, _>("kind"),
                    row.get::<String, _>("user_ref"),
                ),
                row.get::<i64, _>("count"),
            );
        }
    }
    for user in users {
        let mut aliases = refs(user).to_vec();
        aliases.sort();
        aliases.dedup();
        for (kind, key) in [("connection", "connections"), ("device", "devices")] {
            user[key] = json!(
                aliases
                    .iter()
                    .map(|a| counts.get(&(kind.into(), a.clone())).copied().unwrap_or(0))
                    .sum::<i64>()
            );
        }
    }
    Ok(())
}

pub async fn summary(State(app): State<App>) -> Result<Json<Value>, Error> {
    let mut result = json!({"user":0,"connection":0,"device":0,"detection":0,"mobile":0,"desktop":0,"other":0,"online_channels":0});
    for row in sqlx::query("SELECT kind,COUNT(*) AS count FROM records WHERE kind IN ('user','device','connection','detection') GROUP BY kind").fetch_all(&app.db).await? {
        result[row.get::<String,_>("kind")]=json!(row.get::<i64,_>("count"));
    }
    let pg = postgres(&app.db).await?;
    let os = field(pg, "r", "os");
    let mut distribution = vec![];
    for row in sqlx::query(&format!("SELECT COALESCE({os},'Неизвестно') AS os,COUNT(*) AS count FROM records r WHERE r.kind='device' GROUP BY {os} ORDER BY count DESC")).fetch_all(&app.db).await? {
        let name:String=row.get("os");let count:i64=row.get("count");let lower=name.to_lowercase();
        let category=if ["android","ios","iphone","ipad"].iter().any(|v| lower.contains(v)) {"mobile"} else if ["windows","macos","mac os","linux"].iter().any(|v| lower.contains(v)) {"desktop"} else {"other"};
        result[category]=json!(result[category].as_i64().unwrap_or(0)+count);
        distribution.push(json!({"name":name,"count":count}));
    }
    result["device_os"] = json!(distribution);
    let sql = format!(
        "SELECT COUNT(*) AS count FROM records r WHERE r.kind='connection' AND r.time>$1 AND {}='online'",
        field(pg, "r", "status")
    );
    result["online_channels"] = json!(
        sqlx::query(&sql)
            .bind(stealthnet_core::now() - 180000)
            .fetch_one(&app.db)
            .await?
            .get::<i64, _>("count")
    );
    result["capabilities"] = db::setting(&app.db, "remnawave_capabilities")
        .await?
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(Value::Null);
    Ok(Json(result))
}
pub async fn online_metrics(pool: &AnyPool, nodes: &[Value]) -> Result<Vec<Value>, Error> {
    let pg = postgres(pool).await?;
    let node = field(pg, "r", "node_id");
    let value = field(pg, "r", "value");
    let sql = format!(
        "SELECT {node} AS node_id,(r.time/300000)*300000 AS bucket,AVG(CAST({value} AS DOUBLE PRECISION)) AS value FROM records r WHERE r.kind='node_online' AND r.time>$1 GROUP BY {node},r.time/300000 ORDER BY bucket"
    );
    let mut out = vec![];
    for row in sqlx::query(&sql)
        .bind(stealthnet_core::now() - 7 * 86400000)
        .fetch_all(pool)
        .await?
    {
        let remna: String = row.get("node_id");
        let id = nodes
            .iter()
            .find(|n| n["remnawave_id"] == remna || n["id"] == format!("remna:{remna}"))
            .and_then(|n| n["id"].as_str())
            .map(str::to_owned)
            .unwrap_or_else(|| format!("remna:{remna}"));
        out.push(json!({"node_id":id,"time":row.get::<i64,_>("bucket"),"metric":"users","value":row.get::<f64,_>("value")}));
    }
    Ok(out)
}
