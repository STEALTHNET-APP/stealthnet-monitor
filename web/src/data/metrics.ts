// A bucket first averages samples for each node, then combines nodes. Frequent
// samples from one agent must never multiply fleet traffic or bias CPU averages.
type MetricRow = Record<string, string | number | boolean | null>;
export function metricSeries(
  rows: MetricRow[],
  metric: string,
  hours: number,
  now: number,
  nodeId?: string,
): [number, number | null][] {
  const width = hours <= 1 ? 15000 : hours <= 24 ? 60000 : 300000;
  const buckets = new Map<number, Map<string, [number, number]>>();
  for (const row of rows) {
    const time = Number(row.time),
      value = Number(row.value);
    if (
      row.metric !== metric ||
      (nodeId && row.node_id !== nodeId) ||
      row.value == null ||
      !Number.isFinite(value) ||
      time < now - hours * 3600000 ||
      time > now
    )
      continue;
    const bucket = Math.floor(time / width) * width;
    const nodes = buckets.get(bucket) || new Map<string, [number, number]>();
    const id = String(row.node_id),
      sample = nodes.get(id) || [0, 0];
    nodes.set(id, [sample[0] + value, sample[1] + 1]);
    buckets.set(bucket, nodes);
  }
  const result: [number, number | null][] = [];
  for (const [time, nodes] of [...buckets].sort((a, b) => a[0] - b[0])) {
    const previous = result.at(-1);
    if (previous && time - previous[0] > width * 2)
      result.push([previous[0] + width, null]);
    const sum = [...nodes.values()].reduce((s, [v, count]) => s + v / count, 0);
    result.push([
      time,
      ["rx", "tx", "users"].includes(metric) ? sum : sum / nodes.size,
    ]);
  }
  return result;
}
