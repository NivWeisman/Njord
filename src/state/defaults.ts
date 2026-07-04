/**
 * Factories for fresh scenarios and plans — the app's starting point.
 */

import type { LoanInputs } from "../engine/types";
import { MAX_SCENARIOS, firstFreeSlot, uid } from "./model";
import type { PlanState, Scenario } from "./model";

/** A sensible US starter loan: $400k home, 20% down, 6.5%, 30 years. */
export function defaultInputs(): LoanInputs {
  return {
    homePrice: 400_000,
    downPayment: 80_000,
    annualRatePct: 6.5,
    termYears: 30,
    extraPayments: [],
    usEnabled: true,
    us: {
      propertyTaxAnnualPct: 1.1,
      insuranceAnnual: 1_800,
      pmiAnnualPct: 0.5,
      hoaMonthly: 0,
    },
  };
}

const NAMES = ["Scenario A", "Scenario B", "Scenario C", "Scenario D"] as const;

/**
 * Create a scenario on the lowest free palette slot, optionally cloning the
 * given inputs (for "duplicate"). Returns null when the plan is full.
 */
export function newScenario(
  existing: readonly Scenario[],
  inputs?: LoanInputs,
): Scenario | null {
  if (existing.length >= MAX_SCENARIOS) return null;
  const usedSlots = new Set(existing.map((s) => s.colorSlot));
  const usedNames = new Set(existing.map((s) => s.name));
  return {
    id: uid(),
    name: NAMES.find((n) => !usedNames.has(n)) ?? `Scenario ${existing.length + 1}`,
    colorSlot: firstFreeSlot(usedSlots),
    inputs: inputs ? structuredClone(inputs) : defaultInputs(),
  };
}

/** A fresh single-scenario plan. */
export function defaultState(): PlanState {
  // newScenario only returns null when the plan is full; an empty plan never is.
  const scenario = newScenario([]) as Scenario;
  return { v: 1, activeId: scenario.id, scenarios: [scenario] };
}
