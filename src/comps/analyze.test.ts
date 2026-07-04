/**
 * Tests for the pure comp-classification logic.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLASSIFY,
  classifyComps,
  haversineKm,
  median,
  normalizeStreet,
  pointInRings,
  streetKeyFromAddress,
} from "./analyze";
import type { CompSale } from "./types";

describe("normalizeStreet / streetKeyFromAddress", () => {
  it("canonicalizes suffixes and directionals", () => {
    expect(normalizeStreet("North Main Street")).toBe("n main st");
    expect(normalizeStreet("PENNSYLVANIA AVENUE NW")).toBe("pennsylvania ave nw");
    expect(normalizeStreet("Ocean  Blvd.")).toBe("ocean blvd");
  });

  it("strips house numbers, units, and city parts from full addresses", () => {
    expect(streetKeyFromAddress("1601 Pennsylvania Avenue NW, Washington, DC")).toBe(
      "pennsylvania ave nw",
    );
    expect(streetKeyFromAddress("123 Main St, Springfield, CA 90210")).toBe("main st");
    expect(streetKeyFromAddress("123B Main Street Apt 4, Springfield")).toBe("main st");
  });

  it("matches the same street across formatting variants", () => {
    const a = streetKeyFromAddress("742 Evergreen Terrace, Springfield");
    const b = streetKeyFromAddress("744 EVERGREEN TER, SPRINGFIELD");
    expect(a).toBe(b);
  });
});

describe("haversineKm", () => {
  it("measures one degree of latitude as ~111 km", () => {
    expect(haversineKm(38, -77, 39, -77)).toBeGreaterThan(110);
    expect(haversineKm(38, -77, 39, -77)).toBeLessThan(112.5);
  });

  it("is zero for identical points", () => {
    expect(haversineKm(38.9, -77.03, 38.9, -77.03)).toBe(0);
  });
});

describe("pointInRings", () => {
  // Unit square with a hole in the middle ([lon, lat] vertices).
  const square: number[][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const hole: number[][] = [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ];

  it("detects inside, outside, and hole correctly", () => {
    expect(pointInRings(2, 2, [square])).toBe(true);
    expect(pointInRings(2, 12, [square])).toBe(false);
    expect(pointInRings(5, 5, [square, hole])).toBe(false); // inside the hole
    expect(pointInRings(3, 5, [square, hole])).toBe(true); // between hole and edge
  });

  it("treats disjoint polygons (MultiPolygon flattened) by parity", () => {
    const far: number[][] = [
      [100, 100],
      [110, 100],
      [110, 110],
      [100, 110],
      [100, 100],
    ];
    expect(pointInRings(105, 105, [square, far])).toBe(true);
    expect(pointInRings(50, 50, [square, far])).toBe(false);
  });
});

describe("median", () => {
  it("handles odd, even, and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("classifyComps", () => {
  const NOW = new Date("2026-07-01T00:00:00Z");
  const subject = {
    lat: 38.9,
    lon: -77.03,
    streetKey: "pennsylvania ave nw",
    beds: 3,
    baths: 2,
  };
  // District polygon: a small box around the subject.
  const district: number[][][] = [
    [
      [-77.05, 38.88],
      [-77.01, 38.88],
      [-77.01, 38.92],
      [-77.05, 38.92],
      [-77.05, 38.88],
    ],
  ];

  const sale = (over: Partial<CompSale>): CompSale => ({
    id: over.id ?? Math.random().toString(36).slice(2),
    address: "1 Somewhere Rd, Washington, DC",
    price: 500_000,
    dateSold: "2025-06-15T00:00:00.000Z",
    sameStreet: false,
    nearby: false,
    inDistrict: false,
    ...over,
  });

  it("assigns street / nearby / district buckets independently", () => {
    const comps = [
      sale({
        id: "street",
        address: "1700 Pennsylvania Ave NW, Washington, DC",
        lat: 38.9001,
        lon: -77.032,
      }),
      sale({
        id: "nearby",
        address: "12 H St NW, Washington, DC",
        lat: 38.903,
        lon: -77.03,
      }),
      sale({
        id: "far-but-district",
        address: "900 K St NW, Washington, DC",
        lat: 38.915,
        lon: -77.02,
      }),
      sale({
        id: "outside-everything",
        address: "1 Elsewhere Ln, Arlington, VA",
        lat: 40,
        lon: -76,
      }),
    ];
    const result = classifyComps(subject, comps, district, {
      ...DEFAULT_CLASSIFY,
      now: NOW,
    });

    const byId = new Map(result.comps.map((c) => [c.id, c]));
    expect(byId.get("street")).toMatchObject({ sameStreet: true, inDistrict: true });
    expect(byId.get("nearby")).toMatchObject({ sameStreet: false, nearby: true, inDistrict: true });
    expect(byId.get("far-but-district")).toMatchObject({ nearby: false, inDistrict: true });
    expect(byId.get("outside-everything")).toMatchObject({
      sameStreet: false,
      nearby: false,
      inDistrict: false,
    });

    expect(result.sameStreet.count).toBe(1);
    expect(result.nearby.count).toBe(1);
    expect(result.district.count).toBe(3);
  });

  it("drops sales older than the window and dissimilar homes", () => {
    const comps = [
      sale({ id: "old", dateSold: "2023-06-01T00:00:00.000Z" }), // > 3 yr before NOW
      sale({ id: "recent", dateSold: "2024-01-01T00:00:00.000Z" }),
      sale({ id: "too-big", beds: 5 }), // beds tolerance ±1 around 3
      sale({ id: "unknown-size" }), // missing beds/baths is kept
      sale({ id: "free", price: 0 }),
    ];
    const result = classifyComps(subject, comps, null, {
      ...DEFAULT_CLASSIFY,
      now: NOW,
    });
    const ids = result.comps.map((c) => c.id);
    expect(ids).toContain("recent");
    expect(ids).toContain("unknown-size");
    expect(ids).not.toContain("old");
    expect(ids).not.toContain("too-big");
    expect(ids).not.toContain("free");
  });

  it("sorts newest-first and computes bucket price stats", () => {
    const comps = [
      sale({
        id: "a",
        address: "10 Pennsylvania Ave NW, DC",
        price: 400_000,
        dateSold: "2024-05-01T00:00:00.000Z",
      }),
      sale({
        id: "b",
        address: "20 Pennsylvania Ave NW, DC",
        price: 600_000,
        dateSold: "2025-05-01T00:00:00.000Z",
        sqft: 2_000,
      }),
      sale({
        id: "c",
        address: "30 Pennsylvania Ave NW, DC",
        price: 500_000,
        dateSold: "2026-05-01T00:00:00.000Z",
      }),
    ];
    const result = classifyComps(subject, comps, null, {
      ...DEFAULT_CLASSIFY,
      now: NOW,
    });
    expect(result.comps.map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(result.sameStreet.count).toBe(3);
    expect(result.sameStreet.median).toBe(500_000);
    expect(result.sameStreet.min).toBe(400_000);
    expect(result.sameStreet.max).toBe(600_000);
    expect(result.sameStreet.medianPerSqft).toBe(300);
  });
});
