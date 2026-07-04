/**
 * localStorage persistence for the comps feature: the user's last inputs,
 * their RapidAPI key, and the last fetched result (so reopening the app
 * doesn't spend API quota). Deliberately separate from the plan state —
 * addresses and keys never enter share URLs or saved plans.
 */

import type { BucketStats, CompSale } from "./types";

const PREFS_KEY = "njord.comps.prefs.v1";
const API_KEY_KEY = "njord.comps.key.v1";
const CACHE_KEY = "njord.comps.cache.v1";

/** The comps form inputs. */
export interface CompsPrefs {
  address: string;
  beds: number;
  baths: number;
}

/** A cached classification run. */
export interface CompsCache {
  fetchedAt: string;
  subjectLabel: string;
  districtName: string | null;
  searchedZip: string;
  comps: CompSale[];
  sameStreet: BucketStats;
  nearby: BucketStats;
  district: BucketStats;
}

function readRaw(key: string): unknown {
  try {
    const text = window.localStorage.getItem(key);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Fail-soft: private mode / quota errors degrade to "not persisted".
  }
}

/** Last-used inputs, or sensible defaults. */
export function loadPrefs(): CompsPrefs {
  const raw = readRaw(PREFS_KEY) as Partial<CompsPrefs> | null;
  return {
    address: typeof raw?.address === "string" ? raw.address.slice(0, 120) : "",
    beds: typeof raw?.beds === "number" && Number.isFinite(raw.beds) ? raw.beds : 3,
    baths: typeof raw?.baths === "number" && Number.isFinite(raw.baths) ? raw.baths : 2,
  };
}

export function savePrefs(prefs: CompsPrefs): void {
  writeRaw(PREFS_KEY, prefs);
}

/** RapidAPI key ("" when unset). Stored only in this browser. */
export function loadApiKey(): string {
  const raw = readRaw(API_KEY_KEY);
  return typeof raw === "string" ? raw : "";
}

export function saveApiKey(key: string): void {
  writeRaw(API_KEY_KEY, key.trim());
}

/** Last successful run, if it still parses. */
export function loadCache(): CompsCache | null {
  const raw = readRaw(CACHE_KEY) as Partial<CompsCache> | null;
  if (
    raw === null ||
    typeof raw.fetchedAt !== "string" ||
    typeof raw.subjectLabel !== "string" ||
    !Array.isArray(raw.comps)
  ) {
    return null;
  }
  return raw as CompsCache;
}

export function saveCache(cache: CompsCache): void {
  writeRaw(CACHE_KEY, cache);
}
