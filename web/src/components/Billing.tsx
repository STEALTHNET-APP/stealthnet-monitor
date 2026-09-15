import { useState } from "react";
import {
  CalendarClock,
  Send,
  Save,
  Building2,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Node, fmt } from "../data/demo";
import { useStore } from "../data/store";
import { Panel } from "./ui";
import { nextPaymentDate, paymentDays } from "../data/billing";
export type BillingData = {
  provider: string;
  expires_at: number | null;
  monthly_cost: number | null;
  currency: string;
};
export function Expiry({ value }: { value?: number | null }) {
  if (!value) return <span className="muted">Не указана</span>;
  const days = paymentDays(value);
  return (
    <span
      className={"expiry " + (days <= 0 ? "red" : days <= 7 ? "amber" : "")}
    >
      <CalendarClock size={14} />
      <span>
        {new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" })}
        <small>{days === 0 ? "Оплата сегодня" : days < 0 ? "Дата прошла" : `Через ${days} дн.`}</small>
      </span>
    </span>
  );
}
export function BillingFields({
  value,
  onChange,
}: {
  value: BillingData;
  onChange: (v: BillingData) => void;
}) {
  return (
    <div className="billing-fields">
      <div className="grid two">
        <label>
          Хостер / провайдер
          <input
            maxLength={100}
            list="hosting-providers"
            placeholder="Например, Hetzner"
            value={value.provider}
            onChange={(e) => onChange({ ...value, provider: e.target.value })}
          />
          <datalist id="hosting-providers">
            {[
              "Hetzner",
              "OVHcloud",
              "Leaseweb",
              "DigitalOcean",
              "Vultr",
              "Aeza",
              "Timeweb Cloud",
            ].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label>
          Дата оплаты (ежемесячно, UTC)
          <input
            type="date"
            min="2020-01-01"
            max="2099-12-31"
            value={
              value.expires_at
                ? new Date(value.expires_at).toISOString().slice(0, 10)
                : ""
            }
            onChange={(e) =>
              onChange({
                ...value,
                expires_at: e.target.value
                  ? Date.parse(e.target.value + "T23:59:59Z")
                  : null,
              })
            }
          />
          <small className="muted">
            {value.expires_at ? `Каждый месяц, ${new Date(value.expires_at).getUTCDate()}-го числа. Следующий платёж: ${new Date(nextPaymentDate(value.expires_at)).toLocaleDateString("ru-RU", { timeZone: "UTC" })}.` : "Выберите дату первого платежа — напоминания будут повторяться каждый месяц."}
            {" "}Если такого числа нет в месяце, используется последний день.
          </small>
        </label>
      </div>
      <div className="grid two">
        <label>
          Стоимость в месяц
          <input
            type="number"
            step="0.01"
            min="0"
            max="10000000"
            value={value.monthly_cost ?? ""}
            placeholder="Не указана"
            onChange={(e) =>
              onChange({
                ...value,
                monthly_cost:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          Валюта
          <select
            value={value.currency}
            onChange={(e) => onChange({ ...value, currency: e.target.value })}
          >
            {["USD", "EUR", "RUB", "UAH", "GBP"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
export function BillingEditor({ node }: { node: Node }) {
  const { saveBilling, toast } = useStore();
  const [form, setForm] = useState<BillingData>({
    provider: node.provider || "",
    expires_at: node.expires_at || null,
    monthly_cost: node.monthly_cost ?? null,
    currency: node.currency || "USD",
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveBilling(node.id, form);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="split wide-left">
      <Panel
        title="Хостер и аренда"
        sub="Хостер, стоимость и ежемесячный график оплаты"
      >
        <form onSubmit={submit}>
          <BillingFields value={form} onChange={setForm} />
          <button className="button primary" disabled={busy}>
            <Save size={17} />
            Сохранить данные
          </button>
        </form>
      </Panel>
      <Panel title="Напоминания в Telegram">
        <div className="billing-notification">
          <Send className="blue" size={29} />
          <div>
            <b>Каждый месяц: за 7, 3 и 1 день</b>
            <p>И в день оплаты. Повтор включается автоматически после сохранения даты.</p>
          </div>
        </div>
        <div className="notice-box">
          <p>
            Периоды задаются в правиле «Ежемесячная оплата сервера».
            Напоминания приходят в подключённый Telegram. Панель ведёт график,
            подтверждение оплаты от хостера не получает.
          </p>
        </div>
        <Link className="button full" to="/alerts">
          Настроить оповещения <ExternalLink size={15} />
        </Link>
      </Panel>
    </div>
  );
}
export function BillingSummary({ node }: { node: Node }) {
  return (
    <>
      <div>
        <dt>Хостер</dt>
        <dd>{node.provider || "Не указан"}</dd>
      </div>
      <div>
        <dt>Следующая оплата</dt>
        <dd>
          <Expiry value={node.next_payment_at ?? (node.expires_at ? nextPaymentDate(node.expires_at) : null)} />
        </dd>
      </div>
      <div>
        <dt>В месяц</dt>
        <dd>
          {node.monthly_cost == null
            ? "—"
            : `${fmt(node.monthly_cost, 2)} ${node.currency || "USD"}`}
        </dd>
      </div>
    </>
  );
}
