/**
 * Parser tests for the Census geocoder and TIGERweb responses, using
 * fixtures shaped like real captures (1600 Pennsylvania Ave NW).
 */
import { describe, expect, it } from "vitest";
import { parseDistrictResponse, parseGeocodeResponse } from "./geocode";

const GEOCODE_FIXTURE = {
  result: {
    addressMatches: [
      {
        matchedAddress: "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500",
        coordinates: { x: -77.03518753691, y: 38.89869893252 },
        addressComponents: {
          preDirection: "",
          streetName: "PENNSYLVANIA",
          suffixType: "AVE",
          suffixDirection: "NW",
          zip: "20500",
        },
        geographies: {
          "Unified School Districts": [
            { GEOID: "1100030", NAME: "District of Columbia Public Schools" },
          ],
          "Census Tracts": [{ GEOID: "11001980000" }],
        },
      },
    ],
  },
};

describe("parseGeocodeResponse", () => {
  it("extracts coordinates, street key, zip, and the unified district", () => {
    const subject = parseGeocodeResponse(GEOCODE_FIXTURE);
    expect(subject).not.toBeNull();
    expect(subject!.matchedAddress).toBe("1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500");
    expect(subject!.lat).toBeCloseTo(38.8987, 3);
    expect(subject!.lon).toBeCloseTo(-77.0352, 3);
    expect(subject!.streetKey).toBe("pennsylvania ave nw");
    expect(subject!.zip).toBe("20500");
    expect(subject!.district).toEqual({
      geoid: "1100030",
      name: "District of Columbia Public Schools",
      layer: 0,
    });
  });

  it("falls back to elementary districts when no unified exists", () => {
    const fixture = structuredClone(GEOCODE_FIXTURE);
    fixture.result.addressMatches[0].geographies = {
      "Elementary School Districts": [{ GEOID: "0612345", NAME: "Some Elementary SD" }],
    } as never;
    const subject = parseGeocodeResponse(fixture);
    expect(subject!.district).toMatchObject({ geoid: "0612345", layer: 2 });
  });

  it("returns a subject without a district when geographies are absent", () => {
    const fixture = structuredClone(GEOCODE_FIXTURE);
    delete (fixture.result.addressMatches[0] as { geographies?: unknown }).geographies;
    const subject = parseGeocodeResponse(fixture);
    expect(subject).not.toBeNull();
    expect(subject!.district).toBeUndefined();
  });

  it("returns null for no-match and malformed payloads", () => {
    expect(parseGeocodeResponse({ result: { addressMatches: [] } })).toBeNull();
    expect(parseGeocodeResponse({})).toBeNull();
    expect(parseGeocodeResponse(null)).toBeNull();
    expect(parseGeocodeResponse("nope")).toBeNull();
  });
});

describe("parseDistrictResponse", () => {
  it("returns Polygon rings as-is", () => {
    const rings = parseDistrictResponse({
      features: [
        {
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-77.1, 38.9],
                [-77.0, 38.9],
                [-77.0, 39.0],
                [-77.1, 38.9],
              ],
            ],
          },
        },
      ],
    });
    expect(rings).toHaveLength(1);
    expect(rings![0][0]).toEqual([-77.1, 38.9]);
  });

  it("flattens MultiPolygon coordinates one level", () => {
    const rings = parseDistrictResponse({
      features: [
        {
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[0, 0], [1, 0], [1, 1], [0, 0]]],
              [[[5, 5], [6, 5], [6, 6], [5, 5]]],
            ],
          },
        },
      ],
    });
    expect(rings).toHaveLength(2);
  });

  it("accepts the Esri-JSON rings shape", () => {
    const rings = parseDistrictResponse({
      features: [{ geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }],
    });
    expect(rings).toHaveLength(1);
  });

  it("returns null when features are missing or empty", () => {
    expect(parseDistrictResponse({ features: [] })).toBeNull();
    expect(parseDistrictResponse({})).toBeNull();
    expect(parseDistrictResponse(null)).toBeNull();
  });
});
