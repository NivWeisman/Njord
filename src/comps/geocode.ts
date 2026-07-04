/**
 * Free government geo services for the comps pipeline:
 *
 * - US Census geocoder (address → coordinates, street components, ZIP, and
 *   school-district GEOID). The service sends no CORS headers but supports
 *   JSONP, its documented browser mode — so the request rides a script tag.
 * - TIGERweb ArcGIS REST (district GEOID → boundary polygon, CORS-enabled).
 *
 * Response parsing is split into pure functions so tests can feed fixtures.
 */

import { normalizeStreet } from "./analyze";
import { CompsError } from "./types";
import type { SubjectProperty } from "./types";

const GEOCODER_BASE =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const TIGERWEB_BASE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/School/MapServer";

/** Geography keys in preference order, with their TIGERweb layer ids. */
const DISTRICT_SOURCES: ReadonlyArray<{ key: string; layer: number }> = [
  { key: "Unified School Districts", layer: 0 },
  { key: "Elementary School Districts", layer: 2 },
  { key: "Secondary School Districts", layer: 1 },
];

/** Parse a Census geocoder `geographies/onelineaddress` response. */
export function parseGeocodeResponse(raw: unknown): SubjectProperty | null {
  const result = (raw as { result?: { addressMatches?: unknown[] } })?.result;
  const match = result?.addressMatches?.[0] as
    | {
        matchedAddress?: string;
        coordinates?: { x?: number; y?: number };
        addressComponents?: Record<string, string>;
        geographies?: Record<string, Array<Record<string, unknown>>>;
      }
    | undefined;
  if (!match || typeof match.matchedAddress !== "string") return null;

  const lon = match.coordinates?.x;
  const lat = match.coordinates?.y;
  if (typeof lat !== "number" || typeof lon !== "number") return null;

  const components = match.addressComponents ?? {};
  const streetKey = normalizeStreet(
    [
      components.preDirection,
      components.streetName,
      components.suffixType,
      components.suffixDirection,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const zip = components.zip ?? "";

  const subject: SubjectProperty = {
    matchedAddress: match.matchedAddress,
    lat,
    lon,
    streetKey,
    zip,
  };

  for (const source of DISTRICT_SOURCES) {
    const feature = match.geographies?.[source.key]?.[0];
    const geoid = feature?.GEOID;
    const name = feature?.NAME;
    if (typeof geoid === "string" && typeof name === "string") {
      subject.district = { geoid, name, layer: source.layer };
      break;
    }
  }
  return subject;
}

/** JSONP transport for the geocoder (script tag + named global callback). */
function jsonp(url: string, timeoutMs = 15_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const name = `njordGeocode${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const globals = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new CompsError("geocode", "The Census geocoder timed out — try again."));
    }, timeoutMs);
    const cleanup = () => {
      delete globals[name];
      script.remove();
      window.clearTimeout(timer);
    };
    globals[name] = (data: unknown) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new CompsError("geocode", "The Census geocoder request failed."));
    };
    script.src = `${url}&format=jsonp&callback=${name}`;
    document.head.append(script);
  });
}

/** Geocode a one-line US street address. Throws CompsError when unmatched. */
export async function geocodeAddress(address: string): Promise<SubjectProperty> {
  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "all",
  });
  const raw = await jsonp(`${GEOCODER_BASE}?${params}`);
  const subject = parseGeocodeResponse(raw);
  if (subject === null) {
    throw new CompsError(
      "geocode",
      "Address not found — check the spelling (US street addresses only).",
    );
  }
  if (subject.zip === "") {
    throw new CompsError("geocode", "The geocoder returned no ZIP for this address.");
  }
  return subject;
}

/**
 * Parse a TIGERweb polygon query response (GeoJSON, with a defensive branch
 * for the Esri-JSON `rings` shape) into a flat list of [lon, lat] rings.
 */
export function parseDistrictResponse(raw: unknown): number[][][] | null {
  const features = (raw as { features?: unknown[] })?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const geometry = (features[0] as { geometry?: Record<string, unknown> })?.geometry;
  if (!geometry) return null;

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as number[][][];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as number[][][][]).flat();
  }
  if (Array.isArray(geometry.rings)) {
    return geometry.rings as number[][][];
  }
  return null;
}

/** Fetch a school district's boundary rings from TIGERweb. */
export async function fetchDistrictPolygon(
  geoid: string,
  layer: number,
  signal?: AbortSignal,
): Promise<number[][][]> {
  const params = new URLSearchParams({
    where: `GEOID='${geoid.replace(/[^0-9A-Za-z]/g, "")}'`,
    outFields: "GEOID,NAME",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  const response = await fetch(`${TIGERWEB_BASE}/${layer}/query?${params}`, { signal });
  if (!response.ok) {
    throw new CompsError("district", `TIGERweb returned HTTP ${response.status}.`);
  }
  const rings = parseDistrictResponse((await response.json()) as unknown);
  if (rings === null) {
    throw new CompsError("district", "TIGERweb returned no boundary for the district.");
  }
  return rings;
}
