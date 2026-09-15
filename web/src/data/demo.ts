export type Node = {
  source?: "agent" | "remnawave";
  remnawave_id?: string;
  location_source?: string;
  provider?: string;
  expires_at?: number | null;
  monthly_cost?: number | null;
  currency?: string;
  id: string;
  name: string;
  country: string;
  code: string;
  city: string;
  lat: number;
  lon: number;
  status: string;
  cpu: number | null;
  ram: number | null;
  disk: number | null;
  rx: number | null;
  tx: number | null;
  users: number | null;
  ip: string;
  agent: string;
  last_seen: number;
  group: string;
};
export type Row = Record<string, string | number | boolean | null>;
export type Rule = {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  duration: number;
  repeat: number;
  recovery: boolean;
  enabled: boolean;
  scope: string;
  severity: string;
};
export type Snapshot = {
  geoip?: { available: boolean; provider: string; build_epoch: number | null; update_failed: boolean };
  nodes: Node[];
  users: Row[];
  connections: Row[];
  devices: Row[];
  incidents: Row[];
  detections: Row[];
  complaints: Row[];
  deliveries: Row[];
  rules: Rule[];
  metrics: Row[];
  mode: string;
  updated_at: number;
};
export const regions = [
  ["Frankfurt", "Германия", "de", 50.11, 8.68],
  ["Amsterdam", "Нидерланды", "nl", 52.37, 4.9],
  ["Helsinki", "Финляндия", "fi", 60.17, 24.94],
  ["Warsaw", "Польша", "pl", 52.23, 21.01],
  ["London", "Великобритания", "gb", 51.5, -0.12],
  ["Stockholm", "Швеция", "se", 59.33, 18.07],
  ["Paris", "Франция", "fr", 48.86, 2.35],
  ["Vienna", "Австрия", "at", 48.2, 16.37],
  ["Madrid", "Испания", "es", 40.42, -3.7],
  ["Rome", "Италия", "it", 41.9, 12.5],
  ["Reykjavik", "Исландия", "is", 64.15, -21.94],
  ["New York", "США", "us", 40.7, -74],
  ["Singapore", "Сингапур", "sg", 1.35, 103.82],
  ["Tokyo", "Япония", "jp", 35.68, 139.69],
  ["Sydney", "Австралия", "au", -33.87, 151.2],
  ["Toronto", "Канада", "ca", 43.65, -79.38],
  ["Zurich", "Швейцария", "ch", 47.37, 8.54],
  ["Bucharest", "Румыния", "ro", 44.43, 26.1],
] as const;
const now = Date.now();
const baseNodes: Node[] = Array.from({ length: 250 }, (_, i) => {
  const r = regions[i % regions.length];
  return {
    provider: ["Hetzner", "OVHcloud", "Leaseweb", "Vultr"][i % 4],
    expires_at: now + (i < 3 ? [6, 2, 1][i] : 15 + (i % 20)) * 86400000,
    monthly_cost: [19.9, 24, 32, 16][i % 4],
    currency: "EUR",
    id: `node-${i + 1}`,
    name: `${r[0].replace(" ", "-")}-${String(Math.floor(i / regions.length) + 1).padStart(2, "0")}`,
    country: r[1],
    code: r[2],
    city: r[0],
    lat: r[3],
    lon: r[4],
    status: "online",
    cpu: 18 + ((i * 7) % 43),
    ram: 35 + ((i * 11) % 40),
    disk: 28 + ((i * 3) % 46),
    rx: Number((0.011 + (i % 9) * 0.005).toFixed(3)),
    tx: Number((0.009 + (i % 6) * 0.004).toFixed(3)),
    users: 35 + ((i * 13) % 42),
    ip: `192.0.2.${i + 1}`,
    agent: "0.1.0",
    last_seen: now - 5000,
    group: i % 18 < 11 ? "Европа" : "Мир",
  };
});
const overrides = [
  { name: "Frankfurt-01", cpu: 24, ram: 62, rx: 3.1, tx: 1.7, users: 3421 },
  { name: "Amsterdam-02", cpu: 18, ram: 49, rx: 2.6, tx: 1.3, users: 2980 },
  { name: "Helsinki-01", cpu: 32, ram: 68, rx: 1.4, tx: 0.7, users: 1842 },
  {
    name: "Warsaw-03",
    cpu: 76,
    ram: 70,
    disk: 89,
    rx: 1.1,
    tx: 0.7,
    users: 933,
    status: "warning",
  },
  {
    name: "Frankfurt-07",
    country: "Германия",
    code: "de",
    city: "Frankfurt",
    lat: 50.13,
    lon: 8.72,
    cpu: 68,
    ram: 71,
    rx: 0.6,
    tx: 0.3,
    users: 612,
    status: "critical",
  },
  {
    name: "Amsterdam-12",
    country: "Нидерланды",
    code: "nl",
    city: "Amsterdam",
    lat: 52.4,
    lon: 4.94,
    cpu: null,
    ram: null,
    disk: null,
    rx: null,
    tx: null,
    users: null,
    agent: "—",
    last_seen: now - 240000,
    status: "offline",
  },
];
overrides.forEach((v, i) => Object.assign(baseNodes[i], v));
const usedNames = new Set<string>();
baseNodes.forEach((n) => {
  if (usedNames.has(n.name)) n.name += "-B";
  usedNames.add(n.name);
});
// A single coherent fleet total; all demo tables and summary cards derive from this fixture.
const remaining =
  24831 - baseNodes.slice(0, 6).reduce((s, n) => s + (n.users || 0), 0);
