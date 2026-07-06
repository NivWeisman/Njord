/**
 * Tests for the "Realty in US" provider's request body and normalizer.
 */
import { describe, expect, it } from "vitest";
import { buildSearchBody, normalizeRealtorResponse } from "./realtor";

describe("buildSearchBody", () => {
  const NOW = new Date("2026-07-06T12:00:00Z");

  it("targets sold homes in the ZIP within the 3-year window", () => {
    const body = buildSearchBody("20500", 0, { beds: 3, baths: 2 }, NOW);
    expect(body.postal_code).toBe("20500");
    expect(body.status).toEqual(["sold"]);
    expect(body.sold_date).toEqual({ min: "2023-07-06" });
    expect(body.limit).toBe(42);
    expect(body.offset).toBe(0);
    expect(body.beds).toEqual({ min: 2, max: 4 });
    expect(body.baths).toEqual({ min: 1, max: 3 });
  });

  it("widens fractional baths to whole-number bounds", () => {
    const body = buildSearchBody("20500", 42, { beds: 3, baths: 2.5 }, NOW);
    expect(body.offset).toBe(42);
    expect(body.baths).toEqual({ min: 1, max: 4 });
  });

  it("omits similarity hints when no filters are given (400 retry path)", () => {
    const body = buildSearchBody("20500", 0, undefined, NOW);
    expect(body.beds).toBeUndefined();
    expect(body.baths).toBeUndefined();
    expect(body.status).toEqual(["sold"]);
  });
});

describe("normalizeRealtorResponse", () => {
  const wellFormed = {
    data: {
      home_search: {
        total: 137,
        results: [
          {
            property_id: "M1234567890",
            description: {
              beds: 3,
              baths: 2,
              sqft: 1750,
              sold_price: 842_000,
              sold_date: "2026-03-02",
            },
            location: {
              address: {
                line: "1712 Pennsylvania Ave NW",
                city: "Washington",
                state_code: "DC",
                postal_code: "20006",
                coordinate: { lat: 38.8992, lon: -77.039 },
              },
            },
          },
          {
            // Legacy field variants: last_sold_* and baths_consolidated.
            property_id: "M0987654321",
            last_sold_price: 688_000,
            last_sold_date: "2024-09-30",
            description: { beds: 2, baths_consolidated: "1.5", sqft: 1320 },
            location: {
              address: { line: "912 F St NW", city: "Washington", state_code: "DC" },
            },
          },
          { description: { sold_price: 500_000, sold_date: "2025-01-01" } }, // no address
          {
            description: { sold_price: 0, sold_date: "2025-01-01" },
            location: { address: { line: "1 Free House Rd" } },
          }, // zero price
          {
            description: { sold_price: 400_000 },
            location: { address: { line: "1 No Date Ct" } },
          }, // no sold date
          {
            description: { sold_price: 400_000, sold_date: "not-a-date" },
            location: { address: { line: "1 Bad Date Ct" } },
          },
          "garbage",
          null,
        ],
      },
    },
  };

  it("normalizes both field variants and drops junk", () => {
    const { comps, total } = normalizeRealtorResponse(wellFormed);
    expect(total).toBe(137);
    expect(comps).toHaveLength(2);

    expect(comps[0]).toMatchObject({
      id: "M1234567890",
      address: "1712 Pennsylvania Ave NW, Washington, DC",
      price: 842_000,
      beds: 3,
      baths: 2,
      sqft: 1750,
      lat: 38.8992,
      lon: -77.039,
    });
    expect(comps[0].dateSold).toBe(new Date(Date.parse("2026-03-02")).toISOString());

    expect(comps[1]).toMatchObject({
      id: "M0987654321",
      address: "912 F St NW, Washington, DC",
      price: 688_000,
      baths: 1.5,
    });
  });

  it("survives malformed payloads", () => {
    expect(normalizeRealtorResponse(null)).toEqual({ comps: [], total: 0 });
    expect(normalizeRealtorResponse("nope")).toEqual({ comps: [], total: 0 });
    expect(normalizeRealtorResponse({ data: { home_search: { results: "x" } } })).toEqual({
      comps: [],
      total: 0,
    });
  });

  it("synthesizes an id when property_id is missing", () => {
    const { comps } = normalizeRealtorResponse({
      data: {
        home_search: {
          results: [
            {
              description: { sold_price: 300_000, sold_date: "2025-06-01" },
              location: { address: { line: "9 Id-less Way", city: "Springfield" } },
            },
          ],
        },
      },
    });
    expect(comps[0].id).toContain("9 Id-less Way");
  });
});
