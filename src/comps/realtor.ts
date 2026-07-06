/**
 * Recently-sold search via "Realty in US" (apidojo) on RapidAPI, backed by
 * realtor.com MLS records. RapidAPI purged its Zillow-scraper listings
 * (verified against the gateway, July 2026), so realtor.com data is the
 * sold-comps source. This module owns the provider's request/response
 * shape end to end, so swapping providers never touches the pipeline.
 */

import { DEFAULT_CLASSIFY } from "./analyze";
import { CompsError } from "./types";
import type { CompSale } from "./types";

const HOST = "realty-in-us.p.rapidapi.com";
const SEARCH_URL = `https://${HOST}/properties/v3/list`;

/** realtor.com's native page size. */
const PAGE_SIZE = 42;

/** Quota guard: at most this many pages per run. */
const MAX_PAGES = 2;

/** Server-side narrowing hints (re-filtered client-side regardless). */
export interface SearchFilters {
  beds: number;
  baths: number;
}

/**
 * Build the `properties/v3/list` POST body: sold homes in a ZIP within the
 * classification window, newest first. Exported for tests (`now` injectable).
 */
export function buildSearchBody(
  zip: string,
  offset: number,
  filters?: SearchFilters,
  now: Date = new Date(),
): Record<string, unknown> {
  const oldest = new Date(now);
  oldest.setFullYear(oldest.getFullYear() - DEFAULT_CLASSIFY.windowYears);

  const body: Record<string, unknown> = {
    limit: PAGE_SIZE,
    offset,
    postal_code: zip,
    status: ["sold"],
    sold_date: { min: oldest.toISOString().slice(0, 10) },
    sort: { direction: "desc", field: "sold_date" },
  };
  if (filters) {
    body.beds = {
      min: Math.max(0, Math.floor(filters.beds) - 1),
      max: Math.ceil(filters.beds) + 1,
    };
    body.baths = {
      min: Math.max(0, Math.floor(filters.baths) - 1),
      max: Math.ceil(filters.baths) + 1,
    };
  }
  return body;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Baths arrive as a number or as a "2.5"-style consolidated string. */
function parseBaths(description: Record<string, unknown>): number | undefined {
  const direct = asNumber(description.baths);
  if (direct !== undefined) return direct;
  if (typeof description.baths_consolidated === "string") {
    const parsed = Number.parseFloat(description.baths_consolidated);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Normalize one response page into CompSale records. Entries missing an
 * address line, a positive sold price, or a sold date are dropped — the
 * fields every downstream consumer relies on. Price and date accept both
 * the `description.sold_*` and legacy `last_sold_*` field variants.
 */
export function normalizeRealtorResponse(raw: unknown): {
  comps: CompSale[];
  total: number;
} {
  const search = asRecord(asRecord(asRecord(raw).data).home_search);
  const list = Array.isArray(search.results) ? search.results : [];
  const comps: CompSale[] = [];

  for (const entry of list) {
    const r = asRecord(entry);
    const description = asRecord(r.description);
    const address = asRecord(asRecord(r.location).address);
    const coordinate = asRecord(address.coordinate);

    const line = typeof address.line === "string" ? address.line : null;
    const city = typeof address.city === "string" ? address.city : "";
    const state = typeof address.state_code === "string" ? address.state_code : "";
    const price = asNumber(description.sold_price) ?? asNumber(r.last_sold_price);
    const dateRaw =
      (typeof description.sold_date === "string" ? description.sold_date : undefined) ??
      (typeof r.last_sold_date === "string" ? r.last_sold_date : undefined);

    if (line === null || price === undefined || price <= 0 || dateRaw === undefined) {
      continue;
    }
    const soldMs = Date.parse(dateRaw);
    if (!Number.isFinite(soldMs)) continue;

    const fullAddress = [line, city, state].filter(Boolean).join(", ");
    comps.push({
      id: String(r.property_id ?? `${fullAddress}|${dateRaw}`),
      address: fullAddress,
      price,
      dateSold: new Date(soldMs).toISOString(),
      beds: asNumber(description.beds),
      baths: parseBaths(description),
      sqft: asNumber(description.sqft),
      lat: asNumber(coordinate.lat),
      lon: asNumber(coordinate.lon),
      sameStreet: false,
      nearby: false,
      inDistrict: false,
    });
  }

  return { comps, total: asNumber(search.total) ?? comps.length };
}

async function postSearch(
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(SEARCH_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": HOST,
    },
    body: JSON.stringify(body),
  });
}

function searchError(status: number): CompsError {
  if (status === 401 || status === 403) {
    return new CompsError(
      "search",
      "The RapidAPI key was rejected (401/403). Check the key and that you are subscribed to the 'Realty in US' API on RapidAPI.",
    );
  }
  if (status === 429) {
    return new CompsError(
      "search",
      "RapidAPI rate/quota limit hit (429). Free tiers allow a limited number of requests — try again later.",
    );
  }
  return new CompsError("search", `The sold-homes search failed with HTTP ${status}.`);
}

/**
 * Fetch recently-sold homes in a ZIP (up to MAX_PAGES pages, deduplicated).
 * On a 400 the request is retried once without the narrowing filters, in
 * case the provider revs its parameter names.
 */
export async function fetchRecentlySold(
  apiKey: string,
  zip: string,
  filters: SearchFilters,
  signal?: AbortSignal,
): Promise<CompSale[]> {
  const byId = new Map<string, CompSale>();
  let total = Number.POSITIVE_INFINITY;

  for (let page = 0; page < MAX_PAGES && page * PAGE_SIZE < total; page++) {
    const offset = page * PAGE_SIZE;
    let response = await postSearch(apiKey, buildSearchBody(zip, offset, filters), signal);
    if (response.status === 400) {
      response = await postSearch(apiKey, buildSearchBody(zip, offset), signal);
    }
    if (!response.ok) throw searchError(response.status);

    const normalized = normalizeRealtorResponse((await response.json()) as unknown);
    total = normalized.total;
    for (const comp of normalized.comps) byId.set(comp.id, comp);
    if (normalized.comps.length === 0) break;
  }
  return [...byId.values()];
}
