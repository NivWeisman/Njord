/**
 * Tests for the RapidAPI Zillow provider's URL builder and normalizer.
 */
import { describe, expect, it } from "vitest";
import { buildSearchUrl, normalizeZillowResponse } from "./zillow";

describe("buildSearchUrl", () => {
  it("targets recently-sold houses in the ZIP with similarity hints", () => {
    const url = new URL(buildSearchUrl("20500", 2, { beds: 3, baths: 2 }));
    expect(url.hostname).toBe("zillow-com1.p.rapidapi.com");
    expect(url.searchParams.get("location")).toBe("20500");
    expect(url.searchParams.get("status_type")).toBe("RecentlySold");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("bedsMin")).toBe("2");
    expect(url.searchParams.get("bedsMax")).toBe("4");
    expect(url.searchParams.get("bathsMin")).toBe("1");
    expect(url.searchParams.get("bathsMax")).toBe("3");
  });

  it("omits similarity hints when no filters are given (400 retry path)", () => {
    const url = new URL(buildSearchUrl("20500", 1));
    expect(url.searchParams.get("bedsMin")).toBeNull();
    expect(url.searchParams.get("bathsMax")).toBeNull();
  });
});

describe("normalizeZillowResponse", () => {
  const SOLD_MS = Date.UTC(2025, 2, 14); // 2025-03-14

  it("normalizes well-formed entries and drops junk", () => {
    const { comps, totalPages } = normalizeZillowResponse({
      totalPages: 3,
      props: [
        {
          zpid: 12345,
          address: "1700 Pennsylvania Ave NW, Washington, DC 20006",
          price: 750_000,
          dateSold: SOLD_MS,
          bedrooms: 3,
          bathrooms: 2.5,
          livingArea: 1800,
          latitude: 38.899,
          longitude: -77.038,
        },
        { address: "No price St", dateSold: SOLD_MS }, // no price → dropped
        { address: "Free House Rd", price: 0, dateSold: SOLD_MS }, // zero → dropped
        { price: 500_000, dateSold: SOLD_MS }, // no address → dropped
        { address: "1 No Date Ct", price: 400_000 }, // no dateSold → dropped
        "garbage",
        null,
      ],
    });

    expect(totalPages).toBe(3);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toMatchObject({
      id: "12345",
      address: "1700 Pennsylvania Ave NW, Washington, DC 20006",
      price: 750_000,
      beds: 3,
      baths: 2.5,
      sqft: 1800,
      lat: 38.899,
      lon: -77.038,
    });
    expect(comps[0].dateSold).toBe(new Date(SOLD_MS).toISOString());
  });

  it("survives a completely malformed payload", () => {
    expect(normalizeZillowResponse(null)).toEqual({ comps: [], totalPages: 1 });
    expect(normalizeZillowResponse("nope")).toEqual({ comps: [], totalPages: 1 });
    expect(normalizeZillowResponse({ props: "nope" })).toEqual({ comps: [], totalPages: 1 });
  });

  it("synthesizes an id when zpid is missing", () => {
    const { comps } = normalizeZillowResponse({
      props: [{ address: "9 Id-less Way", price: 300_000, dateSold: SOLD_MS }],
    });
    expect(comps[0].id).toContain("9 Id-less Way");
  });
});
