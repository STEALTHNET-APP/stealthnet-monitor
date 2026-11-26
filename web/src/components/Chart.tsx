import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  GraphicComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useStore } from "../data/store";
import { series } from "../data/demo";
import { metricSeries } from "../data/metrics";
import { gigabitScale } from "../data/speed";
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  GraphicComponent,
  CanvasRenderer,
]);
export function Chart({
  height = 225,
  kind = "traffic",
  seed = 1,
  compact = false,
  nodeId,
  points: suppliedPoints,
  label,
  valueUnit,
}: {
  height?: number;
  kind?: string;
  seed?: number;
  compact?: boolean;
  nodeId?: string;
  points?: [number, number | null][];
  label?: string;
  valueUnit?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { period, demo, data } = useStore();
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);
  useEffect(() => {
    const container = ref.current!;
    const chart = echarts.init(container);
    instance.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    const chart = instance.current!;
    const palette = ["#63f1b4", "#5ca8fa", "#a584eb"];
    const hours =
      period === "15 мин"
        ? 0.25
        : period === "1 ч"
          ? 1
          : period === "6 ч"
            ? 6
            : period === "7 д"
              ? 168
              : 24;
    const metric = kind === "traffic" ? "rx" : kind;
    const first: [number, number | null][] =
      suppliedPoints ??
      (demo
        ? series(period, seed)
        : metricSeries(data.metrics, metric, hours, data.updated_at, nodeId));
    const names = suppliedPoints
      ? [label || "Трафик пользователя"]
      : kind === "traffic"
        ? ["Входящий", "Исходящий"]
        : [
            kind === "users"
              ? "Пользователи онлайн"
              : kind === "cpu"
                ? "CPU"
                : kind === "ram"
                  ? "RAM"
                  : kind === "disk"
                    ? "Диск"
                    : "Задержка",
          ];
    const scope = nodeId
      ? data.nodes.filter((n) => n.id === nodeId)
      : data.nodes;
    const total = (key: "rx" | "tx" | "users" | "cpu" | "ram" | "disk") => {
      const known = scope.filter((n) => n[key] != null);
      const sum = known.reduce((s, n) => s + (n[key] || 0), 0);
      return ["cpu", "ram", "disk"].includes(key)
        ? sum / Math.max(1, known.length)
        : sum;
    };
    const demoTarget =
      kind === "traffic"
        ? total("rx")
        : kind === "users"
          ? total("users")
          : ["cpu", "ram", "disk"].includes(kind)
            ? total(kind as "cpu")
            : 25;
    const last = first.at(-1)?.[1] || 1;
    const points: [number, number | null][] =
      demo && !suppliedPoints
        ? first.map(([t, v]) => [t, ((v || 0) / last) * demoTarget])
        : first;
    const rawSeries = [
      points,
      ...(names.length > 1
        ? [
            demo
              ? first.map(([t, v]): [number, number | null] => [
                  t,
                  ((v || 0) / last) * total("tx"),
                ])
              : metricSeries(
                  data.metrics,
                  "tx",
                  hours,
                  data.updated_at,
                  nodeId,
                ),
          ]
        : []),
    ];
    const hasData = rawSeries.some((points) =>
      points.some(([, value]) => value != null),
    );
    const scale =
      kind === "traffic" && !suppliedPoints && valueUnit == null
        ? gigabitScale(
            rawSeries.reduce(
              (peak, points) =>
                points.reduce(
                  (max, [, value]) => Math.max(max, value ?? 0),
                  peak,
                ),
              0,
            ),
          )
        : null;
    const unit =
      valueUnit ??
      (scale
        ? ` ${scale.unit}`
        : ["cpu", "ram", "disk"].includes(kind)
          ? "%"
          : kind === "users"
            ? ""
            : " мс");
    const formatValue = (value: number) =>
      value.toLocaleString("ru-RU", {
        maximumFractionDigits:
          kind === "users" ? 0 : Math.abs(value) < 1 ? 3 : 2,
      });
    chart.setOption(
      {
        animation: false,
        graphic: hasData
          ? []
          : [
              {
                type: "text",
                left: "center",
                top: "middle",
                style: {
                  text: "За этот период нет данных",
                  fill: "#a6b6c7",
                  font: "12px Roboto",
                },
              },
            ],
        color: kind === "users" ? [palette[2]] : palette,
        textStyle: { fontFamily: "Roboto, sans-serif", color: "#aebccd" },
        grid: {
          left: compact ? 49 : 56,
          right: 12,
          top: compact ? 13 : 30,
          bottom: 25,
        },
        legend: {
          show: !compact && kind === "traffic",
          right: 12,
          top: 0,
          icon: "circle",
          itemWidth: 9,
          itemHeight: 9,
          textStyle: { color: "#b6c4d4", fontSize: 11 },
        },
        tooltip: {
          trigger: "axis",
          confine: true,
          backgroundColor: "#101a23",
          borderColor: "#3a4c5d",
          textStyle: { color: "#e6edf7", fontSize: 12 },
          axisPointer: {
            type: "line",
            lineStyle: { color: "#a9bacb", type: "dashed" },
          },
          valueFormatter: (v: unknown) =>
            typeof v === "number" ? formatValue(v) + unit : "—",
        },
        xAxis: {
          type: "time",
          axisLabel: {
            color: "#a6b6c7",
            fontSize: 11,
            hideOverlap: true,
            formatter: (v: number) =>
              hours > 24
                ? new Date(v).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                  })
                : new Date(v).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
          },
          axisLine: { lineStyle: { color: "#42515e" } },
          splitLine: {
            show: true,
            lineStyle: { color: "#28343f", type: "solid" },
          },
        },
        yAxis: {
          type: "value",
          min: 0,
          name: unit.trim(),
          nameTextStyle: { color: "#a6b6c7", fontSize: 11 },
          nameGap: 8,
          splitNumber: 3,
          axisLabel: {
            color: "#a6b6c7",
            fontSize: 11,
            formatter: formatValue,
          },
          splitLine: { lineStyle: { color: "#2b3843", type: "dashed" } },
        },
        dataZoom: [
          { type: "inside", zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false },
        ],
        series: names.map((name, i) => ({
          name,
          type: "line",
          showSymbol: first.length <= 2,
          symbolSize: 6,
          smooth: 0.15,
          lineStyle: { width: 1.65 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              {
                offset: 0,
                color:
                  kind === "users"
                    ? "#a584eb55"
                    : i === 0
                      ? "#63f1b438"
                      : "#5ca8fa2a",
              },
              { offset: 1, color: "#111a2200" },
            ]),
          },
          data: rawSeries[i].map(([time, value]) => [
            time,
            value == null ? null : value * (scale?.factor ?? 1),
          ]),
        })),
      },
      { replaceMerge: ["graphic", "series"] },
    );
  }, [
    period,
    demo,
    data.metrics,
    data.nodes,
    data.updated_at,
    kind,
    seed,
    compact,
    nodeId,
    suppliedPoints,
    label,
    valueUnit,
  ]);
  return (
    <div
      className="chart"
      ref={ref}
      style={{ height }}
      role="img"
      aria-label={
        suppliedPoints
          ? `График: ${label || "Трафик пользователя"}`
          : kind === "traffic"
            ? "График входящего и исходящего трафика. Наведите для точных значений."
            : `График ${kind}`
      }
    />
  );
}
