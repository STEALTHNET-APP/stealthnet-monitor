import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionRegions,
  clusterConnectionRegions,
  recentConnections,
} from "../src/data/geography.ts";
const now = 1800000000000;
const nodes = [
  { id: "a", name: "same" },
  { id: "b", name: "same" },
] as any;
const row = {
  id: "1",
  node_id: "a",
  node: "same",
  ip: "8.8.8.8",
  user: "u1",
  last_seen: now - 1000,
  geo_lat: 0,
  geo_lon: 0,
  geo_country: "Test",
  geo_city: "City",
  geo_code: "xx",
};
test("map groups real observations, deduplicates IPs and retains distinct node destinations", () => {
  const groups = connectionRegions(
    [
      row,
      { ...row, id: "2", protocol: "UDP" },
      { ...row, id: "3", ip: "1.1.1.1", user: "u2" },
      { ...row, id: "4", node_id: "b" },
    ],
    nodes,
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0].ips.size, 2);
  assert.equal(groups[0].users.size, 2);
  assert.equal(groups[0].rows.length, 3);
  assert.equal(groups[1].node.id, "b");
});
test("nearby regions cluster without losing IPs or node destinations and separate with zoom", () => {
  const regions = connectionRegions(
    [
      row,
      {
        ...row,
        id: "2",
        ip: "1.1.1.1",
        geo_city: "Other",
        geo_lat: 20,
        geo_lon: 20,
      },
      { ...row, id: "3", node_id: "b" },
    ],
    nodes,
  );
  const clustered = clusterConnectionRegions(regions, (p) => p, 1);
  assert.equal(clustered.length, 2);
  assert.equal(clustered.find((r) => r.node.id === "a")!.ips.size, 2);
  assert.equal(clusterConnectionRegions(regions, (p) => p, 4).length, 3);
});
test("missing or invalid coordinates do not become map points; node ids and selected period filter observations", () => {
  assert.equal(
    connectionRegions(
      [
        { ...row, geo_lat: null },
        { ...row, geo_lat: 999 },
      ],
      nodes,
    ).length,
    0,
  );
  const rows = recentConnections(
    [
      row,
      { ...row, id: "2", node_id: "b" },
      { ...row, id: "3", last_seen: now - 3600001 },
      { ...row, id: "4", last_seen: null },
    ],
    "1 ч",
    now,
    nodes[0],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["1"],
  );
});
