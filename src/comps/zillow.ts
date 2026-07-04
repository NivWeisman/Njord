/**
 * Recently-sold search via a Zillow-data provider on RapidAPI
 * (zillow-com1.p.rapidapi.com — Zillow retired its official public API, so
 * third-party providers are the practical route; the caller supplies their
 * own RapidAPI key). Request building and response normalization live here
 * so the provider can be swapped without touching the pipeline.
 */

import { CompsError } from "./types";
import type { CompSale } from "./types";

const HOST = "zillow-com1.p.rapidapi.com";

/** Quota guard: at most this many result pages per run (~40 sales/page). */
const MAX_PAGES = 2;

/** Server-side narrowing hints (re-filtered client-side regardless). */
export interface SearchFilters {
  beds: number;
  baths: number;
}

/** Build one search-page URL. Exported for tests. */
export function buildSearchUrl(zip: string, page: number, filters?: SearchFilters): string {
  const params = new URLSearchParams({
    location: zip,
    status_type: "RecentlySold",
    home_type: "Houses",
    soldInLast: "36m",
    page: String(page),
  });
  if (filters) {
    params.set("bedsMin", String(Math.max(0, filters.beds - 1)));
    params.set("bedsMax", String(filters.beds + 1));
    params.set("bathsMin", String(Math.max(0, filters.baths - 1)));
    params.set("bathsMax", String(filters.baths + 1));
  }
  return `https://${HOST}/propertyExtendedSearch?${params}`;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Normalize one provider response page into CompSale records. Entries
 * missing an address, a positive price, or a sold date are dropped — the
 * three fields every downstream consumer relies on.
 */
export function normalizeZillowResponse(raw: unknown): {
  comps: CompSale[];
  totalPages: number;
} {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(obj.props) ? obj.props : [];
  const comps: CompSale[] = [];

  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const p = entry as Record<string, unknown>;

    const address = typeof p.address === "string" ? p.address : null;
    const price = asNumber(p.price);
    const soldMs = asNumber(p.dateSold);
    if (address === null || price === undefined || price <= 0 || soldMs === undefined) {
      continue;
    }

    comps.push({
      id: String(p.zpid ?? `${address}|${soldMs}`),
      address,
      price,
      dateSold: new Date(soldMs).toISOString(),
      beds: asNumber(p.bedrooms),
      baths: asNumber(p.bathrooms),
      sqft: asNumber(p.livingArea),
      lat: asNumber(p.latitude),
      lon: asNumber(p.longitude),
      sameStreet: false,
      nearby: false,
      inDistrict: false,
    });
  }

  const totalPages = asNumber(obj.totalPages) ?? 1;
  return { comps, totalPages: Math.max(1, Math.trunc(totalPages)) };
}

async function fetchPage(
  apiKey: string,
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    signal,
    headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": HOST },
  });
}

function searchError(status: number): CompsError {
  if (status === 401 || status === 403) {
    return new CompsError(
      "search",
      "The RapidAPI key was rejected (401/403). Check the key and that you are subscribed to the Zillow API on RapidAPI.",
    );
  }
  if (status === 429) {
    return new CompsError(
      "search",
      "RapidAPI rate/quota limit hit (429). Free tiers allow a limited number of requests — try again later.",
    );
  }
  return new CompsError("search", `The sales search failed with HTTP ${status}.`);
}

/**
 * Fetch recently-sold houses in a ZIP (up to MAX_PAGES pages, deduplicated).
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
  let totalPages = 1;

  for (let page = 1; page <= Math.min(MAX_PAGES, totalPages); page++) {
    let response = await fetchPage(apiKey, buildSearchUrl(zip, page, filters), signal);
    if (response.status === 400) {
      response = await fetchPage(apiKey, buildSearchUrl(zip, page), signal);
    }
    if (!response.ok) throw searchError(response.status);

    const normalized = normalizeZillowResponse((await response.json()) as unknown);
    totalPages = normalized.totalPages;
    for (const comp of normalized.comps) byId.set(comp.id, comp);
  }
  return [...byId.values()];
}
