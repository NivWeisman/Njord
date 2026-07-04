/**
 * localStorage persistence: named saved plans plus a rolling autosave of the
 * last session. All reads pass through `sanitizeState`; all storage access is
 * fail-soft (private mode, disabled storage, or quota errors become no-ops).
 */

import { sanitizeState } from "./model";
import type { PlanState } from "./model";

const PLANS_KEY = "njord.plans.v1";
const AUTOSAVE_KEY = "njord.autosave.v1";

/** A named, timestamped snapshot of the whole plan. */
export interface SavedPlan {
  name: string;
  /** ISO-8601 save timestamp. */
  savedAt: string;
  state: PlanState;
}

function readRaw(key: string): unknown {
  try {
    const text = window.localStorage.getItem(key);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** All saved plans, newest first. Invalid entries are silently dropped. */
export function listPlans(): SavedPlan[] {
  const raw = readRaw(PLANS_KEY);
  if (!Array.isArray(raw)) return [];
  const plans: SavedPlan[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const state = sanitizeState(e.state);
    if (state === null || typeof e.name !== "string" || e.name.length === 0) continue;
    plans.push({
      name: e.name.slice(0, 80),
      savedAt: typeof e.savedAt === "string" ? e.savedAt : new Date(0).toISOString(),
      state,
    });
  }
  return plans.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Save (or overwrite) a plan under `name`. Returns false if storage failed. */
export function savePlan(name: string, state: PlanState): boolean {
  const others = listPlans().filter((p) => p.name !== name);
  return writeRaw(PLANS_KEY, [
    { name, savedAt: new Date().toISOString(), state },
    ...others,
  ]);
}

/** Remove a saved plan by name (no-op when absent). */
export function deletePlan(name: string): void {
  writeRaw(
    PLANS_KEY,
    listPlans().filter((p) => p.name !== name),
  );
}

/** The autosaved last-session plan, if any. */
export function loadAutosave(): PlanState | null {
  return sanitizeState(readRaw(AUTOSAVE_KEY));
}

/** Keep the autosave slot current (called on every state change, debounced). */
export function saveAutosave(state: PlanState): void {
  writeRaw(AUTOSAVE_KEY, state);
}
