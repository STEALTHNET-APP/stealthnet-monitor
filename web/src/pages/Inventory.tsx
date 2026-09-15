import { BillingEditor, BillingSummary, Expiry } from "../components/Billing";
import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Server,
  Users,
  TriangleAlert,
  Cpu,
  MemoryStick,
  Database,
  CheckCircle,
  RefreshCw,
  Download,
  ArrowDown,
  ArrowUp,
  Gauge,
  Smartphone,
  Monitor,
  HelpCircle,
  Activity,
  Link2,
} from "lucide-react";
import {
  Header,
  AddServer,
  Panel,
  Stat,
  Tabs,
  SearchBox,
  Table,
  nodeColumns,
  Flag,
  Badge,
  Meter,
  Empty,
  Column,
  CopyText,
} from "../components/ui";
import { Chart } from "../components/Chart";
import { NodeMap } from "../components/NodeMap";
import { api, useStore } from "../data/store";
import {
  useInventory,
  useTraffic,
  volume,
  InventoryKind,
} from "../data/inventory";
import { fmt, datetime, Row } from "../data/demo";
export function exportCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const blob = new Blob(
    [
      "\uFEFF" +
        [
          keys.map(cell).join(","),
          ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
        ].join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Nodes() {
  const { data, refresh, loading } = useStore();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [provider, setProvider] = useState("all");
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const [tab, setTab] = useState("Ноды");
  const nav = useNavigate();
  const nodes = data.nodes.filter(
    (n) =>
      (n.name + " " + n.ip + " " + (n.provider || ""))
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (region === "all" || n.country === region) &&
      (provider === "all" || n.provider === provider) &&
      (group === "all" || n.group === group) &&
      (status === "all" || n.status === status),
  );
  return (
    <>
      <Header
        title="Серверы и ноды"
        sub={`${data.nodes.length} нод в ${new Set(data.nodes.map((n) => n.country)).size} регионах`}
        action={<AddServer />}
      />
      <Tabs
        items={["Ноды", "Серверы", "Группы"]}
        value={tab}
        onChange={setTab}
      />
      <div className="stats four">
        <Stat label="Всего нод" value={data.nodes.length} icon={<Server />} />
        <Stat
          label="Онлайн"
          value={data.nodes.filter((n) => n.status === "online").length}
          icon={<CheckCircle />}
        />
        <Stat
          label="Требуют внимания"
          value={data.nodes.filter((n) => n.status !== "online").length}
          color="var(--amber)"
          icon={<TriangleAlert />}
        />
        <Stat
          label="Пользователи онлайн"
          value={fmt(data.nodes.reduce((s, n) => s + (n.users || 0), 0))}
          icon={<Users />}
        />
      </div>
      <div className="filter-row">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Название, IP или хостер"
        />
        <select
          aria-label="Регион"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="all">Все регионы</option>
          {[...new Set(data.nodes.map((n) => n.country))].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="Статус"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Все статусы</option>
          <option value="online">Онлайн</option>
          <option value="warning">Внимание</option>
          <option value="critical">Критический</option>
          <option value="offline">Нет связи</option>
        </select>
        <select
          aria-label="Хостер"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="all">Все хостеры</option>
          {[...new Set(data.nodes.map((n) => n.provider).filter(Boolean))]
            .sort()
            .map((p) => (
              <option key={p}>{p}</option>
            ))}
        </select>
        {group !== "all" && (
          <button className="button" onClick={() => setGroup("all")}>
            {group} · Сбросить
          </button>
        )}
        <button
          className="button"
          disabled={!nodes.length}
          onClick={() => exportCsv("nodes", nodes)}
        >
          Экспорт CSV
        </button>
      </div>
      <Panel>
        {tab === "Группы" ? (
          <div className="group-grid">
            {[...new Set(nodes.map((n) => n.group))].map((g) => (
              <button
                key={g}
                className="group-card"
                onClick={() => {
                  setTab("Ноды");
                  setQuery("");
                  setGroup(g);
                }}
              >
                <Server size={26} />
                <h2>{g}</h2>
                <p>{nodes.filter((n) => n.group === g).length} нод</p>
              </button>
            ))}
          </div>
        ) : (
          <Table
            rows={nodes}
            columns={
              tab === "Серверы"
                ? [
                    ...nodeColumns.filter((c) =>
                      [
                        "name",
                        "provider",
                        "expires_at",
                        "status",
                        "cpu",
                        "ram",
                        "agent",
                      ].includes(c.key),
                    ),
                    { key: "ip", title: "IP сервера" },
                    {
                      key: "disk",
                      title: "Диск",
                      render: (r) => <Meter value={r.disk} />,
                    },
                  ]
                : nodeColumns
            }
            onRow={(r) => nav("/nodes/" + r.id)}
          />
        )}
      </Panel>
      <Panel className="agent-footer">
        <b>Состояние агентов</b>
        <Badge
          status="online"
          label={`${data.nodes.filter((n) => n.agent !== "—").length} подключены`}
        />
        <span className="muted">
          Последнее обновление: {datetime(data.updated_at)}
        </span>
        <button
          className="button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} />
          Обновить
        </button>
      </Panel>
    </>
  );
}
export function Monitoring() {
  const { data, demo } = useStore();
  const [tab, setTab] = useState("Ресурсы");
  const [node, setNode] = useState("all");
  const nodes = data.nodes.filter((n) => node === "all" || n.id === node);
  const avg = (key: "cpu" | "ram" | "disk") => {
    const a = nodes.filter((n) => n[key] != null);
    return a.length
      ? Math.round(a.reduce((s, n) => s + n[key]!, 0) / a.length)
      : null;
  };
  return (
    <>
      <Header
        title="Мониторинг"
        sub="Ресурсы и доступность инфраструктуры"
        period
        action={
          <select
            aria-label="Нода для мониторинга"
            value={node}
            onChange={(e) => setNode(e.target.value)}
          >
            <option value="all">Все ноды</option>
            {data.nodes.map((n) => (
              <option value={n.id} key={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        }
      />
      <Tabs
        items={["Ресурсы", "Сеть", "Доступность"]}
        value={tab}
        onChange={setTab}
      />
      <div className="stats four">
        <Stat
          icon={<Cpu />}
          label="CPU среднее"
          value={`${fmt(avg("cpu"))}%`}
        />
        <Stat
          icon={<MemoryStick />}
          label="RAM"
          value={`${fmt(avg("ram"))}%`}
        />
        <Stat icon={<Database />} label="Диск" value={`${fmt(avg("disk"))}%`} />
        <Stat
          icon={<CheckCircle />}
          label="Агенты доступны"
          value={`${fmt(nodes.length ? (nodes.filter((n) => n.status !== "offline").length / nodes.length) * 100 : null, 1)}%`}
        />
      </div>
      <div className="grid two">
        {(tab === "Ресурсы"
          ? [
              ["Загрузка CPU", "cpu"],
              ["Использование памяти", "ram"],
              ["Заполнение диска", "disk"],
              ["Сетевой трафик", "traffic"],
            ]
          : tab === "Сеть"
            ? [
                ["Входящий и исходящий трафик", "traffic"],
                ["Задержка", "latency"],
              ]
            : [
                ["Время отклика", "latency"],
                ["Последние сигналы агентов", "cpu"],
              ]
        ).map(([name, kind], i) => (
          <Panel
            key={kind}
            title={name}
            sub={
              !demo && kind === "latency"
                ? "Внешняя проверка не настроена"
                : undefined
            }
          >
            <Chart
              kind={kind}
              seed={i + 1}
              height={194}
              nodeId={node === "all" ? undefined : node}
            />
          </Panel>
        ))}
      </div>
      <Panel
        title="Нагрузка по нодам"
        action={<span className="tiny muted">CPU · наведите на интервал</span>}
        className="heatmap-panel"
      >
        {demo ? (
          <div className="heatmap">
            {nodes.slice(0, 8).map((n, j) => (
              <div className="heat-row" key={n.id}>
                <Link to={"/nodes/" + n.id}>{n.name}</Link>
                {Array.from({ length: 48 }, (_, i) => {
                  const v = Math.round(
                    25 +
                      Math.abs(Math.sin(i * 0.22 + j) * 45) +
                      (j === 3 && i > 28 ? 20 : 0),
                  );
                  return (
                    <div
                      tabIndex={0}
                      key={i}
                      style={{
                        background:
                          v > 85
                            ? "#f27650"
                            : v > 70
                              ? "#dec65b"
                              : `hsl(156 43% ${24 + v * 0.38}%)`,
                      }}
                      title={`${n.name} · ${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"} · CPU ${v}%`}
                      aria-label={`${n.name}: CPU ${v}%`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="История собирается"
            text="Графики выше показывают принятые метрики. Тепловая карта требует накопленной истории."
          />
        )}
      </Panel>
    </>
  );
}
export function Traffic() {
  const { data, demo, period } = useStore();
  const [tab, setTab] = useState("Динамика");
  const factor =
    period === "1 ч"
      ? 1 / 24
      : period === "6 ч"
        ? 0.25
        : period === "7 д"
          ? 7
          : 1;
  const totals = useTraffic(Math.round(factor * 24));
  const countries = new Map<string, { code: string; bytes: number }>();
  for (const r of totals?.nodes || []) {
    const node = data.nodes.find((n) => n.id === r.id);
    const name = node?.country || "Не определён";
    const current = countries.get(name) || {
      code: node?.code || "xx",
      bytes: 0,
    };
    current.bytes += r.rx_bytes + r.tx_bytes;
    countries.set(name, current);
  }
  const inbound = totals?.total_bytes
    ? Math.round((totals.rx_bytes / totals.total_bytes) * 100)
    : 0;
  return (
    <>
      <Header
        title="Трафик"
        sub="Потребление и динамика сети"
        period
        action={
          <button
            className="button primary"
            onClick={() =>
              exportCsv(
                "traffic",
                data.nodes.map((n) => ({
                  node: n.name,
                  rx_gbps: n.rx,
                  tx_gbps: n.tx,
                })),
              )
            }
          >
            <Download size={18} />
            Экспорт
          </button>
        }
      />
      <Tabs
        items={["Динамика", "По нодам", "По пользователям"]}
        value={tab}
        onChange={setTab}
      />
      <div className="stats four">
        {[
          ["За период", 126.4, Database],
          ["Входящий", 82.1, ArrowDown],
          ["Исходящий", 44.3, ArrowUp],
          ["Пик на одной ноде", 28.6, Gauge],
        ].map(([name, v, Icon], i) => {
          const I = Icon as typeof Database;
          return (
            <Stat
              key={String(name)}
              icon={<I />}
              label={String(name)}
              value={
                demo
                  ? `${fmt(Number(v) * (i === 3 ? 1 : factor), 1)} ${i === 3 ? "Гбит/с" : "ТБ"}`
                  : i === 3
                    ? totals?.nodes.length
                      ? `${fmt(Math.max(...totals.nodes.map((n) => n.peak_gbps)), 2)} Гбит/с`
                      : "—"
                    : volume(
                        i === 0
                          ? totals?.total_bytes
                          : i === 1
                            ? totals?.rx_bytes
                            : totals?.tx_bytes,
                      )
              }
              note={demo ? undefined : "По собранным замерам агентов"}
            />
          );
        })}
      </div>
      {tab === "Динамика" && (
        <div className="split wide-left">
          <Panel title="Динамика трафика">
            <Chart height={295} />
          </Panel>
          <Panel title="Распределение по регионам">
            <div className="region-list roomy">
              {(demo
                ? ([
                    ["Германия", { code: "de", bytes: 38 }],
                    ["Нидерланды", { code: "nl", bytes: 27 }],
                    ["Финляндия", { code: "fi", bytes: 18 }],
                    ["Другие", { code: "xx", bytes: 17 }],
                  ] as [string, { code: string; bytes: number }][])
                : [...countries].sort((a, b) => b[1].bytes - a[1].bytes)
              ).map(([name, r]) => (
                <div key={name}>
                  <Flag code={r.code} />
                  <span>{name}</span>
                  <Meter
                    value={
                      demo
                        ? r.bytes
                        : (r.bytes / Math.max(1, totals?.total_bytes || 0)) *
                          100
                    }
                    color="var(--blue)"
                  />
                </div>
              ))}
            </div>
            <div className="divider" />
            <h3>Соотношение входящего и исходящего</h3>
            <div className="traffic-ratio">
              <i style={{ width: demo ? "65%" : `${inbound}%` }} />
            </div>
            <div className="spread">
              <span className="mint">
                Входящий {demo ? "65%" : totals ? `${inbound}%` : "—"}
              </span>
              <span className="blue">
                Исходящий{" "}
                {demo
                  ? "35%"
                  : totals
                    ? `${totals.total_bytes ? 100 - inbound : 0}%`
                    : "—"}
              </span>
            </div>
          </Panel>
        </div>
      )}
      <Panel title="Лидеры по трафику">
        {tab === "По пользователям" ? (
          <Table
            rows={data.users as (Row & { id: string })[]}
            columns={userColumns.filter((c) =>
              ["name", "traffic", "node", "status"].includes(c.key),
            )}
          />
        ) : (
          <Table
            rows={data.nodes}
            columns={nodeColumns.filter((c) =>
              ["name", "country", "traffic", "users"].includes(c.key),
            )}
            pageSize={6}
          />
        )}
      </Panel>
    </>
  );
}
export const userColumns: Column<Row & { id: string }>[] = [
  {
    key: "name",
    title: "Пользователь",
    sort: (r) => String(r.name),
    render: (r) => (
      <>
        <span className="avatar mini">
          {String(r.name).slice(0, 2).toUpperCase()}
        </span>
        <b>{r.name}</b>
      </>
    ),
  },
  {
    key: "status",
    title: "Статус",
    render: (r) => <Badge status={String(r.status)} />,
  },
  { key: "node", title: "Последняя нода" },
  { key: "traffic", title: "Трафик, ГБ", sort: (r) => Number(r.traffic) },
  {
    key: "connections",
    title: "Подключения",
    sort: (r) => Number(r.connections),
  },
  { key: "devices", title: "Устройства", sort: (r) => Number(r.devices) },
  {
    key: "last_seen",
    title: "Последняя активность",
    render: (r) => datetime(r.last_seen),
  },
];
export function ConnectionUser({
  value,
  row,
}: {
  value: Row["user"];
  row?: Row;
}) {
  const { data } = useStore();
  const user = data.users.find(
    (u) =>
      u.id === value ||
      u.name === value ||
      (u.remna_id != null && String(u.remna_id) === String(value)),
  );
  if (row?.user_id)
    return <Link to={"/users/" + row.user_id}>{row.user_name || value}</Link>;
  return user ? (
    <Link to={"/users/" + user.id}>{user.name}</Link>
  ) : (
    <span title="Идентификатор пользователя из журнала Xray">
      {String(value || "Не определён")}
    </span>
  );
}
const connectionColumns: Column<Row & { id: string }>[] = [
  {
    key: "user",
    title: "Пользователь",
    render: (r) => <ConnectionUser value={r.user} row={r} />,
  },
  { key: "node", title: "Нода" },
  { key: "ip", title: "Наблюдаемый IP" },
  { key: "region", title: "Регион" },
  { key: "protocol", title: "Протокол" },
  {
    key: "last_seen",
    title: "Последняя активность",
    render: (r) => datetime(r.last_seen || r.time),
  },
  {
    key: "duration",
    title: "Наблюдаемая длительность",
    render: (r) =>
      r.duration_seconds == null ? (
        <span title="Обновите агент для измерения длительности">—</span>
      ) : (
        `${Math.floor(Number(r.duration_seconds) / 3600)} ч ${Math.floor(Number(r.duration_seconds) / 60) % 60} мин ${Number(r.duration_seconds) % 60} с`
      ),
  },
  {
    key: "traffic",
    title: "Трафик канала, МБ",
    render: (r) => (
      <span title={String(r.traffic_scope || "Счётчики не поступили")}>
        {r.traffic == null ? "—" : fmt(Number(r.traffic), 2)}
      </span>
    ),
  },
  {
    key: "network_operator",
    title: "Оператор / ASN",
    render: (r) => (r.asn ? `${r.network_operator} · AS${r.asn}` : "—"),
  },
  {
    key: "network_type",
    title: "Тип сети",
    render: (r) => (
      <span title={String(r.network_source || "")}>
        {r.network_type || "Не определён"}
      </span>
    ),
  },
  {
    key: "rtt_ms",
    title: "RTT, мс",
    render: (r) => (r.rtt_ms == null ? "—" : fmt(Number(r.rtt_ms), 1)),
  },
];
const deviceColumns: Column<Row & { id: string }>[] = [
  {
    key: "device",
    title: "Устройство",
    render: (r) => (
      <>
        <Smartphone size={17} />
        {r.device}
      </>
    ),
  },
  { key: "os", title: "ОС" },
  { key: "client", title: "Клиент" },
  {
    key: "user",
    title: "Пользователь",
    render: (r) => <ConnectionUser value={r.user} row={r} />,
  },
  {
    key: "last_seen",
    title: "Последний запрос подписки",
    render: (r) => datetime(r.last_seen),
  },
  { key: "source", title: "Источник" },
];
export function RecordList({
  kind,
  userId = "",
  nodeId = "",
  q = "",
  filter = "all",
  onRow,
}: {
  kind: InventoryKind;
  userId?: string;
  nodeId?: string;
  q?: string;
  filter?: string;
  onRow?: (r: Row & { id: string }) => void;
}) {
  const result = useInventory(kind, q, nodeId || filter, userId);
  const columns =
    kind === "user"
      ? userColumns
      : kind === "device"
        ? deviceColumns
        : kind === "detection"
          ? [
              {
                key: "user",
                title: "Пользователь",
                render: (r: Row) => <ConnectionUser value={r.user} row={r} />,
              },
              { key: "evidence", title: "Признак" },
              { key: "node", title: "Нода" },
              {
                key: "time",
                title: "Время",
                render: (r: Row) => datetime(r.time),
              },
            ]
          : connectionColumns;
  return (
    <>
      <div className="filter-row">
        <span className="muted" role="status">
          {result.loading ? "Обновление…" : `Найдено: ${fmt(result.total)}`}
        </span>
        <button
          className="button"
          disabled={!result.rows.length || result.loading}
          onClick={() => exportCsv(kind, result.rows)}
        >
          CSV этой страницы
        </button>
      </div>
      {result.error ? (
        <p role="alert" className="error">
          {result.error}
        </p>
      ) : (
        <Table
          rows={result.rows as (Row & { id: string })[]}
          columns={
            kind === "connection" && onRow
              ? [
                  ...columns,
                  {
                    key: "details",
                    title: "",
                    render: (r) => (
                      <button className="button" onClick={() => onRow(r)}>
                        Подробности
                      </button>
                    ),
                  },
                ]
              : columns
          }
          onRow={kind === "connection" ? undefined : onRow}
          remote={result.remote}
          pageSize={50}
          emptyText={
            result.loading
              ? "Загрузка…"
              : q || filter !== "all"
                ? "Ничего не найдено"
                : "Пока нет записей"
          }
        />
      )}
    </>
  );
}
function AccountConnections({ row }: { row: Row }) {
  if (!row.user_id)
    return (
      <p className="muted">Учётная запись ещё не сопоставлена с Remnawave.</p>
    );
  return (
    <Panel
      title="Подключения учётной записи"
      action={<Link to={"/users/" + row.user_id}>Профиль пользователя →</Link>}
    >
      <p className="footnote">
        Связь через аккаунт {row.user_name}. HWID не передаётся в журнале VPN:
        конкретное устройство каждого соединения не подтверждено.
      </p>
      <RecordList kind="connection" userId={String(row.user_id)} />
    </Panel>
  );
}
export function People({
  kind = "users",
}: {
  kind?: "users" | "connections" | "devices";
}) {
  const { data, demo } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [tab, setTab] = useState("Все");
  const [selected, setSelected] = useState<Row>();
  const [filter, setFilter] = useState("all");
  const [summary, setSummary] = useState<{
    user: number;
    connection: number;
    device: number;
    detection: number;
    mobile: number;
    desktop: number;
    other: number;
    online_channels: number;
    device_os: { name: string; count: number }[];
    capabilities?: { hwid_available?: boolean; hwid_error?: string };
  }>();
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    api<typeof summary>("/inventory-summary", { signal: controller.signal })
      .then(setSummary)
      .catch(() => {});
    return () => controller.abort();
  }, [demo, data.updated_at]);
  const isDevices = kind === "devices";
  const inventoryKind = (
    { users: "user", connections: "connection", devices: "device" } as const
  )[kind];
  useEffect(() => {
    setSelected(undefined);
    setFilter("all");
    setTab("Все");
  }, [kind]);
  return (
    <>
      <Header
        title={
          isDevices
            ? "Устройства"
            : kind === "users"
              ? "Пользователи"
              : "Подключения"
        }
        sub={
          isDevices
            ? "Устройства из запросов подписки и подключения их аккаунтов"
            : "Поиск по всей базе мониторинга"
        }
      />
      {isDevices && (
        <Tabs
          items={["Все", "Связи с подключениями"]}
          value={tab}
          onChange={setTab}
        />
      )}
      {isDevices && tab === "Связи с подключениями" && (
        <p className="muted">
          Выберите устройство, чтобы увидеть подключения, IP и активность его
          учётной записи.
        </p>
      )}
      <div className="stats four">
        <Stat
          icon={isDevices ? <Smartphone /> : <Users />}
          label={isDevices ? "Зарегистрировано" : "Всего записей"}
          value={demo ? data[kind].length : (summary?.[inventoryKind] ?? "—")}
          spark={false}
        />
        <Stat
          icon={isDevices ? <Smartphone /> : <Link2 />}
          label={isDevices ? "Мобильные ОС" : "TCP-каналов онлайн"}
          value={
            isDevices
              ? (summary?.mobile ?? "—")
              : (summary?.online_channels ?? "—")
          }
          spark={false}
        />
        <Stat
          icon={isDevices ? <Monitor /> : <Server />}
          label={isDevices ? "ОС компьютеров" : "Нод в панели"}
          value={isDevices ? (summary?.desktop ?? "—") : data.nodes.length}
          spark={false}
        />
        <Stat
          icon={isDevices ? <HelpCircle /> : <TriangleAlert />}
          label={
            isDevices ? "Другие ОС / неизвестно" : "Обнаружений BitTorrent"
          }
          value={
            isDevices ? (summary?.other ?? "—") : (summary?.detection ?? "—")
          }
          spark={false}
        />
      </div>
      {isDevices && summary?.capabilities?.hwid_available === false && (
        <p role="status" className="muted">
          Импорт HWID недоступен: {summary.capabilities.hwid_error}. Показан
          сохранённый список.
        </p>
      )}
      {isDevices && summary?.device_os && (
        <Panel title="Операционные системы">
          <div className="distribution">
            {summary.device_os.slice(0, 10).map((d) => (
              <div key={d.name}>
                <span>
                  {d.name} · {fmt(d.count)}
                </span>
                <Meter
                  value={(d.count / Math.max(1, summary.device)) * 100}
                  color="var(--blue)"
                />
              </div>
            ))}
          </div>
        </Panel>
      )}
      {!isDevices && (
        <Panel title="Пользователи онлайн на нодах">
          <Chart kind="users" height={128} compact />
        </Panel>
      )}
      <div className="filter-row">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={
            isDevices
              ? "HWID, устройство или пользователь"
              : "Пользователь, UUID или IP"
          }
        />
        <select
          aria-label={isDevices ? "Операционная система" : "Нода"}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{isDevices ? "Все ОС" : "Все ноды"}</option>
          {(isDevices
            ? [...new Set(data.devices.map((d) => String(d.os)))]
            : data.nodes.map((n) => n.name)
          ).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <Panel>
        <RecordList
          kind={inventoryKind}
          q={q}
          filter={filter}
          onRow={(r) =>
            kind === "users" ? nav("/users/" + r.id) : setSelected(r)
          }
        />
      </Panel>
      {selected && (
        <>
          <Panel
            title={isDevices ? "Устройство" : "Подключение"}
            action={
              <button className="button" onClick={() => setSelected(undefined)}>
                Закрыть
              </button>
            }
          >
            <dl className="details">
              {(isDevices ? deviceColumns : connectionColumns).map((c) => (
                <div key={c.key}>
                  <dt>{c.title}</dt>
                  <dd>
                    {c.render
                      ? c.render(selected as Row & { id: string })
                      : String(selected[c.key] ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="footnote">Источник: {selected.source}</p>
          </Panel>
          <AccountConnections row={selected} />
        </>
      )}
      {isDevices && (
        <p className="footnote">
          HWID отражает регистрацию при запросе подписки. Он не подтверждает,
          что устройство сейчас подключено к VPN.
        </p>
      )}
    </>
  );
}
export function NodeDetail() {
  const { id } = useParams();
  const { data } = useStore();
  const [tab, setTab] = useState("Обзор");
  const node = data.nodes.find((n) => n.id === id);
  if (!node)
    return (
      <Empty
        title="Нода не найдена"
        action={<Link to="/nodes">К списку нод</Link>}
      />
    );
  return (
    <>
      <Header
        title={node.name}
        sub={`${node.city}, ${node.country} · ${node.ip}`}
        period
        action={
          <Link className="button" to={"/map?node=" + node.id}>
            Показать на карте
          </Link>
        }
      />
      <div className="node-status-line">
        <Flag code={node.code} />
        <Badge status={node.status} />
        <span>
          {node.source === "remnawave"
            ? "Remnawave · агент не установлен"
            : `Агент ${node.agent}`}
        </span>
        <span className="muted">Данные: {datetime(node.last_seen)}</span>
      </div>
      <Tabs
        items={[
          "Обзор",
          "Метрики",
          "Подключения",
          "События",
          "Хостер и аренда",
          "Конфигурация",
        ]}
        value={tab}
        onChange={setTab}
      />
      {node.source === "remnawave" && (
        <div className="notice-box">
          <p>
            Нода загружена из Remnawave. Для CPU, памяти, трафика и журнала
            подключений установите агент.
          </p>
          <Link
            className="button"
            to={
              "/add-server?" +
              new URLSearchParams({
                name: node.name,
                address: node.ip,
                region: "xx",
              }).toString()
            }
          >
            Установить агент
          </Link>
        </div>
      )}
      {tab === "Хостер и аренда" ? (
        <BillingEditor node={node} />
      ) : ["Обзор", "Метрики"].includes(tab) ? (
        <>
          <div className="stats four">
            <Stat label="CPU" value={`${fmt(node.cpu)}%`} icon={<Cpu />} />
            <Stat
              label="RAM"
              value={`${fmt(node.ram)}%`}
              icon={<MemoryStick />}
            />
            <Stat
              label="Трафик"
              value={`${fmt(node.rx == null ? null : node.rx + (node.tx || 0), 1)} Гбит/с`}
              icon={<Gauge />}
            />
            <Stat
              label="Пользователи онлайн"
              value={fmt(node.users)}
              icon={<Users />}
            />
          </div>
          <div className="split wide-left">
            <div className="stack">
              <Panel title="Трафик ноды">
                <Chart nodeId={node.id} height={250} />
              </Panel>
              <div className="grid two">
                <Panel title="Загрузка CPU">
                  <Chart nodeId={node.id} kind="cpu" height={175} compact />
                </Panel>
                <Panel title="Использование памяти">
                  <Chart nodeId={node.id} kind="ram" height={175} compact />
                </Panel>
              </div>
            </div>
            <div className="stack">
              <Panel title="Информация о сервере">
                <dl className="details">
                  <BillingSummary node={node} />
                  {[
                    ["IP-адрес", node.ip],
                    ["Регион", node.country],
                    ["Группа", node.group],
                    ["Версия агента", node.agent],
                    ["Диск", `${fmt(node.disk)}%`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
              <Panel title="Расположение" sub={node.location_source}>
                <NodeMap
                  world
                  nodes={[node]}
                  selected={node}
                  connections={false}
                />
              </Panel>
            </div>
          </div>
        </>
      ) : tab === "Подключения" ? (
        <Panel>
          <RecordList kind="connection" nodeId={node.id} />
        </Panel>
      ) : tab === "События" ? (
        <Panel>
          <Table
            columns={[
              { key: "id", title: "Событие" },
              { key: "title", title: "Описание" },
              {
                key: "status",
                title: "Статус",
                render: (r) => <Badge status={String(r.status)} />,
              },
              {
                key: "started",
                title: "Начало",
                render: (r) => datetime(r.started),
              },
            ]}
            rows={
              data.incidents.filter((r) => r.node === node.name) as (Row & {
                id: string;
              })[]
            }
          />
        </Panel>
      ) : (
        <Panel title="Конфигурация подключения">
          <dl className="details">
            <div>
              <dt>ID агента</dt>
              <dd>{node.id}</dd>
            </div>
            <div>
              <dt>Источник</dt>
              <dd>
                {node.source === "remnawave"
                  ? "Remnawave API · только чтение"
                  : "Исходящая телеметрия по HTTPS"}
              </dd>
            </div>
          </dl>
          <p className="muted">
            Конфигурация агента хранится на сервере:
            /etc/stealthnet-monitor/agent.json
          </p>
          <CopyText text="sudo systemctl status stealthnet-monitor-agent" />
        </Panel>
      )}
    </>
  );
}
export function UserDetail() {
  const { id = "" } = useParams();
  const { data, demo } = useStore();
  const [tab, setTab] = useState("Обзор");
  const [loaded, setLoaded] = useState<Row>();
  const [error, setError] = useState("");
  const [trafficHistory, setTrafficHistory] = useState<
    [number, number | null][]
  >([]);
  const [capabilities, setCapabilities] = useState<{
    hwid_available?: boolean;
    hwid_error?: string;
  }>();
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    api<{
      user: Row;
      traffic_history?: { time: number; value: number }[];
      capabilities?: { hwid_available?: boolean; hwid_error?: string };
    }>("/users/" + encodeURIComponent(id) + "/detail", {
      signal: controller.signal,
    })
      .then((v) => {
        setLoaded(v.user);
        setCapabilities(v.capabilities);
        setTrafficHistory(
          (v.traffic_history || []).map((p) => [p.time, p.value]),
        );
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, demo, data.updated_at]);
  const user = demo
    ? data.users.find((r) => r.id === id)
    : loaded?.id === id
      ? loaded
      : undefined;
  if (error) return <Empty title={error} />;
  if (!user)
    return (
      <Empty title={demo ? "Пользователь не найден" : "Загрузка профиля…"} />
    );
  return (
    <>
      <Header
        title={String(user.name)}
        sub={`Пользователь · ${user.id}`}
        action={
          <Link to="/users" className="button">
            Все пользователи
          </Link>
        }
      />
      <Tabs
        items={["Обзор", "Подключения", "Устройства", "События"]}
        value={tab}
        onChange={setTab}
      />
      <div className="stats four">
        <Stat
          icon={<Activity />}
          label="Статус аккаунта"
          value={<Badge status={String(user.status)} />}
        />
        <Stat
          icon={<Database />}
          label="Трафик по данным Remnawave"
          value={
            user.traffic == null ? "—" : `${fmt(Number(user.traffic), 2)} ГБ`
          }
        />
        <Stat
          icon={<Link2 />}
          label="Наблюдаемые подключения"
          value={user.connections ?? "—"}
        />
        <Stat
          icon={<Smartphone />}
          label="Зарегистрированные устройства"
          value={user.devices ?? "—"}
        />
      </div>
      {capabilities?.hwid_available === false && (
        <p role="status" className="muted">
          Импорт устройств недоступен: {capabilities.hwid_error}. Показаны
          сохранённые записи.
        </p>
      )}
      {tab === "Обзор" && (
        <div className="split wide-left">
          <Panel title="Трафик пользователя">
            <Chart
              height={250}
              points={trafficHistory}
              label="Счётчик Remnawave"
              valueUnit=" ГБ"
            />
            <p className="footnote">
              История счётчика этого пользователя с момента сбора. Снижение
              значения означает сброс счётчика в Remnawave.
            </p>
          </Panel>
          <Panel title="Профиль">
            <dl className="details">
              {[
                ["Последняя нода", user.node],
                ["Регион последнего наблюдения", user.region],
                ["Последняя активность", datetime(user.last_seen)],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt>{k}</dt>
                  <dd>{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="footnote">
              Подключения — записи, наблюдаемые агентами за срок хранения.
              Устройства — HWID этой учётной записи, полученные из Remnawave.
            </p>
          </Panel>
        </div>
      )}
      <Panel
        title={
          tab === "Устройства"
            ? "Устройства учётной записи"
            : tab === "События"
              ? "Обнаружения BitTorrent"
              : "Подключения учётной записи"
        }
      >
        <RecordList
          key={tab + id}
          kind={
            tab === "Устройства"
              ? "device"
              : tab === "События"
                ? "detection"
                : "connection"
          }
          userId={id}
        />
      </Panel>
    </>
  );
}
