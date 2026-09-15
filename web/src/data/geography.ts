import type { Node, Row } from "./demo";

export type ConnectionRegion = {
  id: string;
  name: string;
  country: string;
  code: string;
  lat: number;
  lon: number;
  node: Node;
  rows: Row[];
  ips: Set<string>;
  users: Set<string>;
};
export function recentConnections(
  rows: Row[],
  period: string,
  now: number,
  node?: Node,
): Row[] {
  const span =
    (
      {
        "15 мин": 15 * 60000,
        "1 ч": 3600000,
        "6 ч": 6 * 3600000,
        "24 ч": 86400000,
        "7 д": 7 * 86400000,
      } as Record<string, number>
    )[period] ?? 86400000;
  return rows.filter(
    (r) =>
      (!node || (r.node_id ? r.node_id === node.id : r.node === node.name)) &&
      typeof (r.last_seen ?? r.time) === "number" &&
      Number(r.last_seen ?? r.time) >= now - span &&
      Number(r.last_seen ?? r.time) <= now + 60000,
  );
}
export function connectionRegions(
  rows: Row[],
  nodes: Node[],
): ConnectionRegion[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const groups = new Map<string, ConnectionRegion>();
  for (const row of rows) {
    const lat = row.geo_lat,
      lon = row.geo_lon;
    const node = row.node_id
      ? byId.get(String(row.node_id))
      : byName.get(String(row.node));
    if (
      !node ||
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180 ||
      !row.ip
    )
      continue;
    const place = row.geo_city
      ? `${row.geo_area ?? ""}:${row.geo_city}`
      : `${lat.toFixed(2)}:${lon.toFixed(2)}`;
    const id = `${node.id}:${row.geo_code}:${place}`;
    const group = groups.get(id) ?? {
      id,
      name: String(row.geo_city || row.geo_country || row.region),
      country: String(row.geo_country || ""),
      code: String(row.geo_code || "xx"),
      lat,
      lon,
      node,
      rows: [],
      ips: new Set<string>(),
      users: new Set<string>(),
    };
    group.lat += (lat - group.lat) / (group.rows.length + 1);
    group.lon += (lon - group.lon) / (group.rows.length + 1);
    group.rows.push(row);
    group.ips.add(String(row.ip));
    if (row.user) group.users.add(String(row.user));
    groups.set(id, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.ips.size - a.ips.size || a.id.localeCompare(b.id),
  );
}

export function clusterConnectionRegions(
  regions: ConnectionRegion[],
  project: (point: [number, number]) => [number, number] | null,
  zoom: number,
): ConnectionRegion[] {
  const cells = new Map<string, ConnectionRegion[]>();
  for (const r of regions) {
    const p = project([r.lon, r.lat]);
    if (!p || !p.every(Number.isFinite)) continue;
    const key = `${r.node.id}:${Math.floor((p[0] * zoom) / 42)}:${Math.floor((p[1] * zoom) / 42)}`;
    const group = cells.get(key) ?? [];
    group.push(r);
    cells.set(key, group);
  }
  return [...cells.entries()].map(([id, group]) =>
    group.length === 1
      ? group[0]
      : {
          ...group[0],
          id,
          name: `${group.length} регионов`,
          country:
            new Set(group.map((r) => r.country)).size === 1
              ? group[0].country
              : "Разные страны",
          lat: group.reduce((s, r) => s + r.lat, 0) / group.length,
          lon: group.reduce((s, r) => s + r.lon, 0) / group.length,
          rows: group.flatMap((r) => r.rows),
          ips: new Set(group.flatMap((r) => [...r.ips])),
          users: new Set(group.flatMap((r) => [...r.users])),
        },
  );
}
