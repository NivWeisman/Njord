/**
 * KPI row of stat tiles for the active scenario. Labels are sentence case,
 * values use proportional figures (no tabular-nums at display size), and the
 * extra-payment savings tile carries the one "good direction" accent.
 */

import type { LoanSummary } from "../engine/types";
import { fmtMonthsAsTerm, fmtUsd, fmtUsd2 } from "../format";

interface Tile {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
}

/** Headline numbers above the charts. */
export function SummaryCards({
  summary,
  usEnabled,
}: {
  summary: LoanSummary;
  usEnabled: boolean;
}) {
  const tiles: Tile[] = [
    { label: "Monthly P&I", value: fmtUsd2(summary.monthlyPI) },
  ];
  if (usEnabled) {
    tiles.push({
      label: "Initial monthly total",
      value: fmtUsd2(summary.monthlyTotalInitial),
      sub: "P&I + PMI + escrow + HOA",
    });
  }
  tiles.push(
    { label: "Loan amount", value: fmtUsd(summary.loanAmount) },
    { label: "Total interest", value: fmtUsd(summary.totalInterest) },
    { label: "Payoff", value: summary.payoffMonth > 0 ? fmtMonthsAsTerm(summary.payoffMonth) : "—" },
  );
  if (summary.totalPmi > 0) {
    tiles.push({ label: "Total PMI", value: fmtUsd(summary.totalPmi) });
  }
  if (summary.interestSaved !== undefined && summary.monthsSaved !== undefined) {
    tiles.push({
      label: "Extra payments save",
      value: fmtUsd(summary.interestSaved),
      sub: `${fmtMonthsAsTerm(summary.monthsSaved)} off the term`,
      good: true,
    });
  }

  return (
    <div className="kpis">
      {tiles.map((tile) => (
        <div className="kpi" key={tile.label}>
          <div className="kpi-label">{tile.label}</div>
          <div className="kpi-value">{tile.value}</div>
          {tile.sub ? <div className={tile.good ? "kpi-sub good" : "kpi-sub"}>{tile.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}
