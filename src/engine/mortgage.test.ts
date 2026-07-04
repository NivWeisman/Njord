/**
 * Unit tests for the amortization engine — the correctness core of the app.
 */
import { describe, expect, it } from "vitest";
import {
  aggregateByYear,
  buildSchedule,
  extraPrincipalFor,
  loanAmount,
  monthlyPayment,
} from "./mortgage";
import type { ExtraPayment, LoanInputs, UsCosts } from "./types";

const NO_US: UsCosts = {
  propertyTaxAnnualPct: 0,
  insuranceAnnual: 0,
  pmiAnnualPct: 0,
  hoaMonthly: 0,
};

/** $100k, 6%, 30 years, no US layer — the classic textbook loan. */
function inputs(overrides: Partial<LoanInputs> = {}): LoanInputs {
  return {
    homePrice: 100_000,
    downPayment: 0,
    annualRatePct: 6,
    termYears: 30,
    extraPayments: [],
    usEnabled: false,
    us: NO_US,
    ...overrides,
  };
}

describe("monthlyPayment", () => {
  it("matches the classic $100k @ 6% / 30yr reference value", () => {
    expect(monthlyPayment(100_000, 6, 360)).toBeCloseTo(599.55, 2);
  });

  it("degrades to principal/term at 0% interest", () => {
    expect(monthlyPayment(12_000, 0, 120)).toBeCloseTo(100, 10);
  });

  it("returns 0 for empty or degenerate loans", () => {
    expect(monthlyPayment(0, 6, 360)).toBe(0);
    expect(monthlyPayment(-5, 6, 360)).toBe(0);
    expect(monthlyPayment(100, 6, 0)).toBe(0);
  });
});

describe("buildSchedule — core amortization", () => {
  it("runs the full term and repays exactly the principal", () => {
    const { rows, summary } = buildSchedule(inputs());
    expect(rows).toHaveLength(360);
    expect(rows[359].balance).toBeCloseTo(0, 6);
    expect(summary.payoffMonth).toBe(360);

    const principalPaid = rows.reduce((sum, r) => sum + r.principal + r.extra, 0);
    expect(principalPaid).toBeCloseTo(100_000, 4);

    // Known lifetime interest for this loan: 360 × $599.55 − $100k ≈ $115,838.
    expect(summary.totalInterest).toBeCloseTo(115_838.19, 0);
  });

  it("has zero interest and equal principal payments at 0%", () => {
    const { rows, summary } = buildSchedule(
      inputs({ homePrice: 12_000, annualRatePct: 0, termYears: 10 }),
    );
    expect(rows).toHaveLength(120);
    expect(summary.totalInterest).toBeCloseTo(0, 10);
    expect(rows[0].principal).toBeCloseTo(100, 10);
  });

  it("produces an empty schedule when the down payment covers the price", () => {
    const { rows, summary } = buildSchedule(inputs({ downPayment: 100_000 }));
    expect(rows).toHaveLength(0);
    expect(summary.monthlyPI).toBe(0);
    expect(summary.payoffMonth).toBe(0);
    expect(summary.monthlyTotalInitial).toBe(0);
  });

  it("satisfies the accounting identity: total paid = interest + principal", () => {
    const { rows, summary } = buildSchedule(inputs());
    const last = rows[rows.length - 1];
    expect(summary.totalPaid).toBeCloseTo(last.cumInterest + last.cumPrincipal, 6);
  });
});

describe("extra payments", () => {
  it("recurring monthly extras shorten the loan and save interest", () => {
    const extra: ExtraPayment = { id: "x", kind: "monthly", amount: 100, startMonth: 1 };
    const { summary } = buildSchedule(inputs({ extraPayments: [extra] }));
    expect(summary.payoffMonth).toBeLessThan(360);
    expect(summary.interestSaved).toBeGreaterThan(0);
    expect(summary.monthsSaved).toBe(360 - summary.payoffMonth);

    // Savings are measured against the identical loan without extras.
    const baseline = buildSchedule(inputs());
    expect(summary.totalInterest + (summary.interestSaved ?? 0)).toBeCloseTo(
      baseline.summary.totalInterest,
      6,
    );
  });

  it("still repays exactly the principal with extras", () => {
    const extra: ExtraPayment = { id: "x", kind: "monthly", amount: 250, startMonth: 12 };
    const { rows } = buildSchedule(inputs({ extraPayments: [extra] }));
    const principalPaid = rows.reduce((sum, r) => sum + r.principal + r.extra, 0);
    expect(principalPaid).toBeCloseTo(100_000, 4);
  });

  it("lands one-time and yearly extras in exactly the right months", () => {
    const extras: ExtraPayment[] = [
      { id: "a", kind: "once", amount: 5_000, startMonth: 24 },
      { id: "b", kind: "yearly", amount: 1_200, startMonth: 6, endMonth: 30 },
    ];
    expect(extraPrincipalFor(24, extras)).toBe(5_000);
    expect(extraPrincipalFor(6, extras)).toBe(1_200);
    expect(extraPrincipalFor(18, extras)).toBe(1_200);
    expect(extraPrincipalFor(30, extras)).toBe(1_200);
    expect(extraPrincipalFor(42, extras)).toBe(0); // past endMonth
    expect(extraPrincipalFor(7, extras)).toBe(0); // yearly, off-cycle month

    const { rows } = buildSchedule(inputs({ extraPayments: extras }));
    expect(rows[23].extra).toBe(5_000);
    expect(rows[5].extra).toBe(1_200);
    expect(rows[6].extra).toBe(0);
  });

  it("clamps a huge one-time extra to the remaining balance", () => {
    const extra: ExtraPayment = { id: "x", kind: "once", amount: 10_000_000, startMonth: 12 };
    const { rows, summary } = buildSchedule(inputs({ extraPayments: [extra] }));
    expect(summary.payoffMonth).toBe(12);
    expect(rows[11].balance).toBe(0);
    const principalPaid = rows.reduce((sum, r) => sum + r.principal + r.extra, 0);
    expect(principalPaid).toBeCloseTo(100_000, 6);
  });
});

