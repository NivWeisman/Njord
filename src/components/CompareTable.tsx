/**
 * Side-by-side scenario metrics. The best (lowest) value in each cost/term
 * row is bolded; identity is carried by each column's palette dot beside an
 * ink-colored name — numbers never wear a series color.
 */

import { seriesColor } from "../charts/chartUtils";
import type { LoanSummary, ScheduleResult } from "../engine/types";
import { fmtMonthsAsTerm, fmtUsd, fmtUsd2 } from "../format";
import type { Scenario } from "../state/model";

interface Props {
  scenarios: Scenario[];
  schedules: Map<string, ScheduleResult>;
}

interface MetricRow {
  label: string;
  fmt: (value: number) => string;
  get: (summary: LoanSummary) => number;
  /** Bold the lowest value in the row (when values actually differ). */
  markBest: boolean;
}

const METRICS: MetricRow[] = [
  { label: "Loan amount", fmt: fmtUsd, get: (s) => s.loanAmount, markBest: false },
  { label: "Monthly P&I", fmt: fmtUsd2, get: (s) => s.monthlyPI, markBest: true },
  { label: "Initial monthly total", fmt: fmtUsd2, get: (s) => s.monthlyTotalInitial, markBest: true },
  { label: "Payoff", fmt: fmtMonthsAsTerm, get: (s) => s.payoffMonth, markBest: true },
  { label: "Total interest", fmt: fmtUsd, get: (s) => s.totalInterest, markBest: true },
  { label: "Total PMI", fmt: fmtUsd, get: (s) => s.totalPmi, markBest: true },
  { label: "Total paid", fmt: fmtUsd, get: (s) => s.totalPaid, markBest: true },
];

/** Metric-by-scenario comparison grid (rendered only for 2+ scenarios). */
export function CompareTable({ scenarios, schedules }: Props) {
  const columns = scenarios.flatMap((scenario) => {
    const schedule = schedules.get(scenario.id);
    return schedule ? [{ scenario, summary: schedule.summary }] : [];
  });
  if (columns.length < 2) return null;

  const anyPmi = columns.some((c) => c.summary.totalPmi > 0);
  const metrics = METRICS.filter((m) => m.label !== "Total PMI" || anyPmi);

  return (
    <div className="table-scroll compare-scroll">
      <table className="compare">
        <caption className="sr-only">Scenario comparison across key loan metrics.</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {columns.map(({ scenario }) => (
              <th scope="col" key={scenario.id}>
                <span
                  className="series-dot"
                  style={{ background: seriesColor(scenario.colorSlot) }}
                  aria-hidden="true"
                />
                {scenario.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => {
            const values = columns.map((c) => metric.get(c.summary));
            const best = metric.markBest ? Math.min(...values) : null;
            const allEqual = values.every((v) => v === values[0]);
            return (
              <tr key={metric.label}>
                <th scope="row">{metric.label}</th>
                {values.map((value, i) => (
                  <td
                    key={columns[i].scenario.id}
                    className={best !== null && !allEqual && value === best ? "best" : ""}
                  >
                    {metric.fmt(value)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
