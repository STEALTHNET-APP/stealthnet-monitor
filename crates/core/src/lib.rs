use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
pub fn token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
pub fn hash(s: &str) -> String {
    hex::encode(Sha256::digest(s.as_bytes()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Billing {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub expires_at: Option<i64>,
    #[serde(default)]
    pub monthly_cost: Option<f64>,
    #[serde(default = "default_currency")]
    pub currency: String,
}
fn default_currency() -> String {
    "USD".into()
}
impl Default for Billing {
    fn default() -> Self {
        Self {
            provider: String::new(),
            expires_at: None,
            monthly_cost: None,
            currency: default_currency(),
        }
    }
}
impl Billing {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.provider.len() > 100
            || self.currency.len() != 3
            || !self.currency.chars().all(|c| c.is_ascii_uppercase())
            || self.expires_at.is_some_and(|v| v <= 0 || v > 4102444800000)
            || self
                .monthly_cost
                .is_some_and(|v| !v.is_finite() || v < 0. || v > 10000000.)
        {
            return Err("Неверные данные об аренде сервера");
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrollmentConfig {
    pub name: String,
    #[serde(default)]
    pub address: String,
    pub mode: String,
    pub country: String,
    pub code: String,
    pub city: String,
    pub lat: f64,
    pub lon: f64,
    pub group: String,
    #[serde(default)]
    pub node_secret: Option<String>,
    #[serde(default)]
    pub node_image: Option<String>,
    #[serde(default = "default_port")]
    pub node_port: u16,
    #[serde(default, flatten)]
    pub billing: Billing,
}
fn default_port() -> u16 {
    2222
}
pub fn valid_node_image(image: &str) -> bool {
    image.strip_prefix("remnawave/node:").is_some_and(|tag| {
        !tag.is_empty()
            && tag.len() <= 128
            && tag != "latest"
            && tag.starts_with(|c: char| c.is_ascii_alphanumeric() || c == '_')
            && tag
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    })
}
impl EnrollmentConfig {
    pub fn validate(&self) -> Result<(), &'static str> {
        self.billing.validate()?;
        if !self.address.is_empty() && self.address.parse::<std::net::IpAddr>().is_err() {
            return Err("Неверный IP-адрес сервера");
        }
        if self.name.trim().is_empty()
            || self.name.chars().count() > 80
            || !self
                .name
                .chars()
                .all(|c| c.is_alphanumeric() || "._ -".contains(c))
        {
            return Err(
                "Название сервера: от 1 до 80 символов — буквы, цифры, пробел, точка, дефис или подчёркивание",
            );
        }
        if !["existing", "clean"].contains(&self.mode.as_str()) {
            return Err("Неизвестный сценарий");
        }
        if !self.lat.is_finite()
            || !self.lon.is_finite()
            || self.lat.abs() > 90.
            || self.lon.abs() > 180.
        {
            return Err("Недопустимые координаты");
        }
        if self.mode == "clean" {
            if self
                .node_secret
                .as_ref()
                .is_none_or(|v| v.len() < 16 || v.len() > 10000)
            {
                return Err("Нужен SECRET_KEY из Remnawave");
            }
            if self
                .node_image
                .as_ref()
                .is_none_or(|v| !valid_node_image(v))
            {
                return Err(
                    "Выберите версию образа автоматически или укажите remnawave/node с конкретным тегом",
                );
            }
            if self.node_port == 0 {
                return Err("Недопустимый порт");
            }
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Telemetry {
    pub id: String,
    pub time: i64,
    pub cpu: f64,
    pub ram: f64,
    pub disk: f64,
    pub rx_bytes_per_sec: f64,
    pub tx_bytes_per_sec: f64,
    pub hostname: String,
    pub version: String,
    #[serde(default)]
    pub addresses: Vec<String>,
    #[serde(default)]
    pub events: Vec<Observation>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observation {
    pub id: String,
    pub time: i64,
    pub kind: String,
    pub user: Option<String>,
    pub ip: Option<String>,
    pub evidence: String,
    #[serde(default)]
    pub protocol: Option<String>,
}
impl Telemetry {
    pub fn validate(&self, clock: i64) -> Result<(), &'static str> {
        if uuid::Uuid::parse_str(&self.id).is_err()
            || self.hostname.len() > 250
            || self.version.len() > 50
            || self.events.len() > 1000
            || self.addresses.len() > 32
            || self
                .addresses
                .iter()
                .any(|v| v.parse::<std::net::IpAddr>().is_err())
        {
            return Err("Неверная телеметрия");
        }
        if self.time > clock + 30_000 || self.time < clock - 86_400_000 {
            return Err("Время метрики вне допустимого интервала");
        }
        if [self.cpu, self.ram, self.disk]
            .iter()
            .any(|v| !v.is_finite() || !(0.0..=100.).contains(v))
        {
            return Err("Метрика должна быть в диапазоне 0–100");
        }
        if [self.rx_bytes_per_sec, self.tx_bytes_per_sec]
            .iter()
            .any(|v| !v.is_finite() || *v < 0. || *v > 1e15)
        {
            return Err("Неверное значение сетевой метрики");
        }
        if self.events.iter().any(|e| {
            !["connection", "detection"].contains(&e.kind.as_str())
                || e.id.len() > 100
                || e.evidence.len() > 1000
                || e.user.as_ref().is_some_and(|v| v.len() > 250)
                || e.protocol
                    .as_ref()
                    .is_some_and(|v| !["TCP", "UDP"].contains(&v.as_str()))
                || e.ip
                    .as_ref()
                    .is_some_and(|v| v.parse::<std::net::IpAddr>().is_err())
        }) {
            return Err("Неверное наблюдение");
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub panel: String,
    pub node_id: String,
    pub credential: String,
    #[serde(default)]
    pub enrollment: Option<EnrollmentConfig>,
    #[serde(default)]
    pub event_file: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub metric: String,
    pub threshold: f64,
    pub duration: i64,
    pub repeat: i64,
    pub recovery: bool,
    pub enabled: bool,
    pub scope: String,
    pub severity: String,
}
impl Rule {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.id.is_empty()
            || self.id.len() > 100
            || self.name.is_empty()
            || self.name.len() > 100
            || ![
                "offline",
                "cpu",
                "ram",
                "disk",
                "traffic",
                "complaint",
                "detection",
                "expiry",
            ]
            .contains(&self.metric.as_str())
            || !self.threshold.is_finite()
            || self.threshold < 0.
            || self.duration < 0
            || self.duration > 86400
            || self.repeat < 60
            || self.repeat > 604800
            || !["warning", "critical"].contains(&self.severity.as_str())
        {
            return Err("Неверное правило оповещения");
        }
        Ok(())
    }
    pub fn matches(&self, metric: f64) -> bool {
        self.enabled && metric > self.threshold
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_nonfinite_and_stale() {
        let mut t = Telemetry {
            id: uuid::Uuid::new_v4().to_string(),
            time: now(),
            cpu: 10.,
            ram: 20.,
            disk: 30.,
            rx_bytes_per_sec: 2.,
            tx_bytes_per_sec: 3.,
            hostname: "node".into(),
            version: "test".into(),
            addresses: vec![],
            events: vec![],
        };
        assert!(t.validate(now()).is_ok());
        t.cpu = f64::NAN;
        assert!(t.validate(now()).is_err());
        t.cpu = 10.;
        t.time -= 90000000;
        assert!(t.validate(now()).is_err());
    }
    #[test]
    fn tokens_are_unique_and_hashed() {
        let a = token();
        assert_ne!(a, token());
        assert_eq!(hash(&a).len(), 64);
        assert_ne!(hash(&a), a);
    }
}
