/**
 * Multi-scenario line chart of remaining balance over time.
 *
 * Dataviz specs applied: 2px round-capped lines, hairline solid gridlines,
 * a crosshair snapped to the nearest month with an every-series tooltip,
 * 8px payoff markers with a 2px surface ring, one selective direct label
 * (the active scenario's payoff), and a legend for two or more series.
 * The amortization table below the charts is the accessible table view.
 */

import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { ScheduleRow } from "../engine/types";
import { fmtMonthPoint, fmtMonthsAsTerm, fmtUsd, fmtUsdCompact } from "../format";
import { ChartTooltip } from "./ChartTooltip";
import type { TooltipRow } from "./ChartTooltip";
import { Legend } from "./Legend";
import { linePath, niceScale, useHoverIndex, useMeasuredWidth, yearTicks } from "./chartUtils";

/** One plotted scenario. */
export interface BalanceSeries {
  name: string;
  /** Resolved CSS color (palette-slot custom property). */
  color: string;
  /** Month-0 starting balance (the loan amount). */
  loanAmount: number;
  rows: ScheduleRow[];
  /** Emphasized series (the active scenario). */
  active: boolean;
}

const HEIGHT = 280;
const MARGIN = { top: 14, right: 20, bottom: 40, left: 62 } as const;

/** Remaining-balance lines for every scenario in the plan. */
export function BalanceChart({ series }: { series: BalanceSeries[] }) {
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const plotted = series.filter((s) => s.loanAmount > 0 && s.rows.length > 0);
  const maxMonth = Math.max(1, ...plotted.map((s) => s.rows.length));
  const hover = useHoverIndex(0, maxMonth);

  if (plotted.length === 0) {
    return (
      <div className="chart-empty">
        Set a home price above the down payment to see the balance curve.
      </div>
    );
  }

  const { max: yTop, ticks: yTicksList } = niceScale(
    Math.max(...plotted.map((s) => s.loanAmount)),
  );
  const xTicksList = yearTicks(maxMonth);

  const plotW = Math.max(60, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (month: number) => MARGIN.left + (month / maxMonth) * plotW;
  const y = (value: number) => MARGIN.top + (1 - value / yTop) * plotH;

  const balanceAt = (s: BalanceSeries, month: number): number | null => {
    if (month <= 0) return s.loanAmount;
    if (month <= s.rows.length) return s.rows[month - 1].balance;
    return null; // already paid off at this point
  };

  const monthFromPointer = (event: PointerEvent<SVGSVGElement>): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    // max-width:100% can render the SVG narrower than its layout width, so
    // map client px back into viewBox units before inverting the x scale.
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (width / Math.max(1, rect.width));
    return Math.round(((px - MARGIN.left) / plotW) * maxMonth);
  };

  const hoverMonth = hover.index;
  const tooltipX =
    hoverMonth === null
      ? 0
      : Math.min(Math.max(8, x(hoverMonth) + 14), Math.max(8, width - 200));
  const tooltipRows: TooltipRow[] = plotted.map((s) => {
    const value = hoverMonth === null ? null : balanceAt(s, hoverMonth);
    return {
      name: s.name,
      value: value === null ? "Paid off" : fmtUsd(value),
      color: s.color,
      muted: value === null,
    };
  });

  const activeSeries = plotted.find((s) => s.active);
  const drawOrder = [...plotted].sort((a, b) => Number(a.active) - Number(b.active));

  return (
    <div
      className="chart-wrap"
      ref={wrapRef}
      tabIndex={0}
      role="group"
      aria-label={`Remaining balance by month for ${plotted.length} scenario${
        plotted.length > 1 ? "s" : ""
      }. Use arrow keys to inspect months (Shift for a year); the amortization table holds the same data.`}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (hover.handleKey(event)) event.preventDefault();
      }}
      onPointerLeave={() => hover.setIndex(null)}
    >
      <svg
        ref={svgRef}
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        onPointerMove={(event) => hover.setIndex(monthFromPointer(event))}
        onPointerDown={(event) => hover.setIndex(monthFromPointer(event))}
        aria-hidden="true"
      >
        {yTicksList.map((tick) => (
          <g key={tick}>
            <line
              className="grid"
              x1={MARGIN.left}
              x2={MARGIN.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="tick" x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end">
              {fmtUsdCompact(tick)}
            </text>
          </g>
        ))}
        {xTicksList.map((months) => (
          <text key={months} className="tick" x={x(months)} y={HEIGHT - 22} textAnchor="middle">
            {months / 12}
          </text>
        ))}
        <text className="axis-caption" x={MARGIN.left + plotW} y={HEIGHT - 6} textAnchor="end">
          Loan year
        </text>
        <line className="axis" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(0)} y2={y(0)} />

        {hoverMonth !== null && (
          <line
            className="crosshair"
            x1={x(hoverMonth)}
            x2={x(hoverMonth)}
            y1={MARGIN.top}
            y2={y(0)}
          />
        )}

        {drawOrder.map((s) => {
          const points: [number, number][] = [[x(0), y(s.loanAmount)]];
          for (const row of s.rows) points.push([x(row.month), y(row.balance)]);
          return (
            <path
              key={s.name + s.color}
              d={linePath(points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.active ? 3 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={s.active || plotted.length === 1 ? 1 : 0.8}
            />
          );
        })}

        {plotted.map((s, i) => (
          <circle
            key={i}
            cx={x(s.rows.length)}
            cy={y(s.rows[s.rows.length - 1].balance)}
            r={4}
            fill={s.color}
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
        ))}

        {activeSeries && (
          <text
            className="direct-label"
            x={Math.max(MARGIN.left + 46, x(activeSeries.rows.length) - 8)}
            y={y(0) - 10}
            textAnchor="end"
          >
            {`Payoff ${fmtMonthsAsTerm(activeSeries.rows.length)}`}
          </text>
        )}

        {hoverMonth !== null &&
          plotted.map((s, i) => {
            const value = balanceAt(s, hoverMonth);
            if (value === null) return null;
            return (
              <circle
                key={i}
                cx={x(hoverMonth)}
                cy={y(value)}
                r={3.5}
                fill={s.color}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            );
          })}
      </svg>

      {hoverMonth !== null && (
        <ChartTooltip title={fmtMonthPoint(hoverMonth)} rows={tooltipRows} x={tooltipX} y={10} />
      )}
      <Legend
        items={plotted.map((s) => ({ name: s.name, color: s.color, kind: "line" as const }))}
      />
    </div>
  );
}
