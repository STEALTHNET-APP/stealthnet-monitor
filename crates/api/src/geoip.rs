//! Offline IP lookups. Only the monthly database is downloaded; observed IPs never leave the panel.
use anyhow::{Context, ensure};
use chrono::Utc;
use maxminddb::Reader;
use serde_json::{Value, json};
use std::{
    io::Read,
    net::IpAddr,
    path::PathBuf,
    sync::{Arc, RwLock},
    time::Duration,
};

#[derive(Default)]
struct Database {
    reader: Option<Reader<Vec<u8>>>,
    error: bool,
    asn: Option<Reader<Vec<u8>>>,
    asn_error: bool,
}

#[derive(Clone, Default)]
pub struct GeoIp(Arc<RwLock<Database>>);

impl GeoIp {
    pub fn start(directory: PathBuf) -> Self {
        let result = Self::default();
        for kind in ["city", "asn"] {
            let worker = result.clone();
            let directory = directory.clone();
            tokio::spawn(async move {
                let file = directory.join(format!("dbip-{kind}-lite.mmdb"));
                let read_file = file.clone();
                if let Ok(Ok(reader)) =
                    tokio::task::spawn_blocking(move || Reader::open_readfile(read_file)).await
                {
                    let mut db = worker.0.write().unwrap();
                    if kind == "city" {
                        db.reader = Some(reader);
                    } else {
                        db.asn = Some(reader);
                    }
                }
                loop {
                    if worker.update(&file, kind).await.is_err() {
                        let mut db = worker.0.write().unwrap();
                        if kind == "city" {
                            db.error = true;
                        } else {
                            db.asn_error = true;
                        }
                        tracing::warn!(
                            kind,
                            "IP database update failed; retaining previous database"
                        );
                    }
                    let ready = {
                        let db = worker.0.read().unwrap();
                        if kind == "city" {
                            db.reader.is_some()
                        } else {
                            db.asn.is_some()
                        }
                    };
                    tokio::time::sleep(Duration::from_secs(if ready { 6 * 3600 } else { 60 }))
                        .await;
                }
            });
        }
        result
    }

