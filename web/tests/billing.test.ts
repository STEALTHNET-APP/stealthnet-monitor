import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPaymentDate, paymentDays } from "../src/data/billing.ts";

test("monthly payment previews preserve the day across short months and year boundaries", () => {
  const ts = Date.parse;
  const anchor = ts("2023-01-31T23:59:59Z");
  for (const [now, expected] of [
    ["2023-02-28T23:59:59Z", "2023-02-28T00:00:00Z"],
    ["2023-03-01T00:00:00Z", "2023-03-31T00:00:00Z"],
    ["2024-02-01T00:00:00Z", "2024-02-29T00:00:00Z"],
    ["2024-04-01T00:00:00Z", "2024-04-30T00:00:00Z"],
    ["2025-01-01T00:00:00Z", "2025-01-31T00:00:00Z"],
  ]) assert.equal(nextPaymentDate(anchor, ts(now)), ts(expected));
  assert.equal(nextPaymentDate(ts("2026-12-15T00:00:00Z"), ts("2026-12-16T00:00:00Z")), ts("2027-01-15T00:00:00Z"));
  assert.equal(paymentDays(ts("2026-09-15T00:00:00Z"), ts("2026-09-15T23:59:59Z")), 0);
});
