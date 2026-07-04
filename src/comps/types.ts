/**
 * Domain types for the comparable-sales ("comps") feature: subject property,
 * normalized sale records, bucket statistics, and the typed error carried
 * across the geocode → district → search pipeline.
 */

/** Which pipeline stage produced an error (drives the user-facing message). */
export type CompsStage = "geocode" | "district" | "search";

/** Typed failure with the stage attached so the UI can explain what broke. */
export class CompsError extends Error {
  constructor(
    public readonly stage: CompsStage,
    message: string,
  ) {
    super(message);
    this.name = "CompsError";
  }
}

/** The user's property after geocoding. */
export interface SubjectProperty {
  /** Canonical address returned by the geocoder. */
  matchedAddress: string;
  lat: number;
  lon: number;
  /** Normalized street key (see analyze.ts) for same-street matching. */
  streetKey: string;
  /** ZIP used as the sold-comps search area. */
  zip: string;
  /** School district containing the address, when the geocoder knows it. */
  district?: {
    geoid: string;
    name: string;
    /** TIGERweb layer id: 0 unified, 1 secondary, 2 elementary. */
    layer: number;
  };
}

/** One normalized recent sale. Classification flags are filled by analyze. */
export interface CompSale {
  id: string;
  address: string;
  /** Sold price, dollars. */
  price: number;
  /** ISO-8601 sale date. */
  dateSold: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  lat?: number;
  lon?: number;
  /** Great-circle distance from the subject, when coordinates exist. */
  distanceKm?: number;
  sameStreet: boolean;
  nearby: boolean;
  inDistrict: boolean;
}

/** Summary statistics for one comp bucket. Nulls when the bucket is empty. */
export interface BucketStats {
  count: number;
  median: number | null;
  min: number | null;
  max: number | null;
  medianPerSqft: number | null;
}

/** Full classification output for a comps run. */
export interface ClassifiedComps {
  comps: CompSale[];
  sameStreet: BucketStats;
  nearby: BucketStats;
  district: BucketStats;
}
