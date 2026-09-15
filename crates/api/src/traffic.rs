use crate::{App, Error};
use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;

#[derive(Deserialize)]
pub struct Period {
    pub hours: Option<i64>,
}
pub async fn summary(
    State(app): State<App>,
    Query(period): Query<Period>,
) -> Result<Json<Value>, Error> {
    totals(&app, period.hours.unwrap_or(24).clamp(1, 168))
        .await
        .map(Json)
}
pub async fn totals(app: &App, hours: i64) -> Result<Value, Error> {
    let pg = app.db.acquire().await?.backend_name() == "PostgreSQL";
    let field = |key: &str| {
        if pg {
            format!("CAST(payload::jsonb ->> '{key}' AS DOUBLE PRECISION)")
        } else {
            format!("CAST(json_extract(payload,'$.{key}') AS DOUBLE PRECISION)")
        }
    };
    let cutoff = stealthnet_core::now() - hours * 3600000;
    let sql = format!(
        "WITH source AS (SELECT node_id,time,{} AS rx,{} AS tx,{} AS duration,LAG(time) OVER(PARTITION BY node_id ORDER BY time) AS previous FROM telemetry WHERE time>$1), measured AS (SELECT *,CASE WHEN duration>0 AND duration<=3600 THEN duration WHEN time-previous BETWEEN 1 AND 90000 THEN (time-previous)/1000.0 ELSE 0 END AS elapsed FROM source), intervals AS (SELECT *,CASE WHEN elapsed>(time-$1)/1000.0 THEN (time-$1)/1000.0 ELSE elapsed END AS seconds FROM measured) SELECT node_id,SUM(rx*seconds) AS rx_bytes,SUM(tx*seconds) AS tx_bytes,SUM(seconds) AS observed_seconds,MAX((rx+tx)*8/1000000000) AS peak_gbps FROM intervals GROUP BY node_id",
        field("rx_bytes_per_sec"),
        field("tx_bytes_per_sec"),
        field("interval_seconds")
    );
    let mut nodes = vec![];
    let mut rx = 0.;
    let mut tx = 0.;
    for row in sqlx::query(&sql).bind(cutoff).fetch_all(&app.db).await? {
        let r: f64 = row.get("rx_bytes");
        let t: f64 = row.get("tx_bytes");
        rx += r;
        tx += t;
        nodes.push(json!({"id":row.get::<String,_>("node_id"),"rx_bytes":r,"tx_bytes":t,"observed_seconds":row.get::<f64,_>("observed_seconds"),"peak_gbps":row.get::<f64,_>("peak_gbps")}));
    }
    Ok(
        json!({"hours":hours,"rx_bytes":rx,"tx_bytes":tx,"total_bytes":rx+tx,"nodes":nodes,"source":"Собранные замеры агентов; пропуски не заполняются"}),
    )
}