    async fn update(&self, file: &std::path::Path, kind: &'static str) -> anyhow::Result<()> {
        let month = Utc::now().format("%Y-%m").to_string();
        let stamp = file.with_extension("month");
        let ready = {
            let db = self.0.read().unwrap();
            if kind == "city" {
                db.reader.is_some()
            } else {
                db.asn.is_some()
            }
        };
        if ready && tokio::fs::read_to_string(&stamp).await.unwrap_or_default() == month {
            return Ok(());
        }
        let client = reqwest::Client::builder()
            .user_agent("stealthnet-monitor GeoIP database updater")
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(180))
            .build()?;
        let mut response = client
            .get(format!(
                "https://download.db-ip.com/free/dbip-{kind}-lite-{month}.mmdb.gz"
            ))
            .send()
            .await?
            .error_for_status()?;
        let mut compressed = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            ensure!(
                compressed.len() + chunk.len() <= 128 * 1024 * 1024,
                "GeoIP download exceeds size limit"
            );
            compressed.extend_from_slice(&chunk);
        }
        let file = file.to_owned();
        let reader = tokio::task::spawn_blocking(move || -> anyhow::Result<_> {
            let mut data = Vec::new();
            flate2::read::GzDecoder::new(compressed.as_slice())
                .take(256 * 1024 * 1024 + 1)
                .read_to_end(&mut data)?;
            ensure!(
                data.len() <= 256 * 1024 * 1024,
                "GeoIP database exceeds size limit"
            );
            let reader = Reader::from_source(data)?;
            ensure!(
                reader
                    .metadata()
                    .database_type
                    .to_lowercase()
                    .contains(kind),
                "Unexpected IP database type"
            );
            let parent = file.parent().context("GeoIP directory missing")?;
            std::fs::create_dir_all(parent)?;
            let temporary = file.with_extension("tmp");
            // Persist the validated bytes before replacing the in-memory reader.
            let mut decoder = flate2::read::GzDecoder::new(compressed.as_slice());
            let mut output = std::fs::File::create(&temporary)?;
            std::io::copy(&mut decoder, &mut output)?;
            output.sync_all()?;
            std::fs::rename(temporary, file)?;
            std::fs::write(stamp, month)?;
            Ok(reader)
        })
        .await??;
        let mut db = self.0.write().unwrap();
        if kind == "city" {
            db.reader = Some(reader);
            db.error = false;
        } else {
            db.asn = Some(reader);
            db.asn_error = false;
        }
        tracing::info!(kind, "IP database ready");
        Ok(())
    }

    pub fn enrich(&self, rows: &mut [Value]) -> Value {
        let db = self.0.read().unwrap();
        if let Some(reader) = &db.reader {
            for row in rows.iter_mut() {
                let Some(ip) = row["ip"]
                    .as_str()
                    .and_then(|s| s.parse::<IpAddr>().ok())
                    .filter(public_ip)
                else {
                    continue;
                };
                let Ok(result) = reader.lookup(ip) else {
                    continue;
                };
                let Ok(Some(record)) = result.decode::<Value>() else {
                    continue;
                };
                apply_location(row, &record);
            }
        }
        if let Some(reader) = &db.asn {
            for row in rows {
                if let Some(ip) = row["ip"]
                    .as_str()
                    .and_then(|s| s.parse::<IpAddr>().ok())
                    .filter(public_ip)
                {
                    if let Ok(result) = reader.lookup(ip) {
                        if let Ok(Some(record)) = result.decode::<Value>() {
                            apply_network(row, &record);
                        }
                    }
                }
            }
        }
        json!({"asn_available":db.asn.is_some(),"asn_update_failed":db.asn_error,"available":db.reader.is_some(),"provider":"DB-IP Lite","build_epoch":db.reader.as_ref().map(|r|r.metadata().build_epoch),"update_failed":db.error})
    }
}

fn apply_network(row: &mut Value, record: &Value) {
    let org = record["autonomous_system_organization"]
        .as_str()
        .unwrap_or("");
    row["asn"] = record["autonomous_system_number"].clone();
    row["network_operator"] = json!(org);
    let name = org.to_lowercase();
    // ASN organisation is a hint, not the access medium of an individual subscriber.
    let hint = if ["mobile", "cellular"].iter().any(|s| name.contains(s)) {
        "Мобильный оператор · предположительно"
    } else if ["broadband", "cable"].iter().any(|s| name.contains(s)) {
        "Фиксированный оператор · предположительно"
    } else {
        "Тип доступа не определён"
    };
    row["network_type"] = json!(hint);
    row["network_source"] =
        json!("DB-IP ASN Lite · оценка по названию оператора; Wi-Fi не определяется");
}

fn public_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            !v.is_private()
                && !v.is_loopback()
                && !v.is_link_local()
                && !v.is_broadcast()
                && !v.is_documentation()
                && !v.is_unspecified()
                && !v.is_multicast()
                && v.octets()[0] != 0
                && v.octets()[0] < 240
                && !(v.octets()[0] == 100 && (64..=127).contains(&v.octets()[1]))
        }
        IpAddr::V6(v) => v
            .to_ipv4_mapped()
            .map(|v| public_ip(&IpAddr::V4(v)))
            .unwrap_or_else(|| {
                !v.is_loopback()
                    && !v.is_unspecified()
                    && !v.is_unique_local()
                    && !v.is_unicast_link_local()
                    && !v.is_multicast()
                    && !(v.segments()[0] == 0x2001 && v.segments()[1] == 0xdb8)
            }),
    }
}

