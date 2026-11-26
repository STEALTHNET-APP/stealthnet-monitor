import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  TriangleAlert,
  CheckCircle,
  Clock,
  FileText,
  Users,
  Server,
  Plus,
} from "lucide-react";
import {
  Header,
  Panel,
  Stat,
  Tabs,
  Table,
  Badge,
  SearchBox,
  Empty,
  Modal,
  Column,
} from "../components/ui";
import { Chart } from "../components/Chart";
import { useStore, api } from "../data/store";
import { Row, datetime } from "../data/demo";
import { RecordList } from "./Inventory";
const incidentColumns: Column<Row & { id: string }>[] = [
  { key: "node", title: "Нода" },
  { key: "title", title: "Проблема" },
  {
    key: "status",
    title: "Важность",
    render: (r) => <Badge status={String(r.status)} />,
  },
  { key: "started", title: "Начало", render: (r) => datetime(r.started) },
  { key: "source", title: "Источник" },
];
export function Incidents() {
  const { data, demo, toast, refresh } = useStore();
  const [params, setParams] = useSearchParams();
  const selected = params.get("selected");
  const linked = data.incidents.find((r) => String(r.id) === selected);
  const tab =
    params.get("tab") === "history" || linked?.status === "resolved"
      ? "История"
      : "Активные";
  const [severity, setSeverity] = useState("all");
  const [ack, setAck] = useState<string[]>([]);
  const rows = data.incidents.filter(
    (r) =>
      (tab === "Активные"
        ? r.status !== "resolved"
        : r.status === "resolved") &&
      (tab === "История" || severity === "all" || r.status === severity),
  );
  const incident = rows.find((r) => String(r.id) === selected) || rows[0];
  const incidentNode = data.nodes.find((n) =>
    incident?.node_id ? n.id === incident.node_id : n.name === incident?.node,
  );
  const metric =
    data.rules.find((rule) => rule.id === incident?.rule_id)?.metric ??
    (demo && String(incident?.title).includes("Диск")
      ? "disk"
      : demo && String(incident?.title).includes("задержка")
        ? "latency"
        : null);
  async function acknowledge() {
    if (!incident) return;
    try {
      if (!demo)
        await api("/incidents/" + incident.id + "/ack", { method: "POST" });
      setAck([...ack, String(incident.id)]);
      toast(
        demo ? "Инцидент принят в демо-сеансе" : "Инцидент принят в работу",
      );
      await refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <>
      <Header
        title="Инциденты"
        sub="Проблемы и история восстановления"
        period
        action={
          tab === "Активные" && (
            <select
              aria-label="Важность"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="all">Все уровни</option>
              <option value="critical">Критические</option>
              <option value="warning">Предупреждения</option>
            </select>
          )
        }
      />
      <Tabs
        items={["Активные", "История"]}
        value={tab}
        onChange={(value) =>
          setParams(value === "История" ? { tab: "history" } : {}, {
            replace: true,
          })
        }
      />
      <div className="stats four">
        <Stat
          icon={<TriangleAlert />}
          label="Критические"
          value={data.incidents.filter((r) => r.status === "critical").length}
          color="var(--red)"
          spark={false}
        />
        <Stat
          icon={<TriangleAlert />}
          label="Предупреждения"
          value={data.incidents.filter((r) => r.status === "warning").length}
          color="var(--amber)"
          spark={false}
        />
        <Stat
          icon={<CheckCircle />}
          label="Восстановлено"
          value={data.incidents.filter((r) => r.status === "resolved").length}
          spark={false}
        />
        <Stat
          icon={<Clock />}
          label="Последнее обновление"
          value={<small>{datetime(data.updated_at)}</small>}
          spark={false}
        />
      </div>
      <div className="split event-split">
        <div className="stack">
          <Panel
            title={
              tab === "История" ? "Завершённые инциденты" : "Активные инциденты"
            }
            className="grow-panel"
          >
            {rows.length ? (
              <Table
                rows={rows as (Row & { id: string })[]}
                columns={incidentColumns}
                onRow={(r) =>
                  setParams(
                    (current) => {
                      const next = new URLSearchParams(current);
                      next.set("selected", r.id);
                      return next;
                    },
                    { replace: true },
                  )
                }
              />
            ) : (
              <Empty
                title={
                  severity !== "all" && tab === "Активные"
                    ? "Совпадений нет"
                    : "Инцидентов нет"
                }
                text={
                  tab === "История"
                    ? "Здесь появятся завершённые инциденты."
                    : "Здесь появятся активные инциденты."
                }
              />
            )}
          </Panel>
        </div>
        {incident ? (
          <Panel title={String(incident.node)} sub={String(incident.title)}>
            <dl className="details">
              <div>
                <dt>Статус</dt>
                <dd>
                  <Badge status={String(incident.status)} />
                </dd>
              </div>
              <div>
                <dt>Значение</dt>
                <dd>{incident.value}</dd>
              </div>
              <div>
                <dt>Начало</dt>
                <dd>{datetime(incident.started)}</dd>
              </div>
              {incident.resolved_at && (
                <div>
                  <dt>Завершение</dt>
                  <dd>{datetime(incident.resolved_at)}</dd>
                </div>
              )}
              <div>
                <dt>Источник</dt>
                <dd>{incident.source}</dd>
              </div>
            </dl>
            {incidentNode &&
              metric &&
              ["cpu", "ram", "disk", "traffic", "latency"].includes(metric) && (
                <>
                  <h3>Динамика показателя</h3>
                  <Chart kind={metric} nodeId={incidentNode.id} height={190} />
                </>
              )}
            <div className="notice-box">
              <TriangleAlert size={22} />
              <p>
                Состояние инцидента изменится автоматически после восстановления
                показателя.
              </p>
            </div>
            <div className="button-row">
              {incidentNode && (
                <Link
                  className="button"
                  to={"/nodes/" + encodeURIComponent(incidentNode.id)}
                >
                  Открыть ноду
                </Link>
              )}
              {tab === "Активные" && (
                <button
                  className="button primary"
                  disabled={
                    ack.includes(String(incident.id)) ||
                    incident.acknowledged === true
                  }
                  onClick={() => void acknowledge()}
                >
                  {ack.includes(String(incident.id)) || incident.acknowledged
                    ? "В работе"
                    : "Принять в работу"}
                </button>
              )}
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
const detectionCols: Column<Row & { id: string }>[] = [
  { key: "time", title: "Время", render: (r) => datetime(r.time) },
  { key: "user", title: "Пользователь" },
  { key: "node", title: "Нода" },
  { key: "evidence", title: "Признак" },
  { key: "source", title: "Источник" },
  {
    key: "status",
    title: "Статус",
    render: (r) => <Badge status={String(r.status)} />,
  },
];
const complaintCols: Column<Row & { id: string }>[] = [
  { key: "id", title: "ID", sort: (r) => r.id },
  { key: "time", title: "Получено", render: (r) => datetime(r.time) },
  { key: "provider", title: "Отправитель" },
  { key: "node", title: "Нода" },
  { key: "type", title: "Тип" },
  {
    key: "status",
    title: "Статус",
    render: (r) => <Badge status={String(r.status)} />,
  },
];
export function Torrents() {
  const { data } = useStore();
  const [q, setQ] = useState("");
  const agents = data.nodes.filter((n) => n.source !== "remnawave");
  const ready = agents.filter(
    (n) =>
      n.collector_torrents &&
      data.updated_at - (n.collector_time || 0) < 180000,
  );
  return (
    <>
      <Header
        title="Торренты"
        sub="Срабатывания существующих правил BitTorrent на нодах"
      />
      <div className="stats three">
        <Stat
          icon={<Server />}
          label="Нод со сбором BitTorrent"
          value={ready.length}
          spark={false}
        />
        <Stat
          icon={<FileText />}
          label="Последние обнаружения"
          value={data.detections.length}
          spark={false}
        />
        <Stat
          icon={<Users />}
          label="Пользователей в обнаружениях"
          value={new Set(data.detections.map((r) => r.user)).size}
          spark={false}
        />
      </div>
      <Panel title="Источники обнаружений">
        {agents.map((n) => (
          <div className="spread" key={n.id}>
            <Link to={"/nodes/" + n.id}>{n.name}</Link>
            <span>
              {ready.includes(n)
                ? "Сбор включён · журнал Xray"
                : "Нет подтверждения сбора: проверьте агент, журнал и правило BitTorrent"}
            </span>
          </div>
        ))}
        <p className="footnote">
          Событие появляется, когда журнал Xray подтверждает маршрут правила
          protocol=bittorrent. Зашифрованный или нераспознанный BitTorrent может
          не определяться. Монитор не меняет правила VPN.
        </p>
      </Panel>
      <Panel title="Обнаружения">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Пользователь, нода или IP"
        />
        <RecordList kind="detection" q={q} />
      </Panel>
    </>
  );
}
export function ComplaintDetail() {
  const { id } = useParams();
  const { data, demo, toast, refresh } = useStore();
  const row = data.complaints.find((r) => r.id === id);
  const [status, setStatus] = useState(String(row?.status || "new"));
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(false);
  async function save() {
    try {
      if (!demo)
        await api("/complaints/" + id, {
          method: "PATCH",
          body: JSON.stringify({ status, comment }),
        });
      setSaved(true);
      toast(demo ? "Изменения сохранены в демо-сеансе" : "Жалоба обновлена");
      await refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  if (!row) return <Empty title="Жалоба не найдена" />;
  return (
    <>
      <Header
        title={"Жалоба " + id}
        sub={"Получена " + datetime(row.time)}
        action={<Badge status={status} />}
      />
      <div className="split">
        <div className="stack">
          <Panel title="Исходное обращение">
            <dl className="details">
              <div>
                <dt>Отправитель</dt>
                <dd>{row.provider}</dd>
              </div>
              <div>
                <dt>Тема</dt>
                <dd>{row.subject}</dd>
              </div>
              <div>
                <dt>Тип</dt>
                <dd>{row.type}</dd>
              </div>
              <div>
                <dt>IP сервера</dt>
                <dd>{row.ip}</dd>
              </div>
              <div>
                <dt>Нода</dt>
                <dd>{row.node}</dd>
              </div>
            </dl>
            <h3>Описание</h3>
            <p className="complaint-body">{row.body}</p>
          </Panel>
          <Panel title="Кандидаты">
            <Empty
              title="Недостаточно данных для сопоставления"
              text="Нужны время события, исходный порт и соответствующие журналы ноды."
            />
          </Panel>
        </div>
        <Panel title="Обработка жалобы">
          <div className="notice-box amber">
            <TriangleAlert />
            <p>Совпадение IP само по себе не определяет пользователя.</p>
          </div>
          <label>
            Статус
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="new">Новая</option>
              <option value="reviewed">На проверке</option>
              <option value="closed">Закрыта</option>
            </select>
          </label>
          <label>
            Комментарий
            <textarea
              rows={6}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Результаты проверки"
            />
          </label>
          <div className="button-row">
            <button className="button primary" onClick={() => void save()}>
              Сохранить
            </button>
            <Link className="button" to="/torrents?tab=complaints">
              К списку
            </Link>
          </div>
        </Panel>
      </div>
      <Panel title="История обработки">
        <div className="history-line">
          <CheckCircle size={18} />
          <span>{datetime(row.time)}</span>
          <b>Жалоба добавлена</b>
        </div>
        {saved && (
          <div className="history-line">
            <CheckCircle size={18} />
            <span>{datetime(Date.now())}</span>
            <b>Изменения сохранены · {status}</b>
            <span>{comment}</span>
          </div>
        )}
      </Panel>
    </>
  );
}
