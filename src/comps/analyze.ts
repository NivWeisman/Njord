/**
 * Pure comp-classification logic: street-name normalization, great-circle
 * distance, point-in-polygon, the similarity/recency filter, bucket
 * assignment, and summary statistics. No I/O — fully unit-tested.
 */

import type { BucketStats, ClassifiedComps, CompSale } from "./types";

/** Canonical short forms for street suffixes (USPS-style). */
const SUFFIX: Record<string, string> = {
  street: "st", st: "st",
  avenue: "ave", ave: "ave", av: "ave",
  boulevard: "blvd", blvd: "blvd",
  drive: "dr", dr: "dr",
  road: "rd", rd: "rd",
  lane: "ln", ln: "ln",
  court: "ct", ct: "ct",
  place: "pl", pl: "pl",
  terrace: "ter", ter: "ter",
  circle: "cir", cir: "cir",
  highway: "hwy", hwy: "hwy",
  parkway: "pkwy", pkwy: "pkwy",
  square: "sq", sq: "sq",
  trail: "trl", trl: "trl",
  way: "way",
};

/** Canonical short forms for directionals. */
const DIRECTION: Record<string, string> = {
  north: "n", n: "n",
  south: "s", s: "s",
  east: "e", e: "e",
  west: "w", w: "w",
  northeast: "ne", ne: "ne",
  northwest: "nw", nw: "nw",
  southeast: "se", se: "se",
  southwest: "sw", sw: "sw",
};

/** Lowercase, strip punctuation, and canonicalize suffix/directional tokens. */
export function normalizeStreet(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => SUFFIX[token] ?? DIRECTION[token] ?? token)
    .join(" ");
}

/**
 * Extract a normalized street key from a full one-line address:
 * "1601 Pennsylvania Avenue NW, Washington, DC" → "pennsylvania ave nw".
 */
export function streetKeyFromAddress(fullAddress: string): string {
  const street = fullAddress.split(",")[0] ?? "";
  const withoutNumber = street
    .replace(/^\s*\d+[a-z]?\s+/i, "")
    .replace(/\b(?:apt|unit|ste|suite|#)\s*\S*\s*$/i, "");
  return normalizeStreet(withoutNumber);
}

/** Great-circle distance in kilometres (haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * Ray-casting point-in-polygon over a flat list of rings with [lon, lat]
 * vertices. Crossing parity across outer rings and holes together yields the
 * correct result for Polygon and MultiPolygon geometries alike.
 */
export function pointInRings(lat: number, lon: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const crosses =
        yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
  }
  return inside;
}

/** Median of a non-empty list; null for an empty one. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function bucketStats(comps: CompSale[]): BucketStats {
  const prices = comps.map((c) => c.price);
  const perSqft = comps
    .filter((c) => c.sqft !== undefined && c.sqft > 0)
    .map((c) => c.price / (c.sqft as number));
  return {
    count: comps.length,
    median: median(prices),
    min: prices.length > 0 ? Math.min(...prices) : null,
    max: prices.length > 0 ? Math.max(...prices) : null,
    medianPerSqft: median(perSqft),
  };
}

/** Tunables for the classification pass. */
export interface ClassifyOptions {
  /** "Nearby streets" radius around the subject. */
  nearbyKm: number;
  /** Recency window for sales. */
  windowYears: number;
  /** Similarity tolerance: |comp beds − subject beds| ≤ tolerance. */
  bedsTolerance: number;
  bathsTolerance: number;
  /** Injectable clock for tests. */
  now?: Date;
}

/** Defaults: ~0.5 mi nearby radius, 3-year window, ±1 bed/bath. */
export const DEFAULT_CLASSIFY: ClassifyOptions = {
  nearbyKm: 0.8,
  windowYears: 3,
  bedsTolerance: 1,
  bathsTolerance: 1,
};

/** Subject fields the classifier needs. */
export interface ClassifySubject {
  lat: number;
  lon: number;
  streetKey: string;
  beds: number;
  baths: number;
}

/**
 * Filter raw sales to similar + recent, then flag each comp as same-street,
 * nearby (different street within radius), and/or inside the school district
 * polygon. Comps with unknown beds/baths are kept (unknown ≠ dissimilar).
 */
export function classifyComps(
  subject: ClassifySubject,
  raw: CompSale[],
  districtRings: number[][][] | null,
  opts: ClassifyOptions = DEFAULT_CLASSIFY,
): ClassifiedComps {
  const cutoff = new Date(opts.now ?? new Date());
  cutoff.setFullYear(cutoff.getFullYear() - opts.windowYears);

  const kept: CompSale[] = [];
  for (const comp of raw) {
    if (!(comp.price > 0)) continue;
    const soldAt = Date.parse(comp.dateSold);
    if (!Number.isFinite(soldAt) || soldAt < cutoff.getTime()) continue;
    if (comp.beds !== undefined && Math.abs(comp.beds - subject.beds) > opts.bedsTolerance) {
      continue;
    }
    if (
      comp.baths !== undefined &&
      Math.abs(comp.baths - subject.baths) > opts.bathsTolerance
    ) {
      continue;
    }

    const hasPoint = comp.lat !== undefined && comp.lon !== undefined;
    const distanceKm = hasPoint
      ? haversineKm(subject.lat, subject.lon, comp.lat as number, comp.lon as number)
      : undefined;
    const sameStreet =
      subject.streetKey.length > 0 && streetKeyFromAddress(comp.address) === subject.streetKey;
    const nearby = !sameStreet && distanceKm !== undefined && distanceKm <= opts.nearbyKm;
    const inDistrict =
      districtRings !== null &&
      hasPoint &&
      pointInRings(comp.lat as number, comp.lon as number, districtRings);

    kept.push({ ...comp, distanceKm, sameStreet, nearby, inDistrict });
  }

  kept.sort((a, b) => b.dateSold.localeCompare(a.dateSold));
  return {
    comps: kept,
    sameStreet: bucketStats(kept.filter((c) => c.sameStreet)),
    nearby: bucketStats(kept.filter((c) => c.nearby)),
    district: bucketStats(kept.filter((c) => c.inDistrict)),
  };
}