describe("US cost layer", () => {
  const us: UsCosts = {
    propertyTaxAnnualPct: 1.2,
    insuranceAnnual: 1_800,
    pmiAnnualPct: 0.6,
    hoaMonthly: 50,
  };

  it("charges PMI on the start-of-month balance until LTV reaches 80%", () => {
    const loan = inputs({
      homePrice: 400_000,
      downPayment: 40_000, // LTV 90% → PMI applies at first
      annualRatePct: 6.5,
      usEnabled: true,
      us,
    });
    const { rows, summary } = buildSchedule(loan);
    const cutoff = 0.8 * 400_000;

    expect(rows[0].pmi).toBeCloseTo((0.006 * 360_000) / 12, 10);
    expect(rows.find((r) => r.pmi === 0)).toBeDefined();
    for (const row of rows) {
      const startBalance = row.month === 1 ? summary.loanAmount : rows[row.month - 2].balance;
      expect(row.pmi > 0).toBe(startBalance > cutoff);
    }
    expect(summary.totalPmi).toBeGreaterThan(0);
  });

  it("charges no PMI at or below 80% LTV from day one", () => {
    const loan = inputs({ homePrice: 400_000, downPayment: 80_000, usEnabled: true, us });
    expect(buildSchedule(loan).summary.totalPmi).toBe(0);
  });

  it("adds constant escrow and HOA to every month's total", () => {
    const loan = inputs({ homePrice: 300_000, downPayment: 60_000, usEnabled: true, us });
    const { rows, summary } = buildSchedule(loan);
    const escrow = (300_000 * 0.012 + 1_800) / 12;
    expect(rows[0].escrow).toBeCloseTo(escrow, 10);
    expect(rows[0].total).toBeCloseTo(
      rows[0].interest + rows[0].principal + rows[0].pmi + escrow + 50,
      10,
    );
    expect(summary.monthlyTotalInitial).toBeCloseTo(
      summary.monthlyPI + rows[0].pmi + escrow + 50,
      10,
    );
  });

  it("ignores the US layer entirely when disabled", () => {
    const loan = inputs({ homePrice: 300_000, usEnabled: false, us });
    const { rows, summary } = buildSchedule(loan);
    expect(rows[0].pmi).toBe(0);
    expect(rows[0].escrow).toBe(0);
    expect(rows[0].hoa).toBe(0);
    expect(summary.totalPmi).toBe(0);
  });
});

describe("aggregateByYear", () => {
  it("splits a 30-year schedule into 30 year rows that conserve totals", () => {
    const { rows, summary } = buildSchedule(inputs());
    const years = aggregateByYear(rows);
    expect(years).toHaveLength(30);
    expect(years[0].year).toBe(1);
    const interest = years.reduce((sum, y) => sum + y.interest, 0);
    expect(interest).toBeCloseTo(summary.totalInterest, 6);
    expect(years[29].balance).toBeCloseTo(0, 6);
  });

  it("handles a partial final year after early payoff", () => {
    const extra: ExtraPayment = { id: "x", kind: "once", amount: 100_000, startMonth: 18 };
    const { rows } = buildSchedule(inputs({ extraPayments: [extra] }));
    const years = aggregateByYear(rows);
    expect(years).toHaveLength(2);
    expect(years[1].balance).toBe(0);
  });
});

describe("loanAmount", () => {
  it("clamps at zero when the down payment exceeds the price", () => {
    expect(loanAmount(inputs({ downPayment: 150_000 }))).toBe(0);
    expect(loanAmount(inputs({ downPayment: 20_000 }))).toBe(80_000);
  });
});
