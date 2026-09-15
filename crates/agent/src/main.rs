use anyhow::{Context, Result};
use std::{
    collections::VecDeque,
    io::{BufRead, Seek},
    path::{Path, PathBuf},
    time::Duration,
};
use stealthnet_core::{AgentConfig, Observation, Telemetry, now};
use sysinfo::{Disks, Networks, System};
fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?
    }
    let tmp = path.with_extension("tmp");
    let mut o = std::fs::OpenOptions::new();
    o.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        o.mode(0o600);
    }
    let mut f = o.open(&tmp)?;
    f.write_all(bytes)?;
    f.sync_all()?;
    std::fs::rename(tmp, path)?;
    Ok(())
}
#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let get = |key: &str| {
        args.iter()
            .position(|v| v == key)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    if args.iter().any(|a| a == "--version") {
        println!("stealthnet-agent {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    let config_path = PathBuf::from(
        get("--config").unwrap_or_else(|| "/etc/stealthnet-monitor/agent.json".into()),
    );
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .build()?;
    if args.iter().any(|a| a == "--enroll") {
        if config_path.exists() {
            println!("Existing agent configuration retained");
            return Ok(());
        }
        let panel = get("--panel").context("--panel required")?;
        validate_panel(&panel)?;
        let secret = std::env::var("ENROLLMENT_TOKEN").context("ENROLLMENT_TOKEN required")?;
        let r = client
            .post(format!(
                "{}/api/agent/register",
                panel.trim_end_matches('/')
            ))
            .json(&serde_json::json!({"token":secret}))
            .send()
            .await
            .map_err(|_| anyhow::anyhow!("Registration connection failed"))?;
        if !r.status().is_success() {
            anyhow::bail!("Registration rejected (HTTP {})", r.status().as_u16())
        }
        let mut cfg: AgentConfig = r.json().await.context("Invalid registration response")?;
        cfg.event_file = get("--events");
        write_private(&config_path, &serde_json::to_vec_pretty(&cfg)?)?;
        println!("Agent registered; configuration saved");
        return Ok(());
    }
    let cfg: AgentConfig =
        serde_json::from_slice(&std::fs::read(&config_path).context("Read agent configuration")?)?;
    validate_panel(&cfg.panel)?;
    let queue_path = PathBuf::from(
        get("--queue").unwrap_or_else(|| "/var/lib/stealthnet-monitor-agent/queue.json".into()),
    );
    let mut queue: VecDeque<Telemetry> = match std::fs::read(&queue_path) {
        Ok(v) => serde_json::from_slice(&v).context("Queue is corrupt; refusing to discard it")?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => VecDeque::new(),
        Err(e) => return Err(e.into()),
    };
    let mut sys = System::new_all();
    let mut disks = Disks::new_with_refreshed_list();
    let mut networks = Networks::new_with_refreshed_list();
    let mut timer = tokio::time::interval(Duration::from_secs(15));
    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    timer.tick().await;
    let mut last = std::time::Instant::now();
    let mut events = EventReader::default();
    loop {
        timer.tick().await;
        let elapsed = last.elapsed().as_secs_f64().max(1.);
        last = std::time::Instant::now();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        disks.refresh(true);
        networks.refresh(true);
        let (rx, tx) = networks
            .iter()
            .filter(|(n, _)| {
                !n.starts_with("lo")
                    && !n.starts_with("veth")
                    && !n.starts_with("docker")
                    && !n.starts_with("br-")
            })
            .fold((0u64, 0u64), |(rx, tx), (_, n)| {
                (
                    rx.saturating_add(n.received()),
                    tx.saturating_add(n.transmitted()),
                )
            });
        let disk = disks
            .iter()
            .filter(|d| d.total_space() > 0)
            .map(|d| (d.total_space() - d.available_space()) as f64 / d.total_space() as f64 * 100.)
            .fold(0f64, f64::max);
        let sample = Telemetry {
            id: uuid::Uuid::new_v4().to_string(),
            time: now(),
            cpu: sys.global_cpu_usage() as f64,
            ram: sys.used_memory() as f64 / sys.total_memory().max(1) as f64 * 100.,
            disk,
            rx_bytes_per_sec: rx as f64 / elapsed,
            tx_bytes_per_sec: tx as f64 / elapsed,
            hostname: System::host_name().unwrap_or_else(|| "unknown".into()),
            version: env!("CARGO_PKG_VERSION").into(),
            addresses: networks
                .iter()
                .filter(|(name, _)| {
                    !name.starts_with("lo")
                        && !name.starts_with("docker")
                        && !name.starts_with("veth")
                        && !name.starts_with("br-")
                })
                .flat_map(|(_, network)| network.ip_networks().iter().map(|network| network.addr))
                .filter(|ip| match ip {
                    std::net::IpAddr::V4(ip) => {
                        !ip.is_private()
                            && !ip.is_loopback()
                            && !ip.is_link_local()
                            && !ip.is_unspecified()
                    }
                    std::net::IpAddr::V6(ip) => {
                        !ip.is_loopback()
                            && !ip.is_unspecified()
                            && !ip.is_unicast_link_local()
                            && !ip.is_unique_local()
                    }
                })
                .take(32)
                .map(|ip| ip.to_string())
                .collect(),
            events: cfg
                .event_file
                .as_ref()
                .map(|p| events.read(Path::new(p)))
                .unwrap_or_default(),
        };
        sample.validate(now()).map_err(anyhow::Error::msg)?;
        queue.push_back(sample);
        while queue.len() > 5760 || queue.front().is_some_and(|s| s.time < now() - 86400000) {
            queue.pop_front();
        }
        write_private(&queue_path, &serde_json::to_vec(&queue)?)?;
        for _ in 0..20 {
            let Some(front) = queue.front() else { break };
            let r = client
                .post(format!(
                    "{}/api/agent/telemetry",
                    cfg.panel.trim_end_matches('/')
                ))
                .bearer_auth(&cfg.credential)
                .json(front)
                .send()
                .await;
            match r {
                Ok(r) if r.status().is_success() => {
                    queue.pop_front();
                    write_private(&queue_path, &serde_json::to_vec(&queue)?)?;
                }
                Ok(r) if r.status().as_u16() == 401 => {
                    eprintln!("Agent credentials rejected; queued samples retained");
                    break;
                }
                _ => {
                    eprintln!("Telemetry unavailable; queued samples retained");
                    break;
                }
            }
        }
        if args.iter().any(|a| a == "--once") {
            break;
        }
    }
    Ok(())
}
fn validate_panel(panel: &str) -> Result<()> {
    let url = reqwest::Url::parse(panel)?;
    anyhow::ensure!(
        url.scheme() == "https" || [Some("127.0.0.1"), Some("localhost")].contains(&url.host_str()),
        "HTTPS is required"
    );
    anyhow::ensure!(
        url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "Invalid panel URL"
    );
    Ok(())
}
// Optional newline-delimited observations exported by a configured Xray collector.
// Raw payloads and browsing destinations are not collected by default.
#[derive(Default)]
struct EventReader {
    offset: u64,
    identity: u64,
}
impl EventReader {
    fn read(&mut self, path: &Path) -> Vec<Observation> {
        let Ok(mut file) = std::fs::File::open(path) else {
            return vec![];
        };
        let Ok(meta) = file.metadata() else {
            return vec![];
        };
        #[cfg(unix)]
        let inode = {
            use std::os::unix::fs::MetadataExt;
            meta.ino()
        };
        #[cfg(not(unix))]
        let inode = 0;
        if self.identity != inode || meta.len() < self.offset {
            self.offset = 0;
            self.identity = inode
        }
        if file.seek(std::io::SeekFrom::Start(self.offset)).is_err() {
            return vec![];
        }
        let mut reader = std::io::BufReader::new(file);
        let mut out = vec![];
        for _ in 0..1000 {
            let mut buf = String::new();
            let Ok(n) = reader.read_line(&mut buf) else {
                break;
            };
            if n == 0 || !buf.ends_with('\n') {
                break;
            }
            self.offset += n as u64;
            if buf.len() > 2000 {
                continue;
            }
            if let Ok(e) = serde_json::from_str::<Observation>(&buf) {
                if ["connection", "detection"].contains(&e.kind.as_str())
                    && e.time > now() - 86400000
                    && e.time < now() + 30000
                {
                    out.push(e)
                }
            }
        }
        out
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_remote_plain_http() {
        assert!(validate_panel("http://example.com").is_err());
        assert!(validate_panel("https://example.com").is_ok());
        assert!(validate_panel("http://127.0.0.1:8787").is_ok())
    }
}
