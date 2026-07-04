/**
 * Month-by-month (or year-by-year) schedule table. This is also the charts'
 * accessible "table view" twin — every plotted value is reachable here
 * without hover or color perception.
 */

import { useMemo, useState } from "react";
import { aggregateByYear } from "../engine/mortgage";
import type { ScheduleRow } from "../engine/types";
import { fmtUsd, fmtUsd2 } from "../format";

interface Props {
  rows: ScheduleRow[];
}

/** Amortization schedule with a yearly/monthly granularity toggle. */
export function AmortizationTable({ rows }: Props) {
  const [mode, setMode] = useState<"yearly" | "monthly">("yearly");
  const years = useMemo(() => aggregateByYear(rows), [rows]);

  if (rows.length === 0) {
    return (
      <>
        <h2>Amortization schedule</h2>
        <p className="chart-empty">No schedule — the loan amount is zero.</p>
      </>
    );
  }

  const anyExtra = rows.some((r) => r.extra > 0);
  const anyPmi = rows.some((r) => r.pmi > 0);
  const escrowNote = rows[0].escrow > 0 || rows[0].hoa > 0;

  return (
    <>
      <div className="table-head">
        <h2>Amortization schedule</h2>
        <div className="seg" role="group" aria-label="Table granularity">
          <button
            type="button"
            aria-pressed={mode === "yearly"}
            onClick={() => setMode("yearly")}
          >
            Yearly
          </button>
          <button
            type="button"
            aria-pressed={mode === "monthly"}
            onClick={() => setMode("monthly")}
          >
            Monthly
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="amort">
          <caption className="sr-only">
            Amortization schedule: principal, interest
            {anyExtra ? ", extra payments" : ""}
            {anyPmi ? ", PMI" : ""} and remaining balance per{" "}
            {mode === "yearly" ? "year" : "month"}.
          </caption>
          <thead>
            <tr>
              <th scope="col">{mode === "yearly" ? "Year" : "Month"}</th>
              <th scope="col">Principal</th>
              <th scope="col">Interest</th>
              {anyExtra ? <th scope="col">Extra</th> : null}
              {anyPmi ? <th scope="col">PMI</th> : null}
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {mode === "yearly"
              ? years.map((year) => (
                  <tr key={year.year}>
                    <td>{year.year}</td>
                    <td>{fmtUsd(year.principal)}</td>
                    <td>{fmtUsd(year.interest)}</td>
                    {anyExtra ? <td>{fmtUsd(year.extra)}</td> : null}
                    {anyPmi ? <td>{fmtUsd(year.pmi)}</td> : null}
                    <td>{fmtUsd(year.balance)}</td>
                  </tr>
                ))
              : rows.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{fmtUsd2(row.principal)}</td>
                    <td>{fmtUsd2(row.interest)}</td>
                    {anyExtra ? <td>{row.extra > 0 ? fmtUsd2(row.extra) : "—"}</td> : null}
                    {anyPmi ? <td>{row.pmi > 0 ? fmtUsd2(row.pmi) : "—"}</td> : null}
                    <td>{fmtUsd(row.balance)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {escrowNote ? (
        <p className="hint">
          Escrow adds {fmtUsd2(rows[0].escrow)}/mo
          {rows[0].hoa > 0 ? ` and HOA ${fmtUsd2(rows[0].hoa)}/mo` : ""} on top of every month
          (constant, so not repeated per row).
        </p>
      ) : null}
    </>
  );
}
