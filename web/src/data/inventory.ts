import { useEffect, useState } from "react";
import { Row } from "./demo";
import { api, useStore } from "./store";

export type InventoryKind = "user" | "connection" | "device" | "detection";
export function useInventory(
  kind: InventoryKind,
  q = "",
  filter = "all",
  userId = "",
) {
  const { data, demo } = useStore();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ rows: Row[]; total: number }>({
    rows: [],
    total: 0,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => setPage(1), [kind, q, filter, userId]);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        q,
        filter,
        user_id: userId,
        offset: String((page - 1) * 50),
        limit: "50",
      });
      api<{ rows: Row[]; total: number }>(`/inventory/${kind}?${params}`, {
        signal: controller.signal,
      })
        .then((v) => {
          setResult(v);
          setError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, q, filter, userId, page, demo, data.updated_at]);
  const demoRows = data[
    (
      {
        user: "users",
        connection: "connections",
        device: "devices",
        detection: "detections",
      } as const
    )[kind]
  ].filter(
    (r) =>
      Object.values(r)
        .join(" ")
        .toLowerCase()
        .includes(q.trim().toLowerCase()) &&
      (filter === "all" ||
        r.node === filter ||
        r.node_id === filter ||
        r.os === filter) &&
      (!userId ||
        r.user_id === userId ||
        r.user === userId ||
        r.user === data.users.find((u) => u.id === userId)?.name),
  );
  return {
    rows: demo ? demoRows : result.rows,
    total: demo ? demoRows.length : result.total,
    error,
    loading: !demo && loading,
    remote: demo ? undefined : { page, total: result.total, onPage: setPage },
  };
}

export type TrafficTotals = {
  hours: number;
  rx_bytes: number;
  tx_bytes: number;
  total_bytes: number;
  nodes: {
    id: string;
    rx_bytes: number;
    tx_bytes: number;
    observed_seconds: number;
    peak_gbps: number;
  }[];
};
export function useTraffic(hours: number) {
  const { data, demo } = useStore();
  const [totals, setTotals] = useState<TrafficTotals>();
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    api<TrafficTotals>(`/traffic-summary?hours=${hours}`, {
      signal: controller.signal,
    })
      .then(setTotals)
      .catch(() => {});
    return () => controller.abort();
  }, [hours, demo, data.updated_at]);
  return totals?.hours === hours ? totals : undefined;
}
export function volume(bytes?: number) {
  if (bytes == null) return "—";
  const divisor = bytes >= 1e12 ? 1e12 : bytes >= 1e9 ? 1e9 : 1e6;
  return `${(bytes / divisor).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${divisor === 1e12 ? "ТБ" : divisor === 1e9 ? "ГБ" : "МБ"}`;
}
