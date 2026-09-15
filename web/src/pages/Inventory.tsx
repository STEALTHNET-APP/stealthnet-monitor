import { BillingEditor, BillingSummary, Expiry } from "../components/Billing";
import { useState } from "react";
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
import { useStore } from "../data/store";
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
          ["Пиковая скорость", 28.6, Gauge],
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
                  : "—"
              }
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
              {["Германия", "Нидерланды", "Финляндия", "Другие"].map((r, i) => (
                <div key={r}>
                  <Flag code={["de", "nl", "fi", "xx"][i]} />
                  <span>{r}</span>
                  <Meter
                    value={demo ? [38, 27, 18, 17][i] : null}
                    color={i ? "var(--blue)" : "var(--mint)"}
                  />
                </div>
              ))}
            </div>
            <div className="divider" />
            <h3>Соотношение входящего и исходящего</h3>
            <div className="traffic-ratio">
              <i style={{ width: demo ? "65%" : "0%" }} />
            </div>
            <div className="spread">
              <span className="mint">Входящий {demo ? "65%" : "—"}</span>
              <span className="blue">Исходящий {demo ? "35%" : "—"}</span>
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
const connectionColumns: Column<Row & { id: string }>[] = [
  { key: "user", title: "Пользователь" },
  { key: "node", title: "Нода" },
  { key: "ip", title: "Наблюдаемый IP" },
  { key: "region", title: "Регион" },
  { key: "protocol", title: "Протокол" },
  { key: "duration", title: "Длительность" },
  { key: "traffic", title: "Трафик, МБ", sort: (r) => Number(r.traffic) },
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
  { key: "user", title: "Пользователь" },
  {
    key: "last_seen",
    title: "Последний запрос подписки",
    render: (r) => datetime(r.last_seen),
  },
  { key: "source", title: "Источник" },
];
export function People({
  kind = "users",
}: {
  kind?: "users" | "connections" | "devices";
}) {
  const { data } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [tab, setTab] = useState("Все");
  const [selected, setSelected] = useState<Row>();
  const [filter, setFilter] = useState("all");
  const rows = data[kind].filter(
    (r) =>
      Object.values(r).join(" ").toLowerCase().includes(q.toLowerCase()) &&
      (tab !== "Онлайн" || r.status === "online") &&
      (filter === "all" || r.node === filter || r.os === filter),
  );
  const title =
    kind === "users"
      ? "Пользователи"
      : kind === "connections"
        ? "Подключения"
        : "Устройства";
  const items =
    kind === "users"
      ? ["Все", "Онлайн"]
      : kind === "connections"
        ? ["Все", "История"]
        : ["Все", "Связи с подключениями"];
  const columns =
    kind === "users"
      ? userColumns
      : kind === "connections"
        ? connectionColumns
        : deviceColumns;
  const isDevices = kind === "devices";
  return (
    <>
      <Header
        title={title}
        sub={
          kind === "users"
            ? "Учётные записи и активность"
            : kind === "connections"
              ? "Наблюдаемые соединения пользователей"
              : "Сведения из клиентских приложений"
        }
      />
      <Tabs items={items} value={tab} onChange={setTab} />
      {isDevices && tab === "Связи с подключениями" ? (
        <Panel>
          <Empty
            title="Прямой связи с подключением нет"
            text="HWID приходит при запросе подписки. Remnawave не подтверждает, с какого устройства установлено VPN-соединение."
          />
        </Panel>
      ) : (
        <>
          <div className="stats four">
            <Stat
              icon={isDevices ? <Server /> : <Users />}
              label={isDevices ? "Зарегистрировано" : "Всего записей"}
              value={fmt(data[kind].length)}
            />
            <Stat
              icon={isDevices ? <Smartphone /> : <Activity />}
              label={isDevices ? "Мобильные" : "Онлайн"}
              value={
                isDevices
                  ? data.devices.filter((d) => /iOS|Android/.test(String(d.os)))
                      .length
                  : data[kind].filter((r) => r.status === "online").length
              }
            />
            <Stat
              icon={isDevices ? <Monitor /> : <Link2 />}
              label={isDevices ? "ПК" : "Ноды"}
              value={
                isDevices
                  ? data.devices.filter((d) =>
                      /Windows|macOS/.test(String(d.os)),
                    ).length
                  : new Set(data[kind].map((r) => r.node)).size
              }
            />
            <Stat
              icon={isDevices ? <HelpCircle /> : <TriangleAlert />}
              label={isDevices ? "Не определено" : "События"}
              value={
                isDevices
                  ? data.devices.filter((d) => d.os === "Неизвестно").length
                  : data.detections.length
              }
            />
          </div>
          {isDevices ? (
            <div className="grid two">
              {["os", "client"].map((field) => (
                <Panel
                  title={
                    field === "os"
                      ? "Распределение по операционным системам"
                      : "Распределение по клиентам"
                  }
                  key={field}
                >
                  <div className="distribution">
                    {[
                      ...new Set(data.devices.map((r) => String(r[field]))),
                    ].map((v) => (
                      <div key={v}>
                        <span>{v}</span>
                        <Meter
                          value={Math.round(
                            (data.devices.filter((r) => r[field] === v).length /
                              data.devices.length) *
                              100,
                          )}
                          color="var(--blue)"
                        />
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel
              title={
                kind === "users"
                  ? "Активность пользователей"
                  : "Активность подключений"
              }
            >
              <Chart kind="users" height={128} compact />
            </Panel>
          )}
          <div className="filter-row">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder={
                isDevices
                  ? "HWID или пользователь"
                  : "Пользователь, UUID или IP"
              }
            />
            <select
              aria-label={isDevices ? "Операционная система" : "Нода"}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{isDevices ? "Все ОС" : "Все ноды"}</option>
              {[
                ...new Set(
                  data[kind].map((r) => String(r[isDevices ? "os" : "node"])),
                ),
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <button
              className="button"
              onClick={() => exportCsv(kind, rows)}
              disabled={!rows.length}
            >
              Экспорт CSV
            </button>
          </div>
          <div className={selected ? "split record-split" : ""}>
            <Panel>
              <Table
                rows={rows as (Row & { id: string })[]}
                columns={columns}
                onRow={(r) =>
                  kind === "users" ? nav("/users/" + r.id) : setSelected(r)
                }
              />
              {isDevices && (
                <p className="footnote">
                  Регистрация устройства не подтверждает активное
                  VPN-соединение.
                </p>
              )}
            </Panel>
            {selected && (
              <Panel
                title={isDevices ? "Устройство" : "Подключение"}
                action={
                  <button
                    aria-label="Закрыть подробности"
                    onClick={() => setSelected(undefined)}
                  >
                    ×
                  </button>
                }
              >
                <dl className="details">
                  {columns.map((c) => (
                    <div key={c.key}>
                      <dt>{c.title}</dt>
                      <dd>
                        {c.key === "last_seen"
                          ? datetime(selected[c.key])
                          : String(selected[c.key] ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
                <CopyText
                  text={String(selected.hwid || selected.ip || selected.id)}
                />
                <p className="footnote">Источник: {selected.source}</p>
              </Panel>
            )}
          </div>
        </>
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
        <span>Агент {node.agent}</span>
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
              <Panel title="Расположение">
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
          <Table
            columns={connectionColumns}
            rows={
              data.connections.filter((r) => r.node === node.name) as (Row & {
                id: string;
              })[]
            }
          />
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
              <dd>Исходящая телеметрия по HTTPS</dd>
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
  const { id } = useParams();
  const { data } = useStore();
  const [tab, setTab] = useState("Обзор");
  const user = data.users.find((r) => r.id === id);
  if (!user) return <Empty title="Пользователь не найден" />;
  return (
    <>
      <Header
        title={String(user.name)}
        sub={`Пользователь · ${user.id}`}
        period
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
          label="Статус"
          value={<Badge status={String(user.status)} />}
        />
        <Stat
          icon={<Database />}
          label="Трафик"
          value={`${fmt(Number(user.traffic))} ГБ`}
        />
        <Stat icon={<Link2 />} label="Подключения" value={user.connections} />
        <Stat icon={<Smartphone />} label="Устройства" value={user.devices} />
      </div>
      {tab === "Обзор" && (
        <div className="split wide-left">
          <Panel title="Трафик пользователя">
            <Chart height={250} />
          </Panel>
          <Panel title="Профиль">
            <dl className="details">
              {[
                ["Последняя нода", user.node],
                ["Регион", user.region],
                ["Последняя активность", datetime(user.last_seen)],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      )}
      <Panel
        title={
          tab === "Устройства"
            ? "Зарегистрированные устройства"
            : tab === "События"
              ? "События"
              : "Подключения"
        }
      >
        {tab === "Устройства" ? (
          <>
            <Table
              rows={
                data.devices.filter((r) => r.user === user.name) as (Row & {
                  id: string;
                })[]
              }
              columns={deviceColumns}
            />
            <p className="footnote">
              Данные устройства получены при запросе подписки.
            </p>
          </>
        ) : tab === "События" ? (
          <Table
            rows={
              data.detections.filter((r) => r.user === user.name) as (Row & {
                id: string;
              })[]
            }
            columns={[
              { key: "id", title: "ID" },
              { key: "evidence", title: "Сигнал" },
              { key: "time", title: "Время", render: (r) => datetime(r.time) },
            ]}
          />
        ) : (
          <Table
            rows={
              data.connections.filter((r) => r.user === user.name) as (Row & {
                id: string;
              })[]
            }
            columns={connectionColumns}
          />
        )}
      </Panel>
    </>
  );
}
