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
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(
    params.get("selected") || String(data.incidents[0]?.id || ""),
  );
  const [tab, setTab] = useState("Активные");
  const [severity, setSeverity] = useState("all");
  const [ack, setAck] = useState<string[]>([]);
  const rows = data.incidents.filter(
    (r) =>
      (tab === "Активные"
        ? r.status !== "resolved"
        : r.status === "resolved") &&
      (severity === "all" || r.status === severity),
  );
  const incident = rows.find((r) => r.id === selected) || rows[0];
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
          <select
            aria-label="Важность"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="all">Все уровни</option>
            <option value="critical">Критические</option>
            <option value="warning">Предупреждения</option>
          </select>
        }
      />
      <Tabs items={["Активные", "История"]} value={tab} onChange={setTab} />
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
          <Panel title="Лента инцидентов">
            <div className="incident-timeline">
              {rows.map((r, i) => (
                <button
                  key={String(r.id)}
                  onClick={() => setSelected(String(r.id))}
                >
                  <span>{r.node}</span>
                  <div className="timeline-axis">
                    <i
                      style={{
                        left: `${50 + i * 7}%`,
                        width: `${7 + i * 5}%`,
                        background:
                          r.status === "critical"
                            ? "var(--red)"
                            : "var(--amber)",
                      }}
                    />
                  </div>
                  <time>{datetime(r.started)}</time>
                </button>
              ))}
            </div>
            {!rows.length && <Empty title="Инцидентов нет" />}
          </Panel>
          <Panel
            title={`Список инцидентов (${rows.length})`}
            className="grow-panel"
          >
            <Table
              rows={rows as (Row & { id: string })[]}
              columns={incidentColumns}
              onRow={(r) => setSelected(r.id)}
            />
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
              <div>
                <dt>Источник</dt>
                <dd>{incident.source}</dd>
              </div>
            </dl>
            <h3>Динамика показателя</h3>
            <Chart
              kind={
                String(incident.title).includes("Диск") ? "disk" : "latency"
              }
              height={190}
            />
            <div className="notice-box">
              <TriangleAlert size={22} />
              <p>
                Состояние инцидента изменится автоматически после восстановления
                показателя.
              </p>
            </div>
            <div className="button-row">
              <Link
                className="button"
                to={
                  "/nodes/" +
                  data.nodes.find((n) => n.name === incident.node)?.id
                }
              >
                Открыть ноду
              </Link>
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
            </div>
          </Panel>
        ) : (
          <Panel>
            <Empty
              title="Всё спокойно"
              text="Здесь появятся подробности выбранной проблемы."
            />
          </Panel>
        )}
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
  const { data, addComplaint } = useStore();
  const [params, setParams] = useSearchParams();
  const tab =
    params.get("tab") === "complaints" ? "Внешние жалобы" : "Обнаружения";
  const [selected, setSelected] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    subject: "",
    provider: "",
    ip: "",
    node: "",
    body: "",
    type: "Abuse",
  });
  const isComplaint = tab === "Внешние жалобы";
  const rows = (isComplaint ? data.complaints : data.detections).filter((r) =>
    Object.values(r).join(" ").toLowerCase().includes(q.toLowerCase()),
  );
  const record = rows.find((r) => r.id === selected) || rows[0];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await addComplaint({
        ...form,
        id: "AB-" + Date.now(),
        status: "new",
        time: Date.now(),
      });
      setAdding(false);
      setForm({
        subject: "",
        provider: "",
        ip: "",
        node: "",
        body: "",
        type: "Abuse",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        title="Торренты и жалобы"
        sub="Обнаружения и внешние обращения"
        period={!isComplaint}
        action={
          isComplaint && (
            <button className="button primary" onClick={() => setAdding(true)}>
              <Plus size={20} />
              Добавить жалобу
            </button>
          )
        }
      />
      <Tabs
        items={["Обнаружения", "Внешние жалобы"]}
        value={tab}
        onChange={(t) => {
          setParams(t === "Внешние жалобы" ? { tab: "complaints" } : {});
          setSelected("");
        }}
      />
      <div className="stats three">
        <Stat
          icon={<FileText />}
          label={isComplaint ? "Новые жалобы" : "Событий"}
          value={
            isComplaint
              ? rows.filter((r) => r.status === "new").length
              : rows.length
          }
        />
        <Stat
          icon={<Users />}
          label={isComplaint ? "На проверке" : "Пользователей"}
          value={
            isComplaint
              ? rows.filter((r) => r.status === "reviewed").length
              : new Set(
                  rows.map((r) => r.user).filter((r) => r !== "Не определён"),
                ).size
          }
        />
        <Stat
          icon={isComplaint ? <CheckCircle /> : <Server />}
          label={isComplaint ? "Закрыто" : "Нод"}
          value={
            isComplaint
              ? rows.filter((r) => r.status === "closed").length
              : new Set(rows.map((r) => r.node)).size
          }
        />
      </div>
      <div className="split event-split">
        <div className="stack">
          {!isComplaint && (
            <Panel title="Обнаружения по времени">
              <div className="event-bars">
                {Array.from({ length: 48 }, (_, i) => {
                  const count = rows.filter((_, j) => j % 48 === i).length;
                  return (
                    <div key={i} title={`${count} событий`}>
                      <i
                        style={{ height: count ? `${25 + count * 22}%` : "0%" }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="spread muted tiny">
                <span>Начало периода</span>
                <span>Сейчас</span>
              </div>
            </Panel>
          )}
          <Panel
            title={isComplaint ? "Внешние жалобы" : "Последние обнаружения"}
          >
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Номер, пользователь, нода или IP"
            />
            <Table
              rows={rows as (Row & { id: string })[]}
              columns={isComplaint ? complaintCols : detectionCols}
              onRow={(r) => setSelected(r.id)}
              pageSize={8}
            />
          </Panel>
        </div>
        {record ? (
          <Panel title={`${isComplaint ? "Жалоба" : "Событие"} ${record.id}`}>
            <dl className="details">
              {(isComplaint ? complaintCols : detectionCols)
                .filter((c) => c.key !== "id")
                .map((c) => (
                  <div key={c.key}>
                    <dt>{c.title}</dt>
                    <dd>
                      {c.key === "time"
                        ? datetime(record.time)
                        : String(record[c.key] ?? "—")}
                    </dd>
                  </div>
                ))}
            </dl>
            <div className="notice-box amber">
              <TriangleAlert />
              <p>
                {isComplaint
                  ? "Сопоставление с пользователем требует журналов, времени и порта источника."
                  : "Обнаружен признак BitTorrent. Распознавание не охватывает весь зашифрованный трафик."}
              </p>
            </div>
            {isComplaint ? (
              <>
                <p className="muted">{record.body}</p>
                <Link
                  className="button primary full"
                  to={"/complaints/" + record.id}
                >
                  Открыть жалобу
                </Link>
              </>
            ) : (
              <div className="notice-box">
                <p>
                  Признак: {record.evidence}
                  <br />
                  Уверенность: {record.confidence}
                  <br />
                  Автоматические блокировки отключены.
                </p>
              </div>
            )}
          </Panel>
        ) : (
          <Panel>
            <Empty title="Событий пока нет" />
          </Panel>
        )}
      </div>
      {adding && (
        <Modal title="Добавить внешнюю жалобу" onClose={() => setAdding(false)}>
          <form onSubmit={submit}>
            <div className="grid two">
              {[
                ["subject", "Тема"],
                ["provider", "Отправитель"],
                ["ip", "IP сервера"],
                ["node", "Нода"],
              ].map(([k, l]) => (
                <label key={k}>
                  {l}
                  <input
                    required={k !== "node"}
                    maxLength={250}
                    value={form[k as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <label>
              Исходный текст
              <textarea
                required
                maxLength={10000}
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            {error && (
              <p role="alert" className="red">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              Сохранить жалобу
            </button>
          </form>
        </Modal>
      )}
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
