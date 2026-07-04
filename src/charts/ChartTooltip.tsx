/**
 * Floating crosshair readout. Values lead (strong), series names follow
 * (secondary), and each row is keyed by a short stroke of the series color —
 * text never wears the data color. Plain HTML positioned over the SVG.
 */

import type { ReactNode } from "react";

/** One series line inside the tooltip. */
export interface TooltipRow {
  name: string;
  /** Pre-formatted display value. */
  value: string;
  /** CSS color for the line key (never applied to the text itself). */
  color: string;
  /** Dim the row (e.g. a scenario already paid off at this month). */
  muted?: boolean;
}

/** Positioned readout box; the parent computes clamped pixel coordinates. */
export function ChartTooltip(props: {
  title: string;
  rows: TooltipRow[];
  x: number;
  y: number;
  footer?: ReactNode;
}) {
  return (
    <div className="chart-tooltip" style={{ left: props.x, top: props.y }} role="status">
      <div className="chart-tooltip-title">{props.title}</div>
      {props.rows.map((row, i) => (
        <div className={row.muted ? "chart-tooltip-row muted" : "chart-tooltip-row"} key={i}>
          <span className="chart-tooltip-key" style={{ background: row.color }} aria-hidden="true" />
          <span className="chart-tooltip-value">{row.value}</span>
          <span className="chart-tooltip-name">{row.name}</span>
        </div>
      ))}
      {props.footer ? <div className="chart-tooltip-footer">{props.footer}</div> : null}
    </div>
  );
}
