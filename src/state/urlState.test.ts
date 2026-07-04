/**
 * Tests for the URL codec and the sanitize gate it feeds decoded payloads to.
 */
import { describe, expect, it } from "vitest";
import { decodeState, encodeState, fromBase64Url, toBase64Url } from "./urlState";
import { defaultState } from "./defaults";
import { MAX_SCENARIOS, sanitizeState } from "./model";

describe("base64url codec", () => {
  it("round-trips non-ASCII text (Hebrew scenario names)", () => {
    const text = "תמהיל · 30 שנה · פריים";
    expect(fromBase64Url(toBase64Url(text))).toBe(text);
  });

  it("emits only URL-safe characters", () => {
    const encoded = toBase64Url("any ~ text ° with ¿ bytes ÿ");
    expect(/^[A-Za-z0-9_-]+$/.test(encoded)).toBe(true);
  });

  it("returns null on malformed input instead of throwing", () => {
    expect(fromBase64Url("%%%not-base64%%%")).toBeNull();
  });
});

describe("plan state codec", () => {
  it("round-trips a full plan exactly", () => {
    const state = defaultState();
    state.scenarios[0].name = "תמהיל בדיקה";
    state.scenarios[0].inputs.extraPayments.push({
      id: "e1",
      kind: "yearly",
      amount: 2_500,
      startMonth: 13,
      endMonth: 120,
    });
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it("rejects garbage and valid-base64 non-plans", () => {
    expect(decodeState("!!!")).toBeNull();
    expect(decodeState(toBase64Url("\"hello\""))).toBeNull();
    expect(decodeState(toBase64Url("{not json"))).toBeNull();
  });
});

describe("sanitizeState", () => {
  it("rejects wrong versions, empty plans, and non-objects", () => {
    expect(sanitizeState(null)).toBeNull();
    expect(sanitizeState("plan")).toBeNull();
    expect(sanitizeState({ v: 2, scenarios: [] })).toBeNull();
    expect(sanitizeState({ v: 1, scenarios: [] })).toBeNull();
    expect(sanitizeState({ v: 1, scenarios: "nope" })).toBeNull();
  });

  it("repairs hostile payloads instead of crashing", () => {
    const state = sanitizeState({
      v: 1,
      activeId: "missing",
      scenarios: [
        {
          id: 42,
          name: "",
          colorSlot: 99,
          inputs: {
            homePrice: "1e500",
            annualRatePct: -3,
            termYears: 900,
            extraPayments: [
              { kind: "weekly", amount: 100 },
              { kind: "once", amount: 1_000, startMonth: 5 },
            ],
          },
        },
      ],
    });
    expect(state).not.toBeNull();
    const scenario = state!.scenarios[0];
    expect(scenario.colorSlot).toBe(0); // out-of-range slot → first free slot
    expect(scenario.name).toBe("Scenario 1");
    expect(state!.activeId).toBe(scenario.id);
    expect(scenario.inputs.homePrice).toBe(400_000); // non-number → default
    expect(scenario.inputs.annualRatePct).toBe(0); // negative → clamped
    expect(scenario.inputs.termYears).toBe(40); // over cap → clamped
    expect(scenario.inputs.extraPayments).toHaveLength(1); // bad kind dropped
    expect(scenario.inputs.extraPayments[0].amount).toBe(1_000);
  });

  it("deduplicates color slots and ids, and caps the scenario count", () => {
    const scenario = (id: string, slot: number) => ({
      id,
      name: id,
      colorSlot: slot,
      inputs: {},
    });
    const state = sanitizeState({
      v: 1,
      activeId: "b",
      scenarios: [
        scenario("a", 2),
        scenario("b", 2),
        scenario("a", 1),
        scenario("d", 0),
        scenario("e", 3),
      ],
    });
    expect(state).not.toBeNull();
    expect(state!.scenarios).toHaveLength(MAX_SCENARIOS);
    const slots = state!.scenarios.map((s) => s.colorSlot).sort();
    expect(slots).toEqual([0, 1, 2, 3]); // all distinct after repair
    const ids = new Set(state!.scenarios.map((s) => s.id));
    expect(ids.size).toBe(MAX_SCENARIOS);
    expect(state!.activeId).toBe("b");
  });

  it("clamps the down payment to the home price", () => {
    const state = sanitizeState({
      v: 1,
      activeId: "a",
      scenarios: [
        { id: "a", name: "A", colorSlot: 0, inputs: { homePrice: 200_000, downPayment: 999_999 } },
      ],
    });
    expect(state!.scenarios[0].inputs.downPayment).toBe(200_000);
  });
});
