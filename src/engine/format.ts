const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹3,50,000 (Indian digit grouping). Negative values render as −₹1,21,778. */
export function formatINR(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "−" : "";
  return `${sign}₹${inr.format(Math.abs(rounded))}`;
}

/** Short form for chips and slider labels: ₹3.5L, ₹85k, ₹1.2Cr. */
export function formatINRShort(value: number): string {
  const v = Math.round(value);
  if (v >= 1_00_00_000) return `₹${trim(v / 1_00_00_000)}Cr`;
  if (v >= 1_00_000) return `₹${trim(v / 1_00_000)}L`;
  if (v >= 1_000) return `₹${trim(v / 1_000)}k`;
  return `₹${v}`;
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatPercent(fraction: number, digits = 1): string {
  const p = fraction * 100;
  return `${Number.isInteger(p) ? p.toFixed(0) : p.toFixed(digits)}%`;
}
