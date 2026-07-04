/**
 * Plan-level state model: a set of named scenarios plus which one is active.
 * Also owns `sanitizeState`, the single validation gate through which every
 * externally sourced payload (URL parameter, localStorage) must pass.
 */

import type { ExtraKind, ExtraPayment, LoanInputs, UsCosts } from "../engine/types";

/** Scenario cap; matches the validated 4-slot categorical chart palette. */
export const MAX_SCENARIOS = 4;

/** One named loan configuration. */
export interface Scenario {
  id: string;
  name: string;
  /** Fixed palette slot (0..MAX_SCENARIOS-1); follows the scenario for life. */
  colorSlot: number;
  inputs: LoanInputs;
}

/** The whole persisted app state. */
export interface PlanState {
  /** Schema version for forward-compatible URL/storage payloads. */
  v: 1;
  activeId: string;
  scenarios: Scenario[];
}

/** Random-enough id; crypto.randomUUID when available (browser, Node 19+). */
export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Lowest palette slot not present in `used`. */
export function firstFreeSlot(used: ReadonlySet<number>): number {
  for (let slot = 0; slot < MAX_SCENARIOS; slot++) {
    if (!used.has(slot)) return slot;
  }
  return 0;
}

/** Clamp a possibly hostile numeric value; fall back when non-finite. */
function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= 80
    ? value
    : fallback;
}

const EXTRA_KINDS: readonly ExtraKind[] = ["once", "monthly", "yearly"];

function sanitizeExtra(raw: unknown): ExtraPayment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!EXTRA_KINDS.includes(r.kind as ExtraKind)) return null;
  const extra: ExtraPayment = {
    id: str(r.id, uid()),
    kind: r.kind as ExtraKind,
    amount: num(r.amount, 0, 0, 1e9),
    startMonth: Math.round(num(r.startMonth, 1, 1, 480)),
  };
  if (typeof r.endMonth === "number") {
    extra.endMonth = Math.round(num(r.endMonth, extra.startMonth, extra.startMonth, 480));
  }
  return extra;
}

function sanitizeUs(raw: unknown): UsCosts {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    propertyTaxAnnualPct: num(r.propertyTaxAnnualPct, 1.1, 0, 10),
    insuranceAnnual: num(r.insuranceAnnual, 1_800, 0, 1e6),
    pmiAnnualPct: num(r.pmiAnnualPct, 0.5, 0, 5),
    hoaMonthly: num(r.hoaMonthly, 0, 0, 1e5),
  };
}

function sanitizeInputs(raw: unknown): LoanInputs {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const homePrice = num(r.homePrice, 400_000, 0, 1e9);
  const downPayment = Math.min(num(r.downPayment, 80_000, 0, 1e9), homePrice);
  const extras = Array.isArray(r.extraPayments)
    ? r.extraPayments.map(sanitizeExtra).filter((e): e is ExtraPayment => e !== null)
    : [];
  return {
    homePrice,
    downPayment,
    annualRatePct: num(r.annualRatePct, 6.5, 0, 30),
    termYears: num(r.termYears, 30, 1, 40),
    extraPayments: extras.slice(0, 20),
    usEnabled: typeof r.usEnabled === "boolean" ? r.usEnabled : true,
    us: sanitizeUs(r.us),
  };
}

/**
 * Validate and repair an untrusted plan payload. Returns null only when the
 * payload is structurally unusable (wrong version, no valid scenarios);
 * individually bad values are clamped or replaced instead of failing whole.
 */
export function sanitizeState(raw: unknown): PlanState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !Array.isArray(r.scenarios)) return null;

  const scenarios: Scenario[] = [];
  const usedSlots = new Set<number>();
  const usedIds = new Set<string>();
  for (const rawScenario of r.scenarios.slice(0, MAX_SCENARIOS)) {
    if (typeof rawScenario !== "object" || rawScenario === null) continue;
    const s = rawScenario as Record<string, unknown>;

    const rawSlot = s.colorSlot;
    let slot =
      typeof rawSlot === "number" &&
      Number.isInteger(rawSlot) &&
      rawSlot >= 0 &&
      rawSlot < MAX_SCENARIOS
        ? rawSlot
        : -1;
    if (slot === -1 || usedSlots.has(slot)) slot = firstFreeSlot(usedSlots);
    usedSlots.add(slot);

    let id = str(s.id, uid());
    if (usedIds.has(id)) id = uid();
    usedIds.add(id);

    scenarios.push({
      id,
      name: str(s.name, `Scenario ${scenarios.length + 1}`),
      colorSlot: slot,
      inputs: sanitizeInputs(s.inputs),
    });
  }
  if (scenarios.length === 0) return null;

  const activeId = scenarios.some((s) => s.id === r.activeId)
    ? (r.activeId as string)
    : scenarios[0].id;
  return { v: 1, activeId, scenarios };
}
