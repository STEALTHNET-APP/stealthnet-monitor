import { Expiry } from "./Billing";
import { ReactNode, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ArrowUpDown,
  X,
} from "lucide-react";
import { useStore } from "../data/store";
import { fmt, Node, Row } from "../data/demo";
export function Header({
  title,
  sub,
  action,
  period = false,
}: {
  title: string;
  sub: string;
  action?: ReactNode;
  period?: boolean;
}) {
  const s = useStore();
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      <div className="heading-actions">
        {period && (
          <div className="segmented">
            {["1 ч", "6 ч", "24 ч", "7 д"].map((p) => (
              <button
                key={p}
                className={s.period === p ? "active" : ""}
                onClick={() => s.setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {action}
      </div>
    </div>
  );
}
export function AddServer() {
  return (
    <Link className="button primary" to="/add-server">
      <Plus size={20} />
      Добавить сервер
    </Link>
  );
}
export function Panel({
  title,
  sub,
  action,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((x) => (
        <button
          role="tab"
          aria-selected={value === x}
          key={x}
          className={value === x ? "active" : ""}
          onClick={() => onChange(x)}
        >
          {x}
        </button>
      ))}
    </div>
  );
}
export function Badge({ status, label }: { status: string; label?: string }) {
  const labels: Record<string, string> = {
    online: "Онлайн",
    offline: "Нет связи",
    warning: "Внимание",
    critical: "Критический",
    new: "Новая",
    reviewed: "Проверено",
    closed: "Завершено",
    delivered: "Доставлено",
    retry: "Повтор",
    failed: "Ошибка",
    resolved: "Восстановлено",
    queued: "В очереди",
  };
  return (
    <span className={"badge " + status}>
      <i />
      {label || labels[status] || status}
    </span>
  );
}
export function Meter({
  value,
  color,
}: {
  value: number | null;
  color?: string;
}) {
  return (
    <div className="meter">
      <span className="track">
        <i
          style={{
            width: `${value || 0}%`,
            background:
              color ||
              (value != null && value > 85
                ? "var(--red)"
                : value != null && value > 70
                  ? "var(--amber)"
                  : "var(--mint)"),
          }}
        />
      </span>
      <span>
        {fmt(value)}
        {value != null ? "%" : ""}
      </span>
    </div>
  );
}
export function Flag({ code }: { code: string }) {
  return <span aria-label={code.toUpperCase()} className={"flag " + code} />;
}
export function Spark({
  color = "var(--mint)",
  seed = 0,
}: {
  color?: string;
  seed?: number;
}) {
  return (
    <svg className="spark" viewBox="0 0 100 40" aria-hidden="true">
      <polyline
        points={Array.from(
          { length: 30 },
          (_, i) =>
            `${i * 3.4},${35 - i * 0.75 - Math.sin(i * 1.7 + seed) * 4}`,
        ).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}
export function Stat({
  icon,
  label,
  value,
  note,
  color,
  spark = true,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  note?: string;
  color?: string;
  spark?: boolean;
}) {
  const { demo } = useStore();
  return (
    <div className="stat panel">
      <div className="stat-icon" style={{ color }}>
        {icon}
      </div>
      <div className="stat-text">
        <p>{label}</p>
        <strong>{value}</strong>
        {note && (
          <small style={{ color: color || "var(--mint)" }}>{note}</small>
        )}
      </div>
      {spark && demo && <Spark color={color} />}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Поиск",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="searchbox">
      <Search size={19} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Очистить поиск" onClick={() => onChange("")}>
          <X size={15} />
        </button>
      )}
    </label>
  );
}
export function Empty({
  title = "Нет данных",
  text = "Данные появятся после подключения источника.",
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">—</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function CopyText({
  text,
  disabled = false,
}: {
  text: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useStore();
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Не удалось скопировать. Выделите команду вручную.");
    }
  }
  return (
    <div className="copytext">
      <code>{text}</code>
      <button aria-label="Копировать" disabled={disabled} onClick={copy}>
        {copied ? <Check size={18} /> : <Copy size={18} />}
      </button>
    </div>
  );
}
export type Column<T> = {
  key: string;
  title: string;
  render?: (v: T) => ReactNode;
  sort?: (v: T) => string | number;
};
export function Table<T extends { id: string | number }>({
  rows,
  columns,
  onRow,
  pageSize = 10,
  remote,
  emptyText,
}: {
  rows: T[];
  columns: Column<T>[];
  onRow?: (r: T) => void;
  pageSize?: number;
  remote?: { page: number; total: number; onPage: (page: number) => void };
  emptyText?: string;
}) {
  const [localPage, setLocalPage] = useState(1);
  const page = remote?.page ?? localPage;
  const setPage = remote?.onPage ?? setLocalPage;
  const total = remote?.total ?? rows.length;
  const [sort, setSort] = useState("");
  const [desc, setDesc] = useState(false);
  const c = columns.find((x) => x.key === sort);
  const sorted =
    !remote && c?.sort
      ? [...rows].sort((a, b) => {
          const av = c.sort!(a),
            bv = c.sort!(b);
          return (
            (typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av).localeCompare(String(bv), "ru")) * (desc ? -1 : 1)
          );
        })
      : rows;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, last);
  const visible = remote
    ? sorted
    : sorted.slice((current - 1) * pageSize, current * pageSize);
  return (
    <div className="table-container">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>
                  {col.sort && !remote ? (
                    <button
                      onClick={() => {
                        setSort(col.key);
                        setDesc(sort === col.key ? !desc : false);
                      }}
                    >
                      {col.title}
                      <ArrowUpDown size={12} />
                    </button>
                  ) : (
                    col.title
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                onClick={() => onRow?.(r)}
                className={onRow ? "clickable" : ""}
              >
                {columns.map((col, i) => (
                  <td key={col.key}>
                    {onRow && i === 0 ? (
                      <button
                        className="row-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRow(r);
                        }}
                      >
                        {col.render
                          ? col.render(r)
                          : String((r as any)[col.key] ?? "—")}
                      </button>
                    ) : col.render ? (
                      col.render(r)
                    ) : (
                      String((r as any)[col.key] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <Empty
            title={emptyText || "Нет данных"}
            text={
              emptyText === "Ничего не найдено"
                ? "Попробуйте изменить запрос или фильтр."
                : emptyText === "Загрузка…"
                  ? "Загружаем записи."
                  : undefined
            }
          />
        )}
      </div>
      {total > pageSize && (
        <div className="pagination">
          <span>
            {fmt((current - 1) * pageSize + 1)}–
            {fmt(Math.min(current * pageSize, total))} из {fmt(total)}
          </span>
          <div>
            <button
              aria-label="Предыдущая страница"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from(
              { length: Math.min(5, last) },
              (_, i) => Math.max(1, Math.min(current - 2, last - 4)) + i,
            ).map((p) => (
              <button
                key={p}
                className={p === current ? "active" : ""}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            {last > 5 && <span>… {last}</span>}
            <button
              aria-label="Следующая страница"
              disabled={current === last}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    const focusable = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex="0"]',
        ),
      ).filter((e) => !e.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-heading">
          <h2>{title}</h2>
          <button aria-label="Закрыть" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function MoreLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="more-link" to={to}>
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export const nodeColumns: Column<Node>[] = [
  {
    key: "name",
    title: "Нода",
    sort: (r) => r.name,
    render: (r) => (
      <>
        <Flag code={r.code} />
        <b>{r.name}</b>
      </>
    ),
  },
  { key: "country", title: "Регион", sort: (r) => r.country },
  {
    key: "provider",
    title: "Хостер",
    sort: (r) => r.provider || "",
    render: (r) => r.provider || "—",
  },
  {
    key: "expires_at",
    title: "Следующая оплата",
    sort: (r) => r.next_payment_at || r.expires_at || Infinity,
    render: (r) => <Expiry value={r.next_payment_at ?? r.expires_at} />,
  },
  {
    key: "status",
    title: "Статус",
    render: (r) => <Badge status={r.status} />,
  },
  {
    key: "cpu",
    title: "CPU",
    sort: (r) => r.cpu ?? -1,
    render: (r) => <Meter value={r.cpu} />,
  },
  {
    key: "ram",
    title: "RAM",
    sort: (r) => r.ram ?? -1,
    render: (r) => <Meter value={r.ram} color="var(--blue)" />,
  },
  {
    key: "traffic",
    title: "Трафик",
    sort: (r) => (r.rx || 0) + (r.tx || 0),
    render: (r) => (
      <>
        <Spark seed={r.cpu || 1} />
        <span>
          {r.rx == null ? "—" : fmt(r.rx + (r.tx || 0), 2) + " Гбит/с"}
        </span>
      </>
    ),
  },
  {
    key: "users",
    title: "Онлайн",
    sort: (r) => r.users ?? -1,
    render: (r) => fmt(r.users),
  },
  { key: "agent", title: "Агент" },
];
export const rowId = (r: Row) => String(r.id);
