/**
 * Display formatting helpers (UI layer only — the engine never rounds).
 */

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole-dollar currency: $1,234. */
export function fmtUsd(value: number): string {
  return usd0.format(value);
}

/** Cent-precision currency: $1,234.56 (monthly payments). */
export function fmtUsd2(value: number): string {
  return usd2.format(value);
}

/** Compact currency for axis ticks: $500, $1.5K, $400K, $1.2M. */
export function fmtUsdCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${trimZero((value / 1_000_000).toFixed(1))}M`;
  if (abs >= 100_000) return `$${(value / 1_000).toFixed(0)}K`;
  if (abs >= 1_000) return `$${trimZero((value / 1_000).toFixed(1))}K`;
  return usd0.format(value);
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/** "30 yr" / "24 yr 7 mo" / "9 mo". */
export function fmtMonthsAsTerm(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

/** "Yr 12 · Mo 3" for tooltips over a monthly axis. */
export function fmtMonthPoint(month: number): string {
  if (month <= 0) return "Start";
  const year = Math.ceil(month / 12);
  const monthOfYear = ((month - 1) % 12) + 1;
  return `Yr ${year} · Mo ${monthOfYear}`;
}