fn localized(value: &Value) -> Option<&str> {
    value["names"]["ru"]
        .as_str()
        .or_else(|| value["names"]["en"].as_str())
        .filter(|s| !s.is_empty())
}

fn apply_location(row: &mut Value, record: &Value) {
    let Some(code) = record["country"]["iso_code"]
        .as_str()
        .filter(|s| s.len() == 2 && s.bytes().all(|b| b.is_ascii_alphabetic()))
    else {
        return;
    };
    let country = localized(&record["country"]).unwrap_or(code);
    let city = localized(&record["city"]).unwrap_or("");
    row["geo_country"] = json!(country);
    row["geo_code"] = json!(code.to_lowercase());
    row["geo_city"] = json!(city);
    row["geo_area"] = json!(localized(&record["subdivisions"][0]).unwrap_or(""));
    row["region"] = json!(if city.is_empty() {
        country.to_owned()
    } else {
        format!("{city}, {country}")
    });
    row["geo_source"] = json!("DB-IP Lite");
    if let (Some(lat), Some(lon)) = (
        record["location"]["latitude"].as_f64(),
        record["location"]["longitude"].as_f64(),
    ) {
        if lat.is_finite()
            && lon.is_finite()
            && (-90.0..=90.0).contains(&lat)
            && (-180.0..=180.0).contains(&lon)
        {
            row["geo_lat"] = json!(lat);
            row["geo_lon"] = json!(lon);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_city_fixture_offline_for_both_ip_families() {
        let reader =
            Reader::from_source(include_bytes!("../tests/fixtures/GeoIP2-City-Test.mmdb").to_vec())
                .unwrap();
        let geoip = GeoIp(Arc::new(RwLock::new(Database {
            reader: Some(reader),
            error: false,
            asn: None,
            asn_error: false,
        })));
        let mut rows = vec![
            json!({"ip":"89.160.20.128"}),
            json!({"ip":"2001:218::"}),
            json!({"ip":"127.0.0.1"}),
        ];
        assert_eq!(geoip.enrich(&mut rows)["available"], true);
        assert_eq!(rows[0]["geo_code"], "se");
        assert_eq!(rows[1]["geo_code"], "jp");
        assert!(rows[0]["geo_lat"].is_number());
        assert!(rows[1]["geo_lon"].is_number());
        assert!(rows[2]["geo_lat"].is_null());
    }
    #[test]
    fn invalid_and_local_addresses_never_get_locations() {
        for ip in [
            "10.0.0.1",
            "127.0.0.1",
            "100.64.0.1",
            "192.0.2.1",
            "::1",
            "fc00::1",
            "::ffff:192.168.1.2",
            "2001:db8::1",
        ] {
            assert!(!public_ip(&ip.parse().unwrap()), "{ip}");
        }
        assert!(public_ip(&"8.8.8.8".parse().unwrap()));
        assert!(public_ip(&"2001:4860:4860::8888".parse().unwrap()));
        let mut rows = vec![json!({"ip":"8.8.8.8","region":"Не определён"})];
        let status = GeoIp::default().enrich(&mut rows);
        assert_eq!(status["available"], false);
        assert!(rows[0]["geo_lat"].is_null());
    }
    #[test]
    fn location_uses_localized_names_and_requires_valid_coordinates() {
        let mut row = json!({"ip":"8.8.8.8"});
        let mut record = json!({"country":{"iso_code":"US","names":{"ru":"США","en":"USA"}},"city":{"names":{"en":"Mountain View"}},"location":{"latitude":37.4,"longitude":-122.1}});
        apply_location(&mut row, &record);
        assert_eq!(row["region"], "Mountain View, США");
        assert_eq!(row["geo_lat"], 37.4);
        record["location"]["latitude"] = json!(999);
        let mut unknown = json!({});
        apply_location(&mut unknown, &record);
        assert_eq!(unknown["geo_country"], "США");
        assert!(unknown["geo_lat"].is_null());
    }
}
