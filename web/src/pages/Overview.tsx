import {
  Users,
  Server,
  Gauge,
  Database,
  TriangleAlert,
  ArrowRight,
  RefreshCw,
  Cpu,
  MemoryStick,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Header,
  AddServer,
  Panel,
  Stat,
  MoreLink,
  Flag,
  Meter,
  Badge,
  Table,
  nodeColumns,
  SearchBox,
  Empty,
  Tabs,
} from "../components/ui";
import { Chart } from "../components/Chart";
import { NodeMap } from "../components/NodeMap";
import { useStore } from "../data/store";
import { fmt, datetime } from "../data/demo";
import { useTraffic, volume } from "../data/inventory";
import { connectionRegions, recentConnections } from "../data/geography";
export function Overview() {
  const { data, demo } = useStore();
  const nav = useNavigate();
  const dailyTraffic = useTraffic(24);
  const activeIncidents = data.incidents.filter((r) => r.status !== "resolved");
  const online = data.nodes.filter((n) => n.status === "online").length;
  const users = data.nodes.reduce((s, n) => s + (n.users || 0), 0);
  const hasUsers = data.nodes.some((n) => n.users != null);
  const speed = data.nodes.reduce((s, n) => s + (n.rx || 0) + (n.tx || 0), 0);
  return (
    <>
      <Header
        title="Обзор сети"
        sub="Состояние инфраструктуры и подключений"
        period
        action={<AddServer />}
      />
      <div className="stats five">
        <Stat
          icon={<Server />}
          label="Ноды онлайн"
          value={
            <>
              {online} <em>/ {data.nodes.length}</em>
            </>
          }
          note={`${data.nodes.length - online} требуют внимания`}
        />
        <Stat
          icon={<Users />}
          label="Пользователи онлайн"
          value={hasUsers ? fmt(users) : "—"}
          note={
            demo
              ? "+8,4% за сутки"
              : hasUsers
                ? "Remnawave · сумма по нодам"
                : "Нет данных Remnawave"
          }
        />
        <Stat
          icon={<Gauge />}
          label="Скорость сети"
          value={
            <>
              {fmt(speed, 1)} <small>Гбит/с</small>
            </>
          }
        />
        <Stat
          icon={<Database />}
          label="Трафик за сутки"
          value={demo ? "126,4 ТБ" : volume(dailyTraffic?.total_bytes)}
          note={demo ? undefined : "Собранные замеры агентов · 24 ч"}
        />
        <Stat
          icon={<TriangleAlert />}
          label="Инциденты"
          value={data.incidents.filter((r) => r.status !== "resolved").length}
          note={`${data.incidents.filter((r) => r.status === "critical").length} критических`}
          color="var(--red)"
        />
      </div>
      <div className="overview-top">
        <Panel
          title="Трафик сети"
          sub="Входящий и исходящий поток"
          className="network-chart"
        >
          <Chart height={184} />
          <div className="divider" />
          <div className="panel-heading subheading">
            <h3>Пользователи онлайн</h3>
            <b>
              <Users size={16} />
              {hasUsers ? fmt(users) : "—"}
            </b>
          </div>
          <Chart kind="users" height={100} compact />
        </Panel>
        <div className="stack">
          <Panel
            title="Требуют внимания"
            action={<MoreLink to="/incidents">Все инциденты</MoreLink>}
            className="attention"
          >
            {activeIncidents.length ? (
              activeIncidents.slice(0, 3).map((r) => (
                <Link
                  to={"/incidents?selected=" + r.id}
                  key={String(r.id)}
                  className="incident-row"
                >
                  <TriangleAlert
                    className={r.status === "critical" ? "red" : "amber"}
                    size={30}
                  />
                  <div>
                    <b>{r.node}</b>
                    <span className={r.status === "critical" ? "red" : "amber"}>
                      {r.title}
                    </span>
                  </div>
                  <time>{datetime(r.started)}</time>
                </Link>
              ))
            ) : (
              <Empty
                title="Нет активных инцидентов"
                text="Состояние подключённых агентов в норме."
              />
            )}
          </Panel>
          <Panel title="Нагрузка по регионам">
            <div className="region-list">
              {(demo
                ? ["de", "nl", "fi"]
                : [...new Set(data.nodes.map((n) => n.code))].slice(0, 3)
              ).map((code, i) => {
                const list = data.nodes.filter(
                  (n) => n.code === code && n.cpu != null,
                );
                const val = list.length
                  ? Math.round(
                      list.reduce((s, n) => s + n.cpu!, 0) / list.length,
                    )
                  : null;
                return (
                  <div key={code}>
                    <Flag code={code} />
                    <span>
                      {data.nodes.find((n) => n.code === code)?.country ||
                        "Не указан"}
                    </span>
                    <Meter
                      value={val}
                      color={i ? "var(--blue)" : "var(--mint)"}
                    />
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
      <div className="overview-bottom">
        <Panel
          title="География подключений"
          action={
            <span className="muted tiny">Регионы по IP · приблизительно</span>
          }
          className="overview-map"
        >
          <NodeMap
            world
            nodes={data.nodes}
            onSelect={(n) => nav("/map?node=" + n.id)}
          />
        </Panel>
        <Panel
          title="Ноды"
          action={<MoreLink to="/nodes">Все {data.nodes.length}</MoreLink>}
          className="overview-nodes"
        >
          <Table
            rows={data.nodes.slice(0, 4)}
            columns={nodeColumns.filter(
              (c) =>
                !["country", "agent", "provider", "expires_at"].includes(c.key),
            )}
            onRow={(r) => nav("/nodes/" + r.id)}
          />
        </Panel>
      </div>
    </>
  );
}
export function MapPage() {
  const { data, demo, refresh, period, setPeriod } = useStore();
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("node") || "",
  );
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("Подключения");
  const [world, setWorld] = useState(false);
  const [status, setStatus] = useState("all");
  const [tab, setTab] = useState("Обзор");
  const nodes = data.nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(q.toLowerCase()) &&
      (status === "all" || n.status === status),
  );
  const node =
    nodes.find((n) => n.id === selected) ||
    nodes.find((n) =>
      data.connections.some(
        (r) => r.node_id === n.id || (!r.node_id && r.node === n.name),
      ),
    ) ||
    nodes[0];
  const observations = recentConnections(
    data.connections,
    period,
    data.updated_at,
    node,
  );
  const regions = connectionRegions(observations, nodes);
  const observedIps = new Set(regions.flatMap((r) => [...r.ips])).size;
  return (
    <>
      <Header
        title="Карта нод"
        sub="Инфраструктура и география подключений"
        action={<AddServer />}
      />
      <div className="filter-row">
        <Tabs items={["Ноды", "Подключения"]} value={mode} onChange={setMode} />
        <select
          aria-label="Область карты"
          value={world ? "world" : "europe"}
          onChange={(e) => setWorld(e.target.value === "world")}
        >
          <option value="europe">Европа</option>
          <option value="world">Весь мир</option>
        </select>
        <select
          aria-label="Статус ноды"
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
          aria-label="Период графика"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          {["15 мин", "1 ч", "6 ч", "24 ч", "7 д"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <span className="muted map-freshness">
          Обновлено: {new Date(data.updated_at).toLocaleTimeString("ru-RU")}
        </span>
        <button className="button subtle" onClick={() => void refresh()}>
          <RefreshCw size={18} />
          Обновить
        </button>
      </div>
      <div className="map-layout">
        <div>
          <div className="map-summary panel">
            <b>{data.nodes.length} нод</b>
            <Badge
              status="online"
              label={`${data.nodes.filter((n) => n.status === "online").length} доступны`}
            />
            <Badge
              status="warning"
              label={`${data.nodes.filter((n) => n.status !== "online").length} требуют внимания`}
            />
            <span>
              <Users size={19} />
              {data.nodes.some((n) => n.users != null)
                ? fmt(data.nodes.reduce((s, n) => s + (n.users || 0), 0))
                : "—"}{" "}
              онлайн
            </span>
          </div>
          <div className="panel large-map">
            <div className="map-search">
              <SearchBox
                value={q}
                onChange={setQ}
                placeholder="Найти ноду на карте"
              />
            </div>
            <NodeMap
              nodes={nodes}
              selected={node}
              onSelect={(n) => {
                setSelected(n.id);
                history.replaceState(null, "", "/map?node=" + n.id);
              }}
              world={world}
              connections={mode === "Подключения"}
            />
          </div>
        </div>
        {node ? (
          <Panel className="map-inspector">
            <div className="node-title">
              <Flag code={node.code} />
              <div>
                <h2>
                  {node.name} <Badge status={node.status} />
                </h2>
                <p>
                  {node.city}, {node.country}
                </p>
                <small className="muted">
                  {demo ? "Демо-нода" : "Агент · " + node.agent}
                </small>
              </div>
            </div>
            <Tabs
              items={["Обзор", "Подключения", "События"]}
              value={tab}
              onChange={setTab}
            />
            {tab === "Обзор" ? (
              <>
                <div className="stats two compact-stats">
                  <Stat
                    label="Пользователи"
                    value={fmt(node.users)}
                    icon={<Users />}
                  />
                  <Stat
                    label="Трафик"
                    value={`${fmt(node.rx == null ? null : node.rx + (node.tx || 0), 1)} Гбит/с`}
                    icon={<Gauge />}
                  />
                  <Stat
                    label="CPU"
                    value={`${fmt(node.cpu)}%`}
                    icon={<Cpu />}
                    spark={false}
                  />
                  <Stat
                    label="RAM"
                    value={`${fmt(node.ram)}%`}
                    icon={<MemoryStick />}
                    spark={false}
                  />
                </div>
                <Panel title="Трафик за выбранный период">
                  <Chart nodeId={node.id} height={140} />
                </Panel>
                <Panel title="Откуда подключаются">
                  {demo ? (
                    <div className="region-list">
                      {[
                        "Польша",
                        "Германия",
                        "Украина",
                        "Франция",
                        "Другие регионы",
                      ].map((r, i) => (
                        <div key={r}>
                          <Flag code={["pl", "de", "ua", "fr", "gb"][i]} />
                          <span>{r}</span>
                          <Meter
                            value={[46, 38, 30, 20, 54][i]}
                            color="var(--blue)"
                          />
                          <b>
                            {Math.round(
                              ([842, 716, 534, 398, 931][i] *
                                (node.users || 0)) /
                                3421,
                            )}
                          </b>
                        </div>
                      ))}
                    </div>
                  ) : regions.length ? (
                    <div className="region-list">
                      <p className="muted">
                        Наблюдаемые IP за {period} · приблизительно
                      </p>
                      {regions.slice(0, 8).map((r) => (
                        <div key={r.id}>
                          <Flag code={r.code} />
                          <span>
                            {r.name}
                            <small className="muted"> · {r.country}</small>
                          </span>
                          <Meter
                            value={
                              observedIps ? (r.ips.size / observedIps) * 100 : 0
                            }
                            color="var(--blue)"
                          />
                          <b>{r.ips.size}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Нет геоданных подключений"
                      text={
                        data.geoip?.available
                          ? "Для этой ноды пока нет наблюдений за выбранный период."
                          : data.geoip?.update_failed
                            ? "Не удалось скачать базу геолокации. Панель повторит загрузку автоматически."
                            : "База геолокации загружается. Данные появятся автоматически."
                      }
                    />
                  )}
                </Panel>
              </>
            ) : tab === "Подключения" ? (
              <div className="inspector-list">
                {observations.slice(0, 100).map((r) => (
                  <Link key={String(r.id)} to="/connections">
                    <b>{r.ip}</b>
                    <span>{r.region}</span>
                  </Link>
                ))}
                {!observations.length && <Empty />}
              </div>
            ) : (
              <div className="inspector-list">
                {data.incidents
                  .filter((r) => r.node === node.name)
                  .map((r) => (
                    <Link key={String(r.id)} to="/incidents">
                      <Badge status={String(r.status)} />
                      <span>{r.title}</span>
                    </Link>
                  ))}
                {!data.incidents.some((r) => r.node === node.name) && (
                  <Empty title="Нет событий" />
                )}
              </div>
            )}
            <div className="inspector-footer">
              <Link className="button primary" to={"/nodes/" + node.id}>
                Открыть ноду <ArrowRight size={18} />
              </Link>
              <Link to="/connections" className="more-link">
                Все подключения
              </Link>
            </div>
          </Panel>
        ) : (
          <Panel>
            <Empty title="Ноды не найдены" action={<AddServer />} />
          </Panel>
        )}
      </div>
    </>
  );
}
