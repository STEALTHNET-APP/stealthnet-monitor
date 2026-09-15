import { useEffect, useState } from "react";
import { ArrowRight, Monitor } from "lucide-react";
import { Badge, CopyText, Empty, Panel, Table } from "../components/ui";
import { api, useStore } from "../data/store";
import { datetime } from "../data/demo";

type Step = { name: string; status: string; started_at: number | null; finished_at: number | null };
type Operation = {
  id: string; action: string; from_version: string; to_version: string;
  started_at: number | null; finished_at: number | null; updated_at: number;
  status: string; stage: string | null; steps: Step[]; backup: string | null;
  exit_code: number | null; source: string;
};
type History = { installed_version: string; history_available: boolean; rows: Operation[] };
const stages: Record<string, string> = {
  download: "Загрузка версии", backup: "Резервная копия", build: "Сборка",
  start: "Запуск", health: "Проверка запуска", rollback: "Откат приложения",
};
const statuses: Record<string, [string, string]> = {
  running: ["queued", "Выполняется"], succeeded: ["online", "Успешно"],
  failed: ["failed", "Ошибка"], rolled_back: ["warning", "Выполнен автоматический откат"],
  rollback_failed: ["failed", "Ошибка отката"], interrupted: ["warning", "Прервано"],
  unchanged: ["online", "Уже актуальна"],
};
function ResultBadge({ status }: { status: string }) {
  const [color, label] = statuses[status] || ["warning", "Неизвестный результат"];
  return <Badge status={color} label={label} />;
}
function duration(row: Operation) {
  if (!row.started_at || !row.finished_at) return "—";
  const seconds = Math.max(0, Math.floor((row.finished_at - row.started_at) / 1000));
  return `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
}
export function Updates() {
  const { demo } = useStore();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedId(null);
    setData(null);
    setError("");
    if (demo) {
      const now = Date.now();
      setData({ installed_version: "0.1.6", history_available: true, rows: [{
        id: "demo-update", action: "update", from_version: "v0.1.5", to_version: "v0.1.6",
        started_at: now - 360000, finished_at: now - 60000, updated_at: now - 60000,
        status: "succeeded", stage: "health", backup: "backups/demo", exit_code: null, source: "demo",
        steps: ["download", "backup", "build", "start", "health"].map((name, i) => ({ name, status: "succeeded", started_at: now - 360000 + i * 60000, finished_at: now - 300000 + i * 60000 })),
      }] });
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await api<History>("/updates", { signal: controller.signal });
        if (!stopped) { setData(result); setError(""); }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      } finally {
        if (!stopped) timer = setTimeout(() => void refresh(), 3000);
      }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [demo]);
  const rows = data?.rows || [];
  const operation = rows.find(row => row.id === selectedId) || rows[0];
  const stageNames = operation?.action === "rollback" ? ["rollback"] : ["download", "backup", "build", "start", "health", ...(operation?.steps.some(s => s.name === "rollback") ? ["rollback"] : [])];
  return <>
    <Panel title="Версия панели">
      <div className="version-banner">
        <Monitor size={45} />
        <div><span className="muted">Установленная версия</span><h2>{data ? `v${data.installed_version}` : "Загрузка…"}</h2><p>Версия работающего сервера</p></div>
        <ArrowRight size={25} />
        <div><span className="muted">Источник обновлений</span><h2>GitHub Releases</h2><a href="https://github.com/STEALTHNET-APP/stealthnet-monitor/releases" target="_blank" rel="noreferrer">STEALTHNET-APP/stealthnet-monitor</a></div>
      </div>
    </Panel>
    {error && <div className="notice-box" role="alert">{error}. Во время перезапуска панель может быть недоступна. Повторяем проверку автоматически.</div>}
    <Panel title="Обновление через терминал" sub="Выполните команду в каталоге установленной панели. Результат появится здесь автоматически.">
      <CopyText text="make update" />
      <h3>{selectedId ? "Этапы выбранной операции" : "Этапы последней операции"}</h3>
      {operation?.source === "imported" ? <p className="footnote">Результат восстановлен из журнала сервера. Время отдельных этапов не записывалось.</p> : <div className="steps" aria-label="Этапы обновления">
        {stageNames.map((name, i) => {
          const step = operation?.steps.find(s => s.name === name);
          const label = step ? (statuses[step.status]?.[1] || step.status) : operation ? (operation.status === "running" ? "Ожидает" : "Не выполнялся") : "Ещё не запускалось";
          return <div key={name} className={step?.status === "succeeded" ? "done" : step?.status || ""}><span>{i + 1}</span><b>{stages[name]}</b><small>{label}</small></div>;
        })}
      </div>}
    </Panel>
    <div className="grid two">
      <Panel title="Команды управления" sub="Команды выполняются на сервере"><div className="command-list">{["start", "stop", "status", "logs", "backup", "rollback"].map(c => <CopyText key={c} text={`make ${c}`} />)}</div></Panel>
      <Panel title={selectedId ? "Выбранная операция" : "Последнее обновление"}>
        {operation ? <>
          <div className="update-result"><h3>{operation.action === "rollback" ? "Откат" : "Обновление"}: {operation.from_version} → {operation.to_version}</h3><ResultBadge status={operation.status} /></div>
          <dl className="update-details">
            <div><dt>Начало</dt><dd>{operation.started_at ? datetime(operation.started_at) : "Не записано"}</dd></div>
            <div><dt>Завершение</dt><dd>{operation.finished_at ? datetime(operation.finished_at) : "Выполняется"}</dd></div>
            <div><dt>Длительность</dt><dd>{duration(operation)}</dd></div>
            <div><dt>Резервная копия</dt><dd>{operation.backup || "Не записана"}</dd></div>
            {operation.exit_code != null && <div><dt>Код ошибки</dt><dd>{operation.exit_code}</dd></div>}
          </dl>
          {operation.source === "imported" && <p className="footnote">Импортировано из сохранившегося журнала сервера.</p>}
          {operation.status === "rolled_back" && <p className="footnote">Установка новой версии не завершилась. Предыдущее приложение восстановлено.</p>}
          {["failed", "rollback_failed", "interrupted"].includes(operation.status) && <p className="footnote">Операция не завершена успешно. Подробности доступны в выводе команды на сервере.</p>}
        </> : <Empty title={data ? "Обновлений пока нет" : "Загружаем историю…"} text={data ? "Новые запуски make update и make rollback будут записываться автоматически." : "Проверяем журнал на сервере."} />}
        <div className="notice-box"><p>Перед обновлением создаётся резервная копия. Настройки, база данных и журнал операций сохраняются между релизами.</p></div>
      </Panel>
    </div>
    {rows.length > 0 && <Panel title="История операций" sub="Последние 100 обновлений и откатов. Время показано в часовом поясе браузера.">
      <Table rows={rows} columns={[
        {key: "updated_at", title: "Время", render: row => datetime(row.finished_at || row.updated_at)},
        {key: "action", title: "Операция", render: row => row.action === "rollback" ? "Откат" : "Обновление"},
        {key: "to_version", title: "Версия", render: row => `${row.from_version} → ${row.to_version}`},
        {key: "status", title: "Результат", render: row => <ResultBadge status={row.status} />},
        {key: "id", title: "", render: row => <button className="button" onClick={() => setSelectedId(row.id)}>Подробнее</button>},
      ]} />
      {selectedId && <button className="button" onClick={() => setSelectedId(null)}>Показать последнюю операцию</button>}
    </Panel>}
  </>;
}
