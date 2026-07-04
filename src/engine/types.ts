/**
 * Domain types for the mortgage engine.
 *
 * Everything in `src/engine/` is pure data + pure functions: no React, no DOM,
 * no persistence. That keeps the money math independently unit-testable.
 */

/** How an extra principal payment repeats. */
export type ExtraKind = "once" | "monthly" | "yearly";

/** An extra principal payment on top of the scheduled P&I payment. */
export interface ExtraPayment {
  /** Stable id so list edits don't reshuffle React state. */
  id: string;
  kind: ExtraKind;
  /** Dollars of extra principal per occurrence. */
  amount: number;
  /** 1-based loan month of the first (or only) occurrence. */
  startMonth: number;
  /** Optional 1-based last month for recurring kinds; omitted = until payoff. */
  endMonth?: number;
}

/** US-specific carrying costs layered on top of the core loan. */
export interface UsCosts {
  /** Property tax, percent of the home price per year (e.g. 1.1). */
  propertyTaxAnnualPct: number;
  /** Homeowners insurance, dollars per year. */
  insuranceAnnual: number;
  /**
   * Private mortgage insurance, percent of the original loan amount per year.
   * Charged only while the loan-to-value ratio is above 80% (see engine).
   */
  pmiAnnualPct: number;
  /** Homeowners-association dues, dollars per month. */
  hoaMonthly: number;
}

/** Complete input set for one mortgage scenario. */
export interface LoanInputs {
  /** Purchase price of the home, dollars. */
  homePrice: number;
  /** Down payment, dollars. Loan amount = homePrice − downPayment. */
  downPayment: number;
  /** Nominal annual interest rate, percent (e.g. 6.5). */
  annualRatePct: number;
  /** Loan term in years. */
  termYears: number;
  /** Extra principal payments. */
  extraPayments: ExtraPayment[];
  /** Whether the US cost layer participates in the schedule. */
  usEnabled: boolean;
  /** US cost values (kept even while disabled so toggling is lossless). */
  us: UsCosts;
}

/** One month of the amortization schedule. Dollar values are unrounded. */
export interface ScheduleRow {
  /** 1-based month number. */
  month: number;
  /** Interest accrued this month. */
  interest: number;
  /** Scheduled principal paid this month (payment minus interest, clamped). */
  principal: number;
  /** Extra principal paid this month. */
  extra: number;
  /** PMI charged this month (0 once LTV reaches 80%, or without the US layer). */
  pmi: number;
  /** Escrow (property tax + insurance) charged this month. */
  escrow: number;
  /** HOA dues charged this month. */
  hoa: number;
  /** Remaining balance after this month's payments. */
  balance: number;
  /** Total cash out the door this month. */
  total: number;
  /** Running interest total, inclusive of this month. */
  cumInterest: number;
  /** Running principal total (scheduled + extra), inclusive of this month. */
  cumPrincipal: number;
}

/** Headline numbers derived from a schedule. */
export interface LoanSummary {
  loanAmount: number;
  /** Fixed monthly principal-and-interest payment. */
  monthlyPI: number;
  /** First-month required outflow: P&I + PMI + escrow + HOA (extras excluded). */
  monthlyTotalInitial: number;
  /** Months until the balance hits zero (< term when extras accelerate payoff). */
  payoffMonth: number;
  totalInterest: number;
  totalPmi: number;
  /** Lifetime cash out the door: P&I + extras + PMI + escrow + HOA. */
  totalPaid: number;
  /** Present only when extras exist: interest delta vs. the same loan without. */
  interestSaved?: number;
  /** Present only when extras exist: term delta vs. the same loan without. */
  monthsSaved?: number;
}

/** A computed schedule plus its summary. */
export interface ScheduleResult {
  rows: ScheduleRow[];
  summary: LoanSummary;
}

/** One row of the year-level rollup of a schedule. */
export interface YearRow {
  /** 1-based loan year. */
  year: number;
  interest: number;
  principal: number;
  extra: number;
  pmi: number;
  /** Balance at the end of the year (or at payoff). */
  balance: number;
}
