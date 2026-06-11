export function money(v: number | null | undefined, opts?: { sign?: boolean }): string {
  if (v == null || !isFinite(v)) return "—";
  const sign = v < 0 ? "−" : opts?.sign && v > 0 ? "+" : "";
  const a = Math.abs(v);
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  return `${sign}$${a.toFixed(2)}`;
}

export function price(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(v: number | null | undefined, opts?: { sign?: boolean; digits?: number }): string {
  if (v == null || !isFinite(v)) return "—";
  const d = opts?.digits ?? 1;
  const sign = v > 0 && opts?.sign ? "+" : "";
  return `${sign}${(v * 100).toFixed(d)}%`;
}
