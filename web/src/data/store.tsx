import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { Snapshot, demoSnapshot, emptySnapshot, Rule, Row } from "./demo";
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!r.ok) {
    const error = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(error.error || `HTTP ${r.status}`);
  }
  return r.status === 204 ? (undefined as T) : await r.json();
}
type Store = {
  data: Snapshot;
  demo: boolean;
  loading: boolean;
  error: string;
  period: string;
  setPeriod: (v: string) => void;
  setDemo: (v: boolean) => void;
  refresh: () => Promise<void>;
  toast: (v: string) => void;
  saveRule: (v: Rule) => Promise<void>;
  addComplaint: (v: Row) => Promise<void>;
  saveBilling: (id: string, v: Partial<import("./demo").Node>) => Promise<void>;
  notice: string;
};
const Context = createContext<Store>(null!);
export function Provider({ children }: { children: ReactNode }) {
  const [demo, setDemoState] = useState(
    localStorage.getItem("sn-mode") === "demo" ||
      (import.meta.env.DEV && localStorage.getItem("sn-mode") !== "live"),
  );
  const [data, setData] = useState(demo ? demoSnapshot() : emptySnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("24 ч");
  const [notice, setNotice] = useState("");
  const toast = useCallback((s: string) => setNotice(s), []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const refresh = useCallback(async () => {
    if (demo) {
      setData((d) => ({ ...d, updated_at: Date.now() }));
      return;
    }
    setLoading(true);
    try {
      setData(await api<Snapshot>("/snapshot"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    if (demo) {
      setData(demoSnapshot());
      setError("");
    } else {
      setData(emptySnapshot);
      void refresh();
    }
    const id = setInterval(() => void refresh(), 15000);
    return () => clearInterval(id);
  }, [demo, refresh]);
  function setDemo(v: boolean) {
    localStorage.setItem("sn-mode", v ? "demo" : "live");
    setDemoState(v);
  }
  async function saveRule(v: Rule) {
    if (!demo)
      await api("/alert-rules/" + encodeURIComponent(v.id), {
        method: "PUT",
        body: JSON.stringify(v),
      });
    setData((d) => ({
      ...d,
      rules: [...d.rules.filter((r) => r.id !== v.id), v],
    }));
    toast(demo ? "Правило сохранено в демо-сеансе" : "Правило сохранено");
  }
  async function addComplaint(v: Row) {
    const row = demo
      ? v
      : await api("/complaints", { method: "POST", body: JSON.stringify(v) });
    setData((d) => ({ ...d, complaints: [row, ...d.complaints] }));
    toast(demo ? "Жалоба добавлена в демо-сеанс" : "Жалоба добавлена");
  }
  async function saveBilling(id: string, v: Partial<import("./demo").Node>) {
    if (!demo)
      await api("/nodes/" + encodeURIComponent(id) + "/billing", {
        method: "PATCH",
        body: JSON.stringify(v),
      });
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...v } : n)),
    }));
    toast(
      demo
        ? "Данные аренды сохранены в демо-сеансе"
        : "Данные аренды сохранены. Напоминания пересчитаны.",
    );
  }
  return (
    <Context.Provider
      value={{
        data,
        demo,
        loading,
        error,
        period,
        setPeriod,
        setDemo,
        refresh,
        toast,
        saveRule,
        addComplaint,
        notice,
        saveBilling,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
