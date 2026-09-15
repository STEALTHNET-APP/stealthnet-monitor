// Keep the original selected day: January 31 -> February 28 -> March 31.
export function nextPaymentDate(anchor: number, now = Date.now()): number {
  const original = new Date(anchor);
  const today = new Date(now);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const first = Date.UTC(original.getUTCFullYear(), original.getUTCMonth(), original.getUTCDate());
  if (first >= todayUtc) return first;
  const month = (offset: number) => {
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset + 1, 0));
    return Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), Math.min(original.getUTCDate(), last.getUTCDate()));
  };
  const current = month(0);
  return current >= todayUtc ? current : month(1);
}
export function paymentDays(due: number, now = Date.now()): number {
  return Math.floor(due / 86400000) - Math.floor(now / 86400000);
}
