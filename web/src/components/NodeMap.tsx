import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, Badge } from "./ui";
import { geoMercator, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { Plus, Minus, LocateFixed, Layers, Info } from "lucide-react";
import { Node } from "../data/demo";
import { useStore } from "../data/store";
export function NodeMap({
  nodes,
  selected,
  onSelect,
  world = false,
  connections = true,
}: {
  nodes: Node[];
  selected?: Node;
  onSelect?: (n: Node) => void;
  world?: boolean;
  connections?: boolean;
}) {
  const [geo, setGeo] = useState<any>();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState([0, 0]);
  const [labels, setLabels] = useState(!world);
  const [hover, setHover] = useState<Node>();
  const [cluster, setCluster] = useState<Node[]>([]);
  const [geoError, setGeoError] = useState(false);
  const { demo } = useStore();
  useEffect(() => {
    fetch("/data/countries-50m.json")
      .then((r) => r.json())
      .then((t) => setGeo(feature(t, t.objects.countries)))
      .catch(() => setGeoError(true));
  }, []);
  const projection = useMemo(
    () =>
      world
        ? geoNaturalEarth1().scale(153).translate([470, 172])
        : geoMercator().center([12, 52]).scale(1060).translate([470, 370]),
    [world],
  );
  const path = geoPath(projection);
  const focus = selected || nodes[0];
  const regions = [
    ...(world
      ? [
          { name: "Нью-Йорк", lon: -74, lat: 40.7, count: 128 },
          { name: "Сингапур", lon: 103.82, lat: 1.35, count: 32 },
          { name: "Сидней", lon: 151.2, lat: -33.8, count: 24 },
          { name: "Токио", lon: 139.69, lat: 35.68, count: 64 },
          { name: "Сан-Паулу", lon: -46.6, lat: -23.55, count: 18 },
          { name: "Лос-Анджелес", lon: -118.2, lat: 34.05, count: 46 },
        ]
      : []),
    { name: "Лондон", lon: -0.12, lat: 51.5, count: 312 },
    { name: "Париж", lon: 2.35, lat: 48.86, count: 398 },
    { name: "Варшава", lon: 21.01, lat: 52.23, count: 842 },
    { name: "Киев", lon: 30.52, lat: 50.45, count: 534 },
  ];
  const priority: Record<string, number> = {
    critical: 4,
    offline: 3,
    warning: 2,
    online: 1,
  };
  const groups = new Map<string, { nodes: Node[]; x: number; y: number }>();
  for (const n of nodes) {
    if (n.code === "xx") continue;
    const p = projection([n.lon, n.lat]);
    if (!p) continue;
    const cell = world ? 58 : 36;
    const key = `${Math.floor((p[0] * zoom) / cell)},${Math.floor((p[1] * zoom) / cell)}`;
    const group = groups.get(key) || { nodes: [], x: 0, y: 0 };
    group.nodes.push(n);
    group.x += p[0];
    group.y += p[1];
    groups.set(key, group);
  }
  const clusters = [...groups.values()].map((g) => ({
    ...g,
    x: g.x / g.nodes.length,
    y: g.y / g.nodes.length,
    nodes: g.nodes.sort(
      (a, b) =>
        (priority[b.status] || 0) - (priority[a.status] || 0) ||
        a.name.localeCompare(b.name),
    ),
  }));
  const miniProjection = geoNaturalEarth1().scale(24).translate([78, 44]);
  const miniPath = geoPath(miniProjection);
  const countries: [string, number, number][] = [
    ["ИСПАНИЯ", -3.8, 39.5],
    ["ФРАНЦИЯ", 2.5, 46.8],
    ["ГЕРМАНИЯ", 10.5, 51.6],
    ["ПОЛЬША", 20, 53.4],
    ["ШВЕЦИЯ", 16, 63],
    ["ФИНЛЯНДИЯ", 27, 64],
    ["ИТАЛИЯ", 12.4, 43],
    ["РУМЫНИЯ", 25, 46.6],
    ["УКРАИНА", 31, 48.6],
    ["БЕЛАРУСЬ", 28, 54.5],
  ];
  function choose(group: Node[]) {
    if (group.length > 1) setCluster(group);
    else onSelect?.(group[0]);
  }
  const height = world ? 320 : 720;
  return (
    <div className={"node-map " + (world ? "world-map" : "europe-map")}>
      <div className="map-top-controls">
        <span>
          {geoError ? "Не удалось загрузить карту" : world ? "" : "Европа"}
        </span>
        <div>
          <button
            title="Сбросить масштаб"
            onClick={() => {
              setZoom(1);
              setOffset([0, 0]);
            }}
          >
            <LocateFixed size={18} />
          </button>
          <button
            title="Названия городов"
            className={labels ? "active" : ""}
            onClick={() => setLabels(!labels)}
          >
            <Layers size={18} />
          </button>
        </div>
      </div>
      <svg
        viewBox={`0 0 940 ${height}`}
        role="group"
        aria-label="Карта нод. Выберите ноду для подробностей."
        onPointerDown={(e) => {
          if (
            e.target === e.currentTarget ||
            (e.target as Element).tagName === "path"
          ) {
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.dataset.x = String(e.clientX);
            e.currentTarget.dataset.y = String(e.clientY);
          }
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            const x = Number(e.currentTarget.dataset.x),
              y = Number(e.currentTarget.dataset.y);
            const scale = 940 / e.currentTarget.clientWidth;
            setOffset((o) => [
              o[0] + (e.clientX - x) * scale,
              o[1] + (e.clientY - y) * scale,
            ]);
            e.currentTarget.dataset.x = String(e.clientX);
            e.currentTarget.dataset.y = String(e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      >
        <defs>
          <filter id={world ? "glow-world" : "glow-europe"}>
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <g
          transform={`translate(${offset[0] + 470 * (1 - zoom)},${offset[1] + (height / 2) * (1 - zoom)}) scale(${zoom})`}
        >
          {geo?.features.map((f: any, i: number) => (
            <path
              key={`${f.id}-${i}`}
              d={path(f) || ""}
              fill="#20303d"
              stroke="#344453"
              strokeWidth={0.5 / zoom}
            />
          ))}
          {!world &&
            labels &&
            countries.map(([name, lon, lat]) => {
              const p = projection([lon, lat])!;
              return (
                <text
                  key={name}
                  x={p[0]}
                  y={p[1]}
                  textAnchor="middle"
                  fontSize={13 / zoom}
                  fill="#8fa5b5"
                  opacity=".8"
                  letterSpacing={1 / zoom}
                >
                  {name}
                </text>
              );
            })}
          {connections &&
            demo &&
            focus &&
            regions.map((r, i) => {
              const a = projection([focus.lon, focus.lat])!,
                b = projection([r.lon, r.lat])!;
              return (
                <g key={r.name}>
                  <path
                    d={`M${a} Q${(a[0] + b[0]) / 2},${Math.min(a[1], b[1]) - 45} ${b}`}
                    fill="none"
                    stroke={i % 2 ? "#5ca8fa" : "#63f1b4"}
                    opacity=".8"
                    strokeWidth={1.8 / zoom}
                  />
                  <circle
                    cx={b[0]}
                    cy={b[1]}
                    r={10 / zoom}
                    fill="#163849"
                    stroke="#5abafa"
                    strokeWidth={2 / zoom}
                  />
                  <circle cx={b[0]} cy={b[1]} r={4 / zoom} fill="#5abafa" />
                  <title>
                    {r.name}: {r.count} наблюдаемых IP · приблизительно
                  </title>
                  {labels &&
                    !nodes.some(
                      (n) =>
                        Math.abs(n.lon - r.lon) < 0.4 &&
                        Math.abs(n.lat - r.lat) < 0.4,
                    ) && (
                      <text
                        x={b[0] + 14 / zoom}
                        y={b[1] + 5 / zoom}
                        fontSize={12 / zoom}
                        fill="#b8c9da"
                      >
                        {r.name}
                      </text>
                    )}
                </g>
              );
            })}
          {clusters.map((group) => {
            const n = group.nodes[0];
            const active = group.nodes.some((n) => focus?.id === n.id);
            const p = [group.x, group.y];
            const color =
              n.status === "critical"
                ? "#f55252"
                : n.status === "warning"
                  ? "#f9c030"
                  : n.status === "offline"
                    ? "#8c9cac"
                    : "#63f1b4";
            return (
              <g
                key={n.id}
                role="button"
                tabIndex={0}
                aria-label={
                  group.nodes.length > 1
                    ? `${n.city}: ${group.nodes.length} нод, ${group.nodes.filter((n) => n.status !== "online").length} требуют внимания`
                    : `${n.name}, ${n.country}`
                }
                style={{ cursor: "pointer" }}
                pointerEvents="bounding-box"
                transform={`translate(${p[0]},${p[1]})`}
                onClick={() => choose(group.nodes)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choose(group.nodes);
                  }
                }}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(undefined)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(undefined)}
              >
                {active && (
                  <circle
                    r={20 / zoom}
                    fill="#63f1b415"
                    stroke="#63f1b4"
                    strokeWidth={1.4 / zoom}
                  />
                )}
                <circle
                  r={12 / zoom}
                  fill={color}
                  opacity=".22"
                  filter={`url(#${world ? "glow-world" : "glow-europe"})`}
                />
                {group.nodes.length > 1 ? (
                  <>
                    <circle
                      r={17 / zoom}
                      fill="#16313a"
                      stroke={color}
                      strokeWidth={2 / zoom}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={12 / zoom}
                      fontWeight="700"
                      fill={color}
                    >
                      {group.nodes.length}
                    </text>
                  </>
                ) : (
                  <path
                    d={`M0,${-7 / zoom} L${7 / zoom},0 0,${7 / zoom} ${-7 / zoom},0 Z`}
                    fill={color}
                    stroke={active ? "#e1fff2" : color}
                  />
                )}
                <title>
                  {group.nodes.map((n) => n.name).join(", ")} · {n.country}
                </title>
                {labels && (
                  <text
                    x={22 / zoom}
                    y={-16 / zoom}
                    fontSize={12 / zoom}
                    fill={active ? "#fff" : "#b6c7d8"}
                    paintOrder="stroke"
                    stroke="#16232d"
                    strokeWidth={3 / zoom}
                  >
                    {active ? focus?.name : n.city}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {!world && geo && (
        <div className="map-locator" aria-label="Европа на карте мира">
          <svg viewBox="0 0 156 88" role="img" aria-label="Расположение Европы">
            {geo.features.map((f: any, i: number) => (
              <path key={`${f.id}-${i}`} d={miniPath(f) || ""} fill="#304453" />
            ))}
            <rect
              x="73"
              y="12"
              width="22"
              height="28"
              fill="#63f1b416"
              stroke="#63f1b4"
              strokeWidth="1"
            />
          </svg>
        </div>
      )}
      {cluster.length > 0 &&
        createPortal(
          <Modal
            title={`Ноды региона · ${cluster.length}`}
            onClose={() => setCluster([])}
          >
            <div className="cluster-list">
              {cluster.map((n) => (
                <button
                  className="cluster-node"
                  key={n.id}
                  onClick={() => {
                    onSelect?.(n);
                    setCluster([]);
                  }}
                >
                  <span>
                    <b>{n.name}</b>
                    <small>
                      {n.city} · {n.ip}
                    </small>
                  </span>
                  <Badge status={n.status} />
                </button>
              ))}
            </div>
          </Modal>,
          document.body,
        )}
      <div className="map-zoom">
        <button
          aria-label="Приблизить карту"
          onClick={() => setZoom((z) => Math.min(4, z * 1.3))}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="Отдалить карту"
          onClick={() => setZoom((z) => Math.max(0.65, z / 1.3))}
        >
          <Minus size={18} />
        </button>
      </div>
      {hover && (
        <div className="map-tooltip">
          <b>{hover.name}</b>
          <span>
            {hover.country} · CPU {hover.cpu ?? "—"}%
          </span>
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="diamond" /> Нода
        </span>
        {connections && demo && (
          <span>
            <i className="ring" />
            Регион подключения
          </span>
        )}
        {connections && demo && (
          <span>
            <i className="connection-line" />
            Подключение
          </span>
        )}
        <span className="map-disclaimer">
          <Info size={13} />
          Геолокация IP приблизительная
        </span>
      </div>
    </div>
  );
}
