import { BillingFields, BillingData } from "../components/Billing";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Send,
  Save,
  Bot,
  Users,
  User,
  TriangleAlert,
  Plus,
  Cpu,
  Database,
  Activity,
  Server,
  RefreshCw,
  CheckCircle,
  ArrowRight,
  KeyRound,
  Network,
  Monitor,
  Eye,
  EyeOff,
  CalendarClock,
  MemoryStick,
  HardDrive,
  Unplug,
  FileWarning,
  ShieldAlert,
} from "lucide-react";
import {
  Header,
  Panel,
  Tabs,
  Badge,
  Table,
  CopyText,
  Empty,
  Stat,
} from "../components/ui";
import { useStore, api } from "../data/store";
import { Rule, Row, datetime, regions } from "../data/demo";
const deliveryColumns = [
  { key: "time", title: "Время", render: (r: Row) => datetime(r.time) },
  { key: "title", title: "Событие" },
  { key: "channel", title: "Канал" },
  {
    key: "status",
    title: "Статус",
    render: (r: Row) => <Badge status={String(r.status)} />,
  },
];
const metricNames: Record<string, string> = {
  expiry: "Аренда истекает, дней",
  offline: "Нет связи с агентом, секунд",
  cpu: "CPU, %",
  ram: "RAM, %",
  disk: "Диск занят, %",
  traffic: "Суммарный трафик, Гбит/с",
  complaint: "Новая внешняя жалоба",
  detection: "Обнаружение BitTorrent",
};
export function Switch({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={"switch " + (value ? "on" : "")}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}
export function Alerts() {
  const { data, saveRule, toast } = useStore();
  const [tab, setTab] = useState("Правила");
  const [rule, setRule] = useState<Rule>(
    data.rules[0] || {
      id: crypto.randomUUID(),
      name: "Новое правило",
      metric: "cpu",
      threshold: 85,
      duration: 300,
      repeat: 900,
      recovery: true,
      enabled: true,
      scope: "all",
      severity: "warning",
    },
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data.rules.length && !data.rules.some((r) => r.id === rule.id))
      setRule(data.rules[0]);
  }, [data.rules]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveRule(rule);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        title="Оповещения"
        sub="Правила и доставка уведомлений"
        action={
          <button
            className="button primary"
            onClick={() => {
              setTab("Правила");
              setRule({
                id: crypto.randomUUID(),
                name: "Новое правило",
                metric: "cpu",
                threshold: 85,
                duration: 300,
                repeat: 900,
                recovery: true,
                enabled: true,
                scope: "all",
                severity: "warning",
              });
            }}
          >
            <Plus size={20} />
            Создать правило
          </button>
        }
      />
      <Tabs
        items={["Правила", "Каналы", "История доставки"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "Правила" ? (
        <>
          <div className="split rules-split">
            <Panel
              title="Список правил"
              action={<span className="muted">{data.rules.length} правил</span>}
            >
              <div className="rule-list">
                {data.rules.map((r) => {
                  const Icon =
                    (
                      {
                        expiry: CalendarClock,
                        offline: Unplug,
                        cpu: Cpu,
                        ram: MemoryStick,
                        disk: HardDrive,
                        traffic: Activity,
                        complaint: FileWarning,
                        detection: ShieldAlert,
                      } as Record<string, typeof Cpu>
                    )[r.metric] || TriangleAlert;
                  return (
                    <div
                      key={r.id}
                      className={rule.id === r.id ? "selected" : ""}
                    >
                      <button
                        className="rule-main"
                        onClick={() => setRule({ ...r })}
                      >
                        <Icon
                          size={29}
                          className={r.severity === "critical" ? "red" : ""}
                        />
                        <span>
                          <b>{r.name}</b>
                          <small>{metricNames[r.metric]}</small>
                        </span>
                        <span>
                          {r.metric === "offline"
                            ? `${r.threshold} с без связи`
                            : ["complaint", "detection"].includes(r.metric)
                              ? "При поступлении события"
                              : r.metric === "expiry"
                                ? `За ${[r.threshold, 3, 1].filter((v, i, a) => v <= r.threshold && a.indexOf(v) === i).join(", ")} дн. и при истечении`
                                : `Выше ${r.threshold} · ${r.duration} с`}
                        </span>
                        <span>
                          <Send size={15} className="blue" /> Telegram
                        </span>
                      </button>
                      <Switch
                        label={"Включить " + r.name}
                        value={r.enabled}
                        onChange={(v) =>
                          void saveRule({ ...r, enabled: v }).catch((e) =>
                            toast(e.message),
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </Panel>
            <Panel title={rule.name} sub="Настройка правила уведомлений">
              <form className="rule-form" onSubmit={save}>
                <label>
                  Название
                  <input
                    required
                    maxLength={100}
                    value={rule.name}
                    onChange={(e) => setRule({ ...rule, name: e.target.value })}
                  />
                </label>
                <label>
                  Метрика
                  <select
                    value={rule.metric}
                    onChange={(e) =>
                      setRule({ ...rule, metric: e.target.value })
                    }
                  >
                    {Object.entries(metricNames).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {rule.metric === "expiry"
                    ? "Первое напоминание, за сколько дней"
                    : "Порог"}
                  <input
                    type="number"
                    min="0"
                    required
                    step="0.1"
                    value={rule.threshold}
                    onChange={(e) =>
                      setRule({ ...rule, threshold: Number(e.target.value) })
                    }
                  />
                </label>
                {rule.metric !== "expiry" && (
                  <label>
                    Длительность, с
                    <input
                      type="number"
                      min="0"
                      max="86400"
                      required
                      value={rule.duration}
                      onChange={(e) =>
                        setRule({ ...rule, duration: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
                <label>
                  Применить
                  <select
                    value={rule.scope}
                    onChange={(e) =>
                      setRule({ ...rule, scope: e.target.value })
                    }
                  >
                    <option value="all">Все ноды</option>
                    {data.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Важность
                  <select
                    value={rule.severity}
                    onChange={(e) =>
                      setRule({ ...rule, severity: e.target.value })
                    }
                  >
                    <option value="warning">Предупреждение</option>
                    <option value="critical">Критический</option>
                  </select>
                </label>
                {rule.metric !== "expiry" && (
                  <label>
                    Повтор
                    <select
                      value={rule.repeat}
                      onChange={(e) =>
                        setRule({ ...rule, repeat: Number(e.target.value) })
                      }
                    >
                      <option value={900}>Через 15 минут</option>
                      <option value={3600}>Через час</option>
                      <option value={86400}>Через сутки</option>
                    </select>
                  </label>
                )}
                {rule.metric === "expiry" && (
                  <p className="muted">
                    По одному сообщению на каждый срок: выбранный порог, 3 дня,
                    1 день и истечение. Этапы выше выбранного порога
                    пропускаются.
                  </p>
                )}
                <div className="spread">
                  <span>
                    {rule.metric === "expiry"
                      ? "Сообщать о продлении"
                      : "Сообщать о восстановлении"}
                  </span>
                  <Switch
                    label="Восстановление"
                    value={rule.recovery}
                    onChange={(v) => setRule({ ...rule, recovery: v })}
                  />
                </div>
                <button disabled={busy} className="button primary full">
                  Сохранить правило
                </button>
              </form>
            </Panel>
          </div>
          <Panel title="Последние доставки">
            <Table
              rows={data.deliveries as (Row & { id: string })[]}
              columns={deliveryColumns}
            />
          </Panel>
        </>
      ) : tab === "Каналы" ? (
        <Panel title="Telegram">
          <div className="channel-card">
            <Send size={38} />
            <div>
              <h2>Уведомления через вашего бота</h2>
              <p>Подключите токен, укажите чат и отправьте тест.</p>
            </div>
            <Link to="/settings?tab=telegram" className="button primary">
              Настроить Telegram <ArrowRight size={18} />
            </Link>
          </div>
        </Panel>
      ) : (
        <Panel title="История доставки">
          <Table
            rows={data.deliveries as (Row & { id: string })[]}
            columns={deliveryColumns}
          />
        </Panel>
      )}
    </>
  );
}
const events = [
  ["expiry", "Истечение аренды"],
  ["renewal", "Продление сервера"],
  ["offline", "Потеря связи с агентом"],
  ["cpu", "Перегрузка CPU"],
  ["ram", "Перегрузка RAM"],
  ["disk", "Мало места на диске"],
  ["traffic", "Порог трафика"],
  ["detection", "Торрент-обнаружения"],
  ["complaint", "Внешние жалобы"],
  ["recovery", "Восстановление"],
];
export function Telegram() {
  const { data, demo, toast, refresh } = useStore();
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState("");
  const [chat, setChat] = useState("");
  const [linked, setLinked] = useState("");
  const [recipient, setRecipient] = useState("Личный чат");
  const [code, setCode] = useState("");
  const [chosen, setChosen] = useState(events.map((x) => x[0]));
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    if (demo) {
      setUsername("stealthnet_monitor_demo_bot");
      setHasToken(false);
      setLinked("");
      return;
    }
    api("/settings/telegram")
      .then((r) => {
        setHasToken(r.has_token);
        setUsername(r.username || "");
        setChat(r.chat_id || "");
        setLinked(r.chat_id || "");
        setChosen(r.events || events.map((x) => x[0]));
        setEnabled(r.enabled ?? true);
      })
      .catch((e) => setError(e.message));
  }, [demo]);
  async function action(kind: string) {
    setError("");
    if (demo) {
      if (token) {
        setError(
          "В демо-режиме используйте только вымышленные данные. Для настоящего токена включите рабочий режим.",
        );
        setToken("");
        return;
      }
      toast(
        kind === "test"
          ? "Демо: тестовое уведомление показано справа. Отправки в Telegram нет."
          : kind === "link"
            ? "Демо: в рабочем режиме появится одноразовая команда /start."
            : "Настройки изменены в демо-сеансе",
      );
      if (kind === "link") setCode("/start demo_connect");
      return;
    }
    setBusy(kind);
    try {
      if (kind === "save") {
        await api("/settings/telegram", {
          method: "PUT",
          body: JSON.stringify({
            token: token || undefined,
            chat_id: chat,
            events: chosen,
            enabled,
          }),
        });
        setToken("");
        setHasToken(true);
        setLinked(chat);
        toast("Настройки Telegram сохранены");
      }
      if (kind === "validate") {
        const r = await api("/settings/telegram/validate", {
          method: "POST",
          body: JSON.stringify({ token: token || undefined }),
        });
        setUsername(r.username);
        toast("Бот найден: @" + r.username);
      }
      if (kind === "link") {
        const r = await api("/settings/telegram/link", { method: "POST" });
        setCode("/start " + r.code);
        toast("Отправьте команду боту, затем нажмите «Проверить привязку».");
      }
      if (kind === "poll") {
        const r = await api("/settings/telegram/link/check", {
          method: "POST",
        });
        if (r.chat_id) {
          setChat(r.chat_id);
          setLinked(r.chat_id);
          toast("Чат привязан");
        } else toast("Команда пока не найдена. Отправьте её боту.");
      }
      if (kind === "test") {
        await api("/settings/telegram/test", { method: "POST" });
        toast("Тест поставлен в очередь. Результат появится в истории.");
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="split telegram-layout">
        <div className="stack">
          <Panel
            title="1. Токен бота"
            sub="Создайте бота через BotFather и вставьте токен"
          >
            <div className="token-row">
              <div className="password-field">
                <input
                  aria-label="Токен Telegram-бота"
                  type={show ? "text" : "password"}
                  autoComplete="off"
                  value={token}
                  placeholder={
                    hasToken
                      ? "Токен сохранён · оставьте пустым, чтобы сохранить"
                      : "123456789:AA…"
                  }
                  onChange={(e) => setToken(e.target.value)}
                />
                <button
                  title={show ? "Скрыть токен" : "Показать токен"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              <button
                className="button primary"
                disabled={!!busy || (!demo && !token && !hasToken)}
                onClick={() => void action("validate")}
              >
                Проверить токен
              </button>
            </div>
            {username && (
              <div className="bot-result">
                <div>
                  <Bot size={27} />
                </div>
                <span>
                  <b>@{username}</b>
                  <small>
                    {demo
                      ? "Пример подключения"
                      : "Бот доступен через Telegram API"}
                  </small>
                </span>
                {demo && <span className="demo-small">Демо</span>}
              </div>
            )}
          </Panel>
          <Panel
            title="2. Получатель"
            sub="Сначала сохраните токен, затем привяжите чат"
          >
            <Tabs
              items={["Личный чат", "Группа"]}
              value={recipient}
              onChange={setRecipient}
            />
            {recipient === "Личный чат" ? (
              <div className="recipient-steps">
                <p>
                  1. Откройте своего бота в Telegram.
                  <br />
                  2. Создайте и отправьте ему одноразовую команду.
                </p>
                {code ? (
                  <CopyText text={code} />
                ) : (
                  <button
                    className="button"
                    disabled={!!busy}
                    onClick={() => void action("link")}
                  >
                    Создать команду /start
                  </button>
                )}
                {code && (
                  <button
                    className="button"
                    disabled={!!busy}
                    onClick={() => void action("poll")}
                  >
                    Проверить привязку
                  </button>
                )}
                <small className="muted">
                  Команда действует 10 минут. Привязка не меняет webhook бота.
                </small>
              </div>
            ) : (
              <label>
                Chat ID группы
                <input
                  aria-label="Chat ID"
                  value={chat}
                  placeholder="-100…"
                  onChange={(e) => setChat(e.target.value)}
                />
                <small className="muted">
                  Добавьте бота в группу с правом отправки сообщений.
                </small>
              </label>
            )}
            {linked && (
              <p className="mint">
                <CheckCircle size={15} />
                Получатель: {linked}
              </p>
            )}
          </Panel>
          <Panel
            title="3. Какие события отправлять"
            sub="Условия срабатывания задаются в разделе «Оповещения»"
          >
            <div className="checkbox-grid">
              {events.map(([k, label]) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(k)}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...chosen, k]
                          : chosen.filter((x) => x !== k),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="spread">
              <span>Отправка уведомлений</span>
              <Switch
                label="Telegram включён"
                value={enabled}
                onChange={setEnabled}
              />
            </div>
            <p className="footnote">
              Повторы и восстановление настраиваются отдельно для каждого
              правила.
            </p>
          </Panel>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => void action("save")}
            >
              <Save size={18} />
              {busy === "save" ? "Сохранение…" : "Сохранить настройки"}
            </button>
            <button
              className="button"
              disabled={!!busy || (!demo && !linked)}
              onClick={() => void action("test")}
            >
              <Send size={18} />
              Отправить тест
            </button>
          </div>
        </div>
        <div className="stack">
          <Panel
            title="Пример уведомления"
            sub="Так будет выглядеть сообщение в Telegram"
          >
            <div className="telegram-preview">
              <div className="telegram-message">
                <div className="tiny muted">
                  stealthnet-monitor <time>14:12</time>
                </div>
                <h3>
                  <span className="red">●</span> Агент недоступен
                </h3>
                <h3>Frankfurt-07</h3>
                <dl className="details">
                  <div>
                    <dt>Регион</dt>
                    <dd>Германия</dd>
                  </div>
                  <div>
                    <dt>Нет связи с</dt>
                    <dd>14:09 UTC</dd>
                  </div>
                  <div>
                    <dt>Длительность</dt>
                    <dd>3 мин</dd>
                  </div>
                  <div>
                    <dt>Источник</dt>
                    <dd>Heartbeat агента</dd>
                  </div>
                </dl>
                <p>
                  Панель не получает телеметрию. Проверьте агент и сетевое
                  подключение.
                </p>
                <div className="preview-link">Открыть ноду ↗</div>
                <small className="tiny muted">Пример сообщения</small>
              </div>
            </div>
          </Panel>
          <Panel
            title="История доставки"
            sub="Успешная отправка не означает прочтение"
            action={
              <Link className="more-link" to="/alerts">
                Все события →
              </Link>
            }
          >
            <div className="delivery-list">
              {data.deliveries.length ? (
                data.deliveries.slice(0, 6).map((r) => (
                  <div key={String(r.id)}>
                    <span>
                      <b>{r.title}</b>
                      <small>{datetime(r.time)}</small>
                    </span>
                    <Badge status={String(r.status)} />
                  </div>
                ))
              ) : (
                <Empty
                  title="Отправок пока нет"
                  text="После привязки чата отправьте тестовое сообщение."
                />
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
export function Settings() {
  const { data, demo, setDemo, toast } = useStore();
  const [params, setParams] = useSearchParams();
  const names = [
    "Интеграции",
    "Telegram",
    "Агенты",
    "Обновления",
    "Хранение",
    "Доступ",
  ];
  const keys = [
    "integrations",
    "telegram",
    "agents",
    "updates",
    "storage",
    "access",
  ];
  const index = Math.max(0, keys.indexOf(params.get("tab") || ""));
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("Проверка доступна после настройки");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!demo)
      api("/settings/remnawave")
        .then((r) => {
          setUrl(r.url || "");
          setStatus(
            r.last_error ||
              (r.last_sync
                ? "Последняя синхронизация: " + datetime(r.last_sync)
                : "Не подключено"),
          );
        })
        .catch((e) => setStatus(e.message));
  }, [demo]);
  async function remna(kind: string) {
    if (demo) {
      setToken("");
      toast("Демо: реальные подключения доступны в рабочем режиме");
      return;
    }
    setBusy(true);
    try {
      if (kind === "save") {
        await api("/settings/remnawave", {
          method: "PUT",
          body: JSON.stringify({ url, token: token || undefined }),
        });
        setToken("");
        toast("Подключение сохранено");
      } else {
        const r = await api("/settings/remnawave/sync", { method: "POST" });
        setStatus(`Синхронизировано: ${r.nodes} нод, ${r.users} пользователей`);
      }
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        title="Настройки"
        sub={
          index === 1
            ? "Подключение Telegram-бота"
            : index === 3
              ? "Обновления и обслуживание stealthnet-monitor"
              : "Интеграции и параметры панели"
        }
      />
      <Tabs
        items={names}
        value={names[index]}
        onChange={(t) => setParams({ tab: keys[names.indexOf(t)] })}
      />
      {index === 1 ? (
        <Telegram />
      ) : index === 3 ? (
        <Updates />
      ) : index === 0 ? (
        <div className="split wide-left">
          <div className="stack">
            <Panel
              title="Remnawave"
              sub="Подключение к API и синхронизация данных"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void remna("save");
                }}
                className="settings-form"
              >
                <label>
                  Адрес API
                  <input
                    type="url"
                    required
                    placeholder="https://panel.example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
                <label>
                  API токен
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Новый токен (сохранённый не отображается)"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </label>
                <label>
                  Интервал синхронизации<span>60 секунд</span>
                </label>
                <label>
                  Статус<span className="muted">{status}</span>
                </label>
                <div className="button-row end">
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => void remna("sync")}
                  >
                    Проверить и синхронизировать
                  </button>
                  <button disabled={busy} className="button primary">
                    Сохранить
                  </button>
                </div>
              </form>
            </Panel>
            <Panel
              title="Источники мониторинга"
              sub="Состояние источников определяется фактически полученными данными"
            >
              <div className="source-list">
                {[
                  [
                    "Remnawave API",
                    "Пользователи, логические ноды и HWID",
                    data.users.length > 0,
                  ],
                  [
                    "Метрики агентов",
                    "CPU, RAM, диск, сеть",
                    data.nodes.length > 0,
                  ],
                  [
                    "События Xray",
                    "Наблюдаемые подключения и признаки протоколов",
                    data.connections.length > 0,
                  ],
                  [
                    "Геолокация",
                    "Координаты нод задаются при добавлении",
                    data.nodes.length > 0,
                  ],
                ].map(([t, s, on]) => (
                  <div key={String(t)}>
                    <Server />
                    <span>
                      <b>{t}</b>
                      <small>{s}</small>
                    </span>
                    <Badge
                      status={on ? "online" : "offline"}
                      label={demo ? "Демо" : on ? "Есть данные" : "Нет данных"}
                    />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="stack">
            <Panel title="Система">
              <dl className="details">
                <div>
                  <dt>Версия</dt>
                  <dd>0.1.2-dev</dd>
                </div>
                <div>
                  <dt>Режим</dt>
                  <dd>{demo ? "Демонстрационный" : "Рабочий"}</dd>
                </div>
                <div>
                  <dt>Сервер</dt>
                  <dd>Rust</dd>
                </div>
              </dl>
            </Panel>
            <Panel title="Свежесть данных">
              <p>{datetime(data.updated_at)}</p>
              <small className="muted">
                Неизвестные значения обозначены прочерком.
              </small>
            </Panel>
            <Panel title="Telegram">
              <p className="muted">
                Основной канал для уведомлений о проблемах и восстановлении.
              </p>
              <Link className="button primary full" to="/settings?tab=telegram">
                <Send size={18} />
                Подключить бота
              </Link>
            </Panel>
          </div>
        </div>
      ) : index === 2 ? (
        <Panel title="Агенты">
          <Table
            rows={data.nodes}
            columns={[
              { key: "name", title: "Нода" },
              { key: "agent", title: "Версия" },
              {
                key: "last_seen",
                title: "Последняя связь",
                render: (r) => datetime(r.last_seen),
              },
              {
                key: "status",
                title: "Состояние",
                render: (r) => <Badge status={r.status} />,
              },
            ]}
          />
          <p className="footnote">
            Агент отправляет метрики каждые 15 секунд. Обновление бинарного
            файла — через install-agent.sh на сервере.
          </p>
        </Panel>
      ) : index === 4 ? (
        <Panel title="Хранение">
          <dl className="details">
            <div>
              <dt>Метрики</dt>
              <dd>30 дней, затем удаление</dd>
            </div>
            <div>
              <dt>Доставка уведомлений</dt>
              <dd>История последних 30 дней</dd>
            </div>
            <div>
              <dt>Резервное копирование</dt>
              <dd>
                <CopyText text="make backup" />
              </dd>
            </div>
          </dl>
          <p className="muted">
            Срок хранения задаётся в окружении сервера через RETENTION_DAYS.
            PostgreSQL используется при установке через Docker Compose.
          </p>
        </Panel>
      ) : (
        <Panel title="Доступ к панели">
          <p>
            Рабочий режим требует входа с паролем владельца. Демонстрационные
            данные хранятся отдельно от реальной инфраструктуры.
          </p>
          <div className="button-row">
            <button className="button primary" onClick={() => setDemo(!demo)}>
              {demo ? "Открыть рабочую панель" : "Вернуться к демо"}
            </button>
            {!demo && (
              <button
                className="button"
                onClick={() =>
                  void api("/session", { method: "DELETE" }).then(() =>
                    location.reload(),
                  )
                }
              >
                Выйти из аккаунта
              </button>
            )}
          </div>
          <p className="footnote">
            Пароль владельца задаётся на сервере через ADMIN_PASSWORD.
          </p>
        </Panel>
      )}
    </>
  );
}
function Updates() {
  return (
    <>
      <Panel title="Версия панели">
        <div className="version-banner">
          <Monitor size={45} />
          <div>
            <span className="muted">Установленная версия</span>
            <h2>v0.1.2</h2>
            <p>Первая тестовая версия</p>
          </div>
          <ArrowRight size={25} />
          <div>
            <span className="muted">Источник обновлений</span>
            <h2>GitHub Releases</h2>
            <a
              href="https://github.com/STEALTHNET-APP/stealthnet-monitor/releases"
              target="_blank"
              rel="noreferrer"
            >
              STEALTHNET-APP/stealthnet-monitor
            </a>
          </div>
        </div>
      </Panel>
      <Panel
        title="Обновление через терминал"
        sub="Выполните команду в каталоге установленной панели"
      >
        <CopyText text="make update" />
        <h3>Этапы обновления</h3>
        <div className="steps">
          {[
            "Резервная копия",
            "Загрузка версии",
            "Миграции",
            "Проверка запуска",
          ].map((t, i) => (
            <div key={t}>
              <span>{i + 1}</span>
              <b>{t}</b>
              <small>Ожидание команды</small>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid two">
        <Panel title="Команды управления" sub="Команды выполняются на сервере">
          <div className="command-list">
            {["start", "stop", "status", "logs", "backup", "rollback"].map(
              (c) => (
                <CopyText key={c} text={"make " + c} />
              ),
            )}
          </div>
        </Panel>
        <Panel title="Последнее обновление">
          <Empty
            title="Истории обновлений пока нет"
            text="История операций доступна в терминале сервера."
          />
          <div className="notice-box">
            <p>
              Настройки и данные сохраняются вне каталога релиза. Перед
              обновлением создаётся резервная копия.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
export function AddNode() {
  const { demo, data, toast, refresh } = useStore();
  const [params] = useSearchParams();
  const [mode, setMode] = useState("existing");
  const [billing, setBilling] = useState<BillingData>({
    provider: "",
    expires_at: null,
    monthly_cost: null,
    currency: "USD",
  });
  const [name, setName] = useState(params.get("name") || "Frankfurt-02");
  const [address, setAddress] = useState(params.get("address") || "");
  const [region, setRegion] = useState(params.get("region") || (demo ? "de" : "xx"));
  const [nodeSecret, setNodeSecret] = useState("");
  const [nodeImage, setNodeImage] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [port, setPort] = useState(2222);
  const [command, setCommand] = useState("");
  const [enrollment, setEnrollment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(false);
  const [newNode, setNewNode] = useState("");
  const loadNodeImage = useCallback(async (overwrite = false, signal?: AbortSignal) => {
    setImageLoading(true);
    setImageError("");
    try {
      const release = demo
        ? { image: "remnawave/node:3.4.1" }
        : await api<{ image: string }>("/node-image/latest", { signal });
      if (!signal?.aborted) setNodeImage((current) => overwrite || !current ? release.image : current);
    } catch (e) {
      if (!signal?.aborted) setImageError((e as Error).message);
    } finally {
      if (!signal?.aborted) setImageLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    if (mode !== "clean") {
      setImageLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadNodeImage(false, controller.signal);
    return () => controller.abort();
  }, [mode, loadNodeImage]);
  useEffect(() => {
    if (!enrollment || demo) return;
    const i = setInterval(
      () =>
        api("/enrollments/" + enrollment)
          .then((r) => {
            if (r.node_id) {
              setNewNode(r.node_id);
              void refresh();
            }
          })
          .catch((e) => setError(e.message)),
      4000,
    );
    return () => clearInterval(i);
  }, [enrollment, demo]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (demo) {
        setCommand(
          "# ДЕМО — команда не устанавливает агент\n# В рабочем режиме здесь будет одноразовый токен",
        );
        setProgress(true);
      } else {
        const r = regions.find((r) => r[2] === region) || [
          "Не указан",
          "Не указан",
          "xx",
          0,
          0,
        ];
        const res = await api("/enrollments", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            address,
            mode,
            ...billing,
            country: r[1],
            code: r[2],
            city: r[0],
            lat: r[3],
            lon: r[4],
            group: Number(r[3]) > 35 && Number(r[4]) < 40 ? "Европа" : "Мир",
            node_secret: nodeSecret || undefined,
            node_image: nodeImage || undefined,
            node_port: port,
          }),
        });
        setEnrollment(res.id);
        setCommand(res.command);
        setProgress(true);
        setNodeSecret("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        title={progress ? "Установка сервера" : "Добавить сервер"}
        sub={
          progress
            ? `${name} · ${mode === "existing" ? "Работающая нода" : "Чистый сервер"}`
            : "Подключите инфраструктуру одной командой"
        }
      />
      <div className="steps onboarding-steps">
        {["Сценарий", "Параметры", "Установка", "Проверка"].map((t, i) => (
          <div className={i < (progress ? 3 : 1) ? "done" : ""} key={t}>
            <span>{i + 1}</span>
            <b>{t}</b>
          </div>
        ))}
      </div>
      {progress ? (
        <div className="split wide-left">
          <Panel
            title="Выполните команду на сервере"
            sub="Подключитесь по SSH с правами root"
          >
            <div className="notice-box">
              <p>
                {demo
                  ? "Демонстрация интерфейса установки. Для создания команды включите рабочий режим."
                  : "Токен действителен 15 минут и обменивается только один раз."}
              </p>
            </div>
            <CopyText text={command} disabled={demo} />
            <div className="steps">
              {[
                "Команда создана",
                "Агент установлен",
                "Регистрация",
                "Телеметрия",
              ].map((s, i) => (
                <div key={s} className={i === 0 || newNode ? "done" : ""}>
                  <span>{i === 0 || newNode ? "✓" : i + 1}</span>
                  <b>{s}</b>
                  <small>
                    {i === 0 ? "Готово" : newNode ? "Получено" : "Ожидание"}
                  </small>
                </div>
              ))}
            </div>
            <Panel title="Состояние установки">
              <pre className="console-output">
                {newNode
                  ? "Агент зарегистрирован. Получение метрик началось."
                  : demo
                    ? "Демо-сценарий. Реальная установка не запущена."
                    : "Ожидаем регистрацию агента.\nПодробный лог установщика выводится в SSH-терминале сервера."}
              </pre>
            </Panel>
            {error && (
              <p className="red" role="alert">
                {error}
              </p>
            )}
          </Panel>
          <Panel title="Параметры">
            <dl className="details">
              <div>
                <dt>Название</dt>
                <dd>{name}</dd>
              </div>
              <div>
                <dt>Регион</dt>
                <dd>{regions.find((r) => r[2] === region)?.[1]}</dd>
              </div>
              <div>
                <dt>Сценарий</dt>
                <dd>
                  {mode === "existing" ? "Агент" : "Remnawave Node + агент"}
                </dd>
              </div>
            </dl>
            {newNode ? (
              <Link className="button primary full" to={"/nodes/" + newNode}>
                Открыть сервер
              </Link>
            ) : (
              <button disabled className="button full">
                Ожидаем подключения
              </button>
            )}
            <button className="button full" onClick={() => setProgress(false)}>
              Изменить параметры
            </button>
            <Link className="more-link" to="/nodes">
              Вернуться к списку
            </Link>
          </Panel>
        </div>
      ) : (
        <form onSubmit={create}>
          <div className="grid two scenario-grid">
            {[
              [
                "existing",
                "Работающая нода",
                "Установить агент и подключить мониторинг",
                [
                  "Обнаружение сервера",
                  "Сбор CPU, RAM, диска и сети",
                  "Подключение к панели",
                ],
              ],
              [
                "clean",
                "Чистый сервер",
                "Установить Remnawave Node и агент",
                [
                  "Запуск контейнера Remnawave Node",
                  "Конфигурация из вашей Remnawave",
                  "Подключение мониторинга",
                ],
              ],
            ].map(([v, t, s, bullets]) => (
              <button
                type="button"
                key={String(v)}
                className={"scenario " + (mode === v ? "selected" : "")}
                onClick={() => setMode(String(v))}
              >
                <div className="scenario-title">
                  <span className="radio-dot" />
                  <Server size={45} />
                  <div>
                    <h2>{t}</h2>
                    <p>{s}</p>
                  </div>
                </div>
                <div className="divider" />
                {(bullets as string[]).map((b) => (
                  <div className="scenario-feature" key={b}>
                    <CheckCircle size={23} />
                    <span>{b}</span>
                  </div>
                ))}
              </button>
            ))}
          </div>
          <div className="split wide-left">
            <Panel title="Параметры сервера">
              <BillingFields value={billing} onChange={setBilling} />
              <label>
                Название сервера
                <input
                  required
                  maxLength={80}
                  pattern={String.raw`[\p{L}\p{N}._ \-]+`}
                  title="До 80 символов: буквы, цифры, пробел, точка, дефис или подчёркивание"
                  aria-describedby="server-name-help"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <small id="server-name-help" className="footnote">Можно на русском, например «Нидерланды-01».</small>
              </label>
              <label>
                IP сервера (необязательно)
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="IPv4 или IPv6"
                />
                <small className="footnote">Если оставить пустым, агент передаст публичный IP своего сетевого интерфейса.</small>
              </label>
              <label>
                Регион
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  <option value="xx">Не указан — без маркера на карте</option>
                  {regions.map((r) => (
                    <option value={r[2]} key={r[2]}>
                      {r[1]} · {r[0]}
                    </option>
                  ))}
                </select>
              </label>
              {mode === "clean" && (
                <>
                  <label>
                    SECRET_KEY из Remnawave
                    <input
                      required={!demo}
                      type="password"
                      value={nodeSecret}
                      autoComplete="off"
                      onChange={(e) => setNodeSecret(e.target.value)}
                    />
                  </label>
                  <div className="grid two">
                    <div>
                      <label>
                        Версия образа
                        <input
                          required={!demo}
                          value={nodeImage}
                          aria-describedby="node-image-help"
                          aria-busy={imageLoading}
                          placeholder={imageLoading ? "Получаем актуальную версию…" : "remnawave/node:тег"}
                          onChange={(e) => setNodeImage(e.target.value)}
                        />
                        <small id="node-image-help" className="footnote" aria-live="polite">
                          {imageLoading ? "Проверяем официальный релиз…" : demo ? "Пример версии для демонстрации." : "Стабильная версия подставляется автоматически. Можно указать другую."}
                        </small>
                      </label>
                      {imageError && <p className="red" role="alert">{imageError}</p>}
                      <button type="button" className="button subtle" disabled={imageLoading} onClick={() => void loadNodeImage(true)}>
                        <RefreshCw size={16} /> Подставить актуальную
                      </button>
                    </div>
                    <label>
                      NODE_PORT
                      <input
                        required
                        type="number"
                        min={1}
                        max={65535}
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <p className="footnote">
                    Создайте ноду и выберите конфигурационный профиль в
                    Remnawave. Возьмите SECRET_KEY и NODE_PORT из выданного
                    Docker Compose. Если вашей панели нужна определённая версия ноды, укажите её в поле образа.
                  </p>
                </>
              )}
            </Panel>
            <Panel title="Что понадобится">
              <div className="requirement">
                <KeyRound />
                <span>
                  <b>SSH-доступ</b>
                  <small>С правами root или sudo</small>
                </span>
              </div>
              <div className="requirement">
                <Network />
                <span>
                  <b>Доступ к сети</b>
                  <small>Исходящее соединение с панелью по HTTPS</small>
                </span>
              </div>
              <div className="requirement">
                <Monitor />
                <span>
                  <b>Linux и systemd</b>
                  <small>Debian / Ubuntu, x86_64 или aarch64</small>
                </span>
              </div>
            </Panel>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <Panel className="onboarding-footer">
            <CheckCircle className="mint" size={27} />
            <span>
              Выбран режим:{" "}
              {mode === "existing" ? "работающая нода" : "чистый сервер"}
            </span>
            <button className="button primary" disabled={busy || (mode === "clean" && imageLoading)}>
              Продолжить <ArrowRight size={18} />
            </button>
          </Panel>
        </form>
      )}
    </>
  );
}
