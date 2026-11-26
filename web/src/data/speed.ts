export const gigabitScale = (peak: number) =>
  peak < 1 ? { factor: 1000, unit: "Мбит/с" } : { factor: 1, unit: "Гбит/с" };

export function formatSpeed(gbps: number | null | undefined) {
  if (gbps == null || !Number.isFinite(gbps)) return "—";
  const { factor, unit } = gigabitScale(gbps);
  const value = (gbps * factor).toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  });
  return `${value} ${unit}`;
}