baseNodes
  .slice(6)
  .forEach(
    (n, i) =>
      (n.users = Math.floor(remaining / 244) + (i < remaining % 244 ? 1 : 0)),
  );
export const demoRules: Rule[] = [
  {
    id: "expiry",
    name: "Окончание аренды сервера",
    metric: "expiry",
    threshold: 7,
    duration: 0,
    repeat: 86400,
    recovery: true,
    enabled: true,
    scope: "all",
    severity: "warning",
  },
  {
    id: "offline",
    name: "Агент потерял связь",
    metric: "offline",
    threshold: 120,
    duration: 0,
    repeat: 900,
    recovery: true,
    enabled: true,
    scope: "all",
    severity: "critical",
  },
  {
    id: "cpu",
    name: "CPU выше 85%",
    metric: "cpu",
    threshold: 85,
    duration: 300,
    repeat: 900,
    recovery: true,
    enabled: true,
    scope: "all",
    severity: "warning",
  },
  {
    id: "disk",
    name: "Мало места на диске",
    metric: "disk",
    threshold: 90,
    duration: 60,
    repeat: 3600,
    recovery: true,
    enabled: true,
    scope: "all",
    severity: "warning",
  },
  {
    id: "ram",
    name: "Высокая загрузка RAM",
    metric: "ram",
    threshold: 90,
    duration: 300,
    repeat: 900,
    recovery: true,
    enabled: true,
    scope: "all",
    severity: "warning",
  },
  {
    id: "traffic",
    name: "Порог трафика",
    metric: "traffic",
    threshold: 5,
    duration: 120,
    repeat: 900,
    recovery: true,
    enabled: false,
    scope: "all",
    severity: "warning",
  },
  {
    id: "complaint",
    name: "Новая внешняя жалоба",
    metric: "complaint",
    threshold: 1,
    duration: 0,
    repeat: 900,
    recovery: false,
    enabled: true,
    scope: "all",
    severity: "warning",
  },
  {
    id: "detection",
    name: "Обнаружение BitTorrent",
    metric: "detection",
    threshold: 1,
    duration: 0,
    repeat: 900,
    recovery: false,
    enabled: true,
    scope: "all",
    severity: "warning",
  },
];
export function demoSnapshot(): Snapshot {
  return {
    nodes: baseNodes,
    rules: demoRules,
    mode: "demo",
    updated_at: now,
    users: Array.from({ length: 136 }, (_, i) => ({
      id: `user-${i + 1}`,
      name:
        ["alex_92", "maxim_vpn", "maria_k", "denis_pro", "user_1042", "anna_s"][
          i % 6
        ] + (i > 5 ? `_${i}` : ""),
      status: i % 8 ? "online" : "offline",
      connections: 1 + (i % 4),
      devices: 1 + (i % 3),
      traffic: Math.round(16 + i * 3.2),
      node: baseNodes[i % 18].name,
      region: regions[i % 18][1],
      last_seen: now - i * 61000,
    })),
    connections: Array.from({ length: 96 }, (_, i) => ({
      id: `session-${i + 1}`,
      user: ["alex_92", "maxim_vpn", "maria_k", "denis_pro"][i % 4],
      ip: `198.51.100.${i + 1}`,
      region: ["Польша", "Германия", "Украина", "Франция"][i % 4],
      node: baseNodes[i % 18].name,
      protocol: "VLESS",
      duration: `${14 + i} мин`,
      traffic: Math.round(125 + i * 27),
      status: i % 11 ? "online" : "closed",
      source: "Xray access log",
    })),
    devices: Array.from({ length: 68 }, (_, i) => ({
      id: `device-${i + 1}`,
      user: ["alex_92", "maxim_vpn", "maria_k", "denis_pro"][i % 4],
      device: [
        "iPhone 15",
        "Windows PC",
        "Samsung S24",
        "MacBook Pro",
        "Неизвестно",
      ][i % 5],
      os: ["iOS 18", "Windows 11", "Android 15", "macOS", "Неизвестно"][i % 5],
      client: ["Happ", "v2rayN", "Hiddify", "Happ", "Неизвестно"][i % 5],
      hwid: `${(i * 971 + 0xab12).toString(16)}…${(i * 31 + 0xc291).toString(16)}`,
      last_seen: now - i * 932000,
      source: "Remnawave HWID",
    })),
    incidents: [
      {
        id: "INC-1042",
        node: "Frankfurt-07",
        title: "Высокая задержка",
        status: "critical",
        value: "186 мс",
        source: "Демо: внешняя проверка",
        started: now - 21 * 60000,
      },
      {
        id: "INC-1041",
        node: "Amsterdam-12",
        title: "Агент недоступен",
        status: "warning",
        value: "4 мин",
        source: "Heartbeat агента",
        started: now - 4 * 60000,
      },
      {
        id: "INC-1040",
        node: "Warsaw-03",
        title: "Диск заполнен на 89%",
        status: "warning",
        value: "89%",
        source: "Агент · файловая система",
        started: now - 209 * 60000,
      },
    ],
    detections: Array.from({ length: 18 }, (_, i) => ({
      id: `DET-${4201 + i}`,
      user: ["alex_92", "maxim_vpn", "Не определён"][i % 3],
      node: baseNodes[i % 4].name,
      protocol: "BitTorrent",
      evidence: i % 2 ? "Xray protocol matcher" : "BitTorrent handshake",
      confidence: i % 2 ? "Сигнал" : "Высокая",
      status: i % 4 ? "new" : "reviewed",
      time: now - i * 271000,
      source: "Xray · демо-событие",
    })),
    complaints: Array.from({ length: 8 }, (_, i) => ({
      id: `AB-${4581 + i}`,
      subject: [
        "Copyright infringement notice",
        "Abuse report: BitTorrent",
        "Network abuse notification",
      ][i % 3],
      provider: ["Hetzner", "OVHcloud", "Leaseweb"][i % 3],
      ip: `192.0.2.${i + 1}`,
      node: baseNodes[i].name,
      type: i % 2 ? "Abuse" : "DMCA",
      status: i % 3 ? "new" : "reviewed",
      time: now - i * 3701000,
      body: "Демонстрационная жалоба. Совпадение IP и времени требует проверки журналов; запись не подтверждает нарушение конкретного пользователя.",
    })),
    deliveries: Array.from({ length: 6 }, (_, i) => ({
      id: `delivery-${i}`,
      title: [
        "Агент недоступен: Amsterdam-12",
        "CPU: Frankfurt-01",
        "Восстановление: Helsinki-01",
        "Новая внешняя жалоба",
      ][i % 4],
      channel: "Telegram",
      status: i === 5 ? "retry" : "delivered",
      time: now - i * 841000,
      attempts: i === 5 ? 2 : 1,
    })),
    metrics: [],
  };
}
export const emptySnapshot: Snapshot = {
  nodes: [],
  users: [],
  connections: [],
  devices: [],
  incidents: [],
  detections: [],
  complaints: [],
  deliveries: [],
  rules: [],
  metrics: [],
  mode: "live",
  updated_at: 0,
};
export const fmt = (n: number | null | undefined, d = 0) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: d }).format(n);
export const datetime = (v: unknown) =>
  typeof v === "number"
    ? new Date(v).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : String(v ?? "—");
export function series(period: string, seed = 1) {
  const hours =
    period === "15 мин"
      ? 0.25
      : period === "1 ч"
        ? 1
        : period === "6 ч"
          ? 6
          : period === "7 д"
            ? 168
            : 24;
  return Array.from(
    { length: 145 },
    (_, i) =>
      [
        now - hours * 3600000 + i * hours * 25000,
        Math.max(
          0.4,
          8 +
            Math.sin(i * 0.12 + seed) * 2 +
            Math.sin(i * 0.81 + seed) * 0.5 +
            Math.sin(i * 1.9) * 0.36 +
            i * 0.037 +
            Math.max(0, Math.sin(i * 0.042 - 3)) * 8,
        ),
      ] as [number, number],
  );
}
