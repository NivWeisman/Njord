/**
 * The amortization engine: fixed-rate loan math plus the optional US cost
 * layer (property tax + insurance escrow, PMI with the 80%-LTV drop, HOA).
 *
 * Pure functions over `LoanInputs`. No rounding happens here — values carry
 * full float precision and the UI rounds only for display.
 */

import type {
  ExtraPayment,
  LoanInputs,
  LoanSummary,
  ScheduleResult,
  ScheduleRow,
  YearRow,
} from "./types";

/** Balances below half a cent are treated as paid off (float-dust guard). */
const PAID_OFF_EPSILON = 0.005;

/** Convert a nominal annual percentage rate to a monthly fractional rate. */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

/** Loan principal implied by the inputs (never negative). */
export function loanAmount(inputs: LoanInputs): number {
  return Math.max(0, inputs.homePrice - inputs.downPayment);
}

/**
 * Fixed monthly principal-and-interest payment for a fully amortizing loan:
 * `P·r·(1+r)^n / ((1+r)^n − 1)`, with the zero-rate limit `P/n`.
 */
export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  termMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r <= 0) return principal / termMonths;
  const growth = Math.pow(1 + r, termMonths);
  return (principal * r * growth) / (growth - 1);
}

/** Total extra principal due in a given 1-based month. */
export function extraPrincipalFor(month: number, extras: ExtraPayment[]): number {
  let total = 0;
  for (const extra of extras) {
    if (!(extra.amount > 0)) continue;
    const start = Math.max(1, Math.round(extra.startMonth) || 1);
    const end =
      extra.endMonth === undefined
        ? Number.POSITIVE_INFINITY
        : Math.round(extra.endMonth);
    switch (extra.kind) {
      case "once":
        if (month === start) total += extra.amount;
        break;
      case "monthly":
        if (month >= start && month <= end) total += extra.amount;
        break;
      case "yearly":
        if (month >= start && month <= end && (month - start) % 12 === 0) {
          total += extra.amount;
        }
        break;
    }
  }
  return total;
}

/**
 * Build the full month-by-month schedule and its summary.
 *
 * US-layer conventions (deliberate simplifications, documented in README):
 * - Escrow = (homePrice · taxPct + insuranceAnnual) / 12, constant for the
 *   life of the loan (no reassessment or premium changes).
 * - PMI = pmiAnnualPct · originalLoan / 12, charged while the start-of-month
 *   balance is above 80% of the purchase price, then dropped automatically.
 */
export function buildSchedule(inputs: LoanInputs): ScheduleResult {
  const principal0 = loanAmount(inputs);
  const termMonths = Math.max(1, Math.round(inputs.termYears * 12));
  const payment = monthlyPayment(principal0, inputs.annualRatePct, termMonths);
  const r = monthlyRate(inputs.annualRatePct);

  const us = inputs.usEnabled ? inputs.us : undefined;
  const escrow = us
    ? ((inputs.homePrice * us.propertyTaxAnnualPct) / 100 + us.insuranceAnnual) / 12
    : 0;
  const hoa = us ? us.hoaMonthly : 0;
  const pmiMonthly = us ? ((us.pmiAnnualPct / 100) * principal0) / 12 : 0;
  const pmiCutoff = 0.8 * inputs.homePrice;

  const rows: ScheduleRow[] = [];
  let balance = principal0;
  let cumInterest = 0;
  let cumPrincipal = 0;
  let totalPmi = 0;
  let totalPaid = 0;

  for (let month = 1; month <= termMonths && balance > PAID_OFF_EPSILON; month++) {
    const interest = balance * r;
    const scheduled = Math.min(Math.max(payment - interest, 0), balance);
    const extra = Math.min(
      extraPrincipalFor(month, inputs.extraPayments),
      balance - scheduled,
    );
    // PMI is decided on the start-of-month balance, before this payment lands.
    const pmi = pmiMonthly > 0 && balance > pmiCutoff ? pmiMonthly : 0;

    balance = Math.max(0, balance - scheduled - extra);
    cumInterest += interest;
    cumPrincipal += scheduled + extra;
    totalPmi += pmi;

    const total = interest + scheduled + extra + pmi + escrow + hoa;
    totalPaid += total;
    rows.push({
      month,
      interest,
      principal: scheduled,
      extra,
      pmi,
      escrow,
      hoa,
      balance,
      total,
      cumInterest,
      cumPrincipal,
    });
  }

  const summary: LoanSummary = {
    loanAmount: principal0,
    monthlyPI: payment,
    monthlyTotalInitial: rows.length > 0 ? payment + rows[0].pmi + escrow + hoa : 0,
    payoffMonth: rows.length,
    totalInterest: cumInterest,
    totalPmi,
    totalPaid,
  };

  // Extras present → also compute the no-extras baseline for the savings
  // headline. The recursion is depth-1: the baseline itself has no extras.
  if (rows.some((row) => row.extra > 0)) {
    const baseline = buildSchedule({ ...inputs, extraPayments: [] });
    summary.interestSaved = baseline.summary.totalInterest - cumInterest;
    summary.monthsSaved = baseline.summary.payoffMonth - rows.length;
  }

  return { rows, summary };
}

/** Roll a monthly schedule up to loan years (for the compact table view). */
export function aggregateByYear(rows: ScheduleRow[]): YearRow[] {
  const years: YearRow[] = [];
  for (const row of rows) {
    const yearIndex = Math.ceil(row.month / 12);
    let year = years[years.length - 1];
    if (!year || year.year !== yearIndex) {
      year = { year: yearIndex, interest: 0, principal: 0, extra: 0, pmi: 0, balance: row.balance };
      years.push(year);
    }
    year.interest += row.interest;
    year.principal += row.principal;
    year.extra += row.extra;
    year.pmi += row.pmi;
    year.balance = row.balance;
  }
  return years;
}
