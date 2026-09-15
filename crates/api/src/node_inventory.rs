use serde_json::{Value, json};
use std::collections::HashSet;
use stealthnet_core::now;

// Approximate country positions, never a claim about a datacenter's city.
fn country(code: &str) -> Option<(&'static str, f64, f64)> {
    Some(match code {
        "nl" => ("Нидерланды", 52.2, 5.3),
        "de" => ("Германия", 51.2, 10.4),
        "fi" => ("Финляндия", 64.0, 26.0),
        "gb" => ("Великобритания", 54.0, -2.0),
        "lv" => ("Латвия", 57.0, 25.0),
        "pl" => ("Польша", 52.0, 19.0),
        "ro" => ("Румыния", 46.0, 25.0),
        "ru" => ("Россия", 61.0, 96.0),
        "se" => ("Швеция", 62.0, 15.0),
        "fr" => ("Франция", 46.6, 2.5),
        "at" => ("Австрия", 47.6, 14.1),
        "es" => ("Испания", 40.0, -4.0),
        "it" => ("Италия", 42.8, 12.8),
        "is" => ("Исландия", 65.0, -19.0),
        "us" => ("США", 39.8, -98.6),
        "sg" => ("Сингапур", 1.35, 103.82),
        "jp" => ("Япония", 36.0, 138.0),
        "au" => ("Австралия", -25.0, 134.0),
        "ca" => ("Канада", 60.0, -105.0),
        "ch" => ("Швейцария", 46.8, 8.2),
        "ua" => ("Украина", 49.0, 32.0),
        _ => return None,
    })
}
fn enrich(node: &mut Value, remna: &Value) {
    node["remnawave_id"] = remna["id"].clone();
    node["remnawave_name"] = remna["name"].clone();
    node["users"] = if now() - remna["synced_at"].as_i64().unwrap_or(0) < 180000 {
        remna["users_online"]
            .as_u64()
            .map_or(Value::Null, |n| json!(n))
    } else {
        Value::Null
    };
    if node["code"].as_str().is_none_or(|code| code == "xx") {
        let code = remna["country_code"]
            .as_str()
            .unwrap_or("xx")
            .to_ascii_lowercase();
        if let Some((name, lat, lon)) = country(&code) {
            node["code"] = json!(code);
            node["country"] = json!(name);
            node["city"] = json!("Город не указан");
            node["lat"] = json!(lat);
            node["lon"] = json!(lon);
            node["location_source"] = json!("Страна из Remnawave · приблизительное положение");
        }
    }
}
pub fn merge(mut agents: Vec<Value>, remna: &[Value]) -> Vec<Value> {
    let mut matched = HashSet::new();
    for agent in &mut agents {
        agent["source"] = json!("agent");
        if let Some(remote) = remna.iter().find(|remote| {
            let Some(address) = remote["address"]
                .as_str()
                .and_then(|v| v.parse::<std::net::IpAddr>().ok())
            else {
                return false;
            };
            agent["ip"]
                .as_str()
                .and_then(|v| v.parse::<std::net::IpAddr>().ok())
                == Some(address)
                || agent["addresses"].as_array().is_some_and(|ips| {
                    ips.iter().any(|v| {
                        v.as_str().and_then(|v| v.parse::<std::net::IpAddr>().ok()) == Some(address)
                    })
                })
        }) {
            matched.insert(remote["id"].as_str().unwrap_or_default().to_owned());
            enrich(agent, remote);
        }
    }
    for remote in remna {
        if matched.contains(remote["id"].as_str().unwrap_or_default()) {
            continue;
        }
        let mut node = json!({"id":format!("remna:{}",remote["id"].as_str().unwrap_or_default()),"name":remote["name"],"ip":remote["address"],"country":"Не указан","city":"Не указан","code":"xx","lat":0,"lon":0,"status":if remote["is_connected"]==true{"online"}else{"offline"},"agent":"Не установлен","cpu":null,"ram":null,"disk":null,"rx":null,"tx":null,"users":null,"last_seen":remote["synced_at"],"group":"Remnawave","source":"remnawave"});
        enrich(&mut node, remote);
        agents.push(node);
    }
    agents
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_by_ip_and_keeps_one_node_with_real_metrics_and_remnawave_counts() {
        let remna = vec![
            json!({"id":"remote","name":"NL node","address":"192.0.2.1","country_code":"NL","users_online":914,"is_connected":true,"synced_at":now()}),
        ];
        let imported = merge(vec![], &remna);
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0]["source"], "remnawave");
        assert!(imported[0]["cpu"].is_null());
        let merged = merge(
            vec![
                json!({"id":"agent","name":"Нидерланды","ip":"192.0.2.1","code":"xx","cpu":11,"last_seen":now()}),
            ],
            &remna,
        );
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0]["id"], "agent");
        assert_eq!(merged[0]["cpu"], 11);
        assert_eq!(merged[0]["users"], 914);
        assert_eq!(merged[0]["code"], "nl");
        assert_eq!(merged[0]["city"], "Город не указан");
        assert!(merged[0]["lat"].as_f64().unwrap() > 50.);
    }
}
