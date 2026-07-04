/**
 * Stacked-area composition of the monthly payment for one scenario:
 * principal (slot 1), interest (slot 2), recurring extra principal (slot 3).
 *
 * Dataviz specs applied: 10%-opacity area washes whose top edges are stroked
 * 2px in the series color over a 4px surface-color separator (the "2px
 * surface gap" between touching fills), hairline solid grid, crosshair +
 * every-series tooltip, one selective direct label (the principal/interest
 * crossover), and a legend. One-time extras would dwarf the monthly scale,
 * so they appear as small baseline markers + a tooltip footer, not stacked.
 */

import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { extraPrincipalFor } from "../engine/mortgage";
import type { ExtraPayment, ScheduleRow } from "../engine/types";
import { fmtMonthPoint, fmtUsd2, fmtUsdCompact } from "../format";
import { ChartTooltip } from "./ChartTooltip";
import type { TooltipRow } from "./ChartTooltip";
import { Legend } from "./Legend";
import {
  bandPath,
  linePath,
  niceScale,
  seriesColor,
  useHoverIndex,
  useMeasuredWidth,
  yearTicks,
} from "./chartUtils";

const HEIGHT = 260;
const MARGIN = { top: 14, right: 20, bottom: 40, left: 62 } as const;

interface Stratum {
  name: string;
  color: string;
  /** Per-month dollar amounts (index 0 = loan month 1). */
  values: number[];
}

/** Payment composition for the active scenario. */
export function PaymentSplitChart({
  rows,
  extras,
}: {
  rows: ScheduleRow[];
  extras: ExtraPayment[];
}) {
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const months = rows.length;
  const hover = useHoverIndex(1, Math.max(1, months));

  if (months < 2) {
    return <div className="chart-empty">No schedule to plot yet.</div>;
  }

  const recurringDefs = extras.filter((e) => e.kind !== "once");
  const principal = rows.map((r) => r.principal);
  const interest = rows.map((r) => r.interest);
  const recurringExtra = rows.map((r) =>
    Math.min(r.extra, extraPrincipalFor(r.month, recurringDefs)),
  );
  const onceExtra = rows.map((r, i) => r.extra - recurringExtra[i]);
  const hasRecurring = recurringExtra.some((v) => v > 0);
  const onceMonths = rows.filter((_, i) => onceExtra[i] > 0.005).map((r) => r.month);

  // Fixed identity → fixed palette slots, present or not (color follows entity).
  const strata: Stratum[] = [
    { name: "Principal", color: seriesColor(0), values: principal },
    { name: "Interest", color: seriesColor(1), values: interest },
  ];
  if (hasRecurring) {
    strata.push({ name: "Extra (recurring)", color: seriesColor(2), values: recurringExtra });
  }

  // stackTops[k][m] = cumulative height of strata 0..k at month index m.
  const stackTops: number[][] = [];
  let running = new Array<number>(months).fill(0);
  for (const stratum of strata) {
    running = running.map((v, i) => v + stratum.values[i]);
    stackTops.push([...running]);
  }

  const { max: yTop, ticks: yTicksList } = niceScale(
    Math.max(...stackTops[stackTops.length - 1]),
  );
  const xTicksList = yearTicks(months);

  const plotW = Math.max(60, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (month: number) => MARGIN.left + ((month - 1) / (months - 1)) * plotW;
  const y = (value: number) => MARGIN.top + (1 - value / yTop) * plotH;

  const pointsFor = (values: number[]): [number, number][] =>
    values.map((v, i) => [x(i + 1), y(v)]);
  const baseline: [number, number][] = [
    [x(1), y(0)],
    [x(months), y(0)],
  ];

  // First month where the principal share meets the interest share.
  let crossover: number | null = null;
  for (let i = 0; i < months; i++) {
    if (principal[i] >= interest[i]) {
      crossover = i + 1;
      break;
    }
  }
  if (crossover !== null && crossover <= 1) crossover = null; // nothing was "overtaken"

  const monthFromPointer = (event: PointerEvent<SVGSVGElement>): number => {
    const svg = svgRef.current;
    if (!svg) return 1;
    // max-width:100% can render the SVG narrower than its layout width, so
    // map client px back into viewBox units before inverting the x scale.
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (width / Math.max(1, rect.width));
    return 1 + Math.round(((px - MARGIN.left) / plotW) * (months - 1));
  };

  const hoverMonth = hover.index;
  const hoverIdx = hoverMonth === null ? null : hoverMonth - 1;
  const tooltipX =
    hoverMonth === null
      ? 0
      : Math.min(Math.max(8, x(hoverMonth) + 14), Math.max(8, width - 200));
  // Top-of-stack first, matching the visual order.
  const tooltipRows: TooltipRow[] =
    hoverIdx === null
      ? []
      : strata
          .map((stratum) => ({
            name: stratum.name,
            value: fmtUsd2(stratum.values[hoverIdx]),
            color: stratum.color,
          }))
          .reverse();
  const onceAtHover = hoverIdx === null ? 0 : onceExtra[hoverIdx];

  return (
    <div
      className="chart-wrap"
      ref={wrapRef}
      tabIndex={0}
      role="group"
      aria-label={`Monthly payment composition: principal, interest${
        hasRecurring ? ", recurring extra" : ""
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
        {xTicksList.map((tickMonths) => (
          <text
            key={tickMonths}
            className="tick"
            x={x(Math.max(1, tickMonths))}
            y={HEIGHT - 22}
            textAnchor="middle"
          >
            {tickMonths / 12}
          </text>
        ))}
        <text className="axis-caption" x={MARGIN.left + plotW} y={HEIGHT - 6} textAnchor="end">
          Loan year
        </text>
        <line className="axis" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(0)} y2={y(0)} />

        {strata.map((stratum, k) => (
          <path
            key={stratum.name}
            d={bandPath(pointsFor(stackTops[k]), k === 0 ? baseline : pointsFor(stackTops[k - 1]))}
            fill={stratum.color}
            opacity={0.1}
            stroke="none"
          />
        ))}
        {strata.map((stratum, k) => (
          <g key={stratum.name}>
            <path
              d={linePath(pointsFor(stackTops[k]))}
              fill="none"
              stroke="var(--surface-1)"
              strokeWidth={4}
            />
            <path
              d={linePath(pointsFor(stackTops[k]))}
              fill="none"
              stroke={stratum.color}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>
        ))}

        {onceMonths.map((month) => (
          <path
            key={month}
            className="once-marker"
            d={`M${x(month).toFixed(2)} ${(y(0) - 7).toFixed(2)} l4 7 l-8 0 Z`}
          />
        ))}

        {hoverMonth !== null && (
          <line
            className="crosshair"
            x1={x(hoverMonth)}
            x2={x(hoverMonth)}
            y1={MARGIN.top}
            y2={y(0)}
          />
        )}

        {crossover !== null &&
          (() => {
            const cx = x(crossover);
            const cy = y(principal[crossover - 1]);
            const flip = crossover > months * 0.62;
            return (
              <g>
                <circle cx={cx} cy={cy} r={4} fill="var(--ink-2)" stroke="var(--surface-1)" strokeWidth={2} />
                <text
                  className="direct-label"
                  x={flip ? cx - 9 : cx + 9}
                  y={Math.max(MARGIN.top + 12, cy - 9)}
                  textAnchor={flip ? "end" : "start"}
                >
                  {`Principal overtakes interest · Yr ${Math.ceil(crossover / 12)}`}
                </text>
              </g>
            );
          })()}
      </svg>

      {hoverMonth !== null && (
        <ChartTooltip
          title={fmtMonthPoint(hoverMonth)}
          rows={tooltipRows}
          x={tooltipX}
          y={10}
          footer={onceAtHover > 0.005 ? `+ one-time extra ${fmtUsd2(onceAtHover)}` : undefined}
        />
      )}
      <Legend
        items={strata.map((s) => ({ name: s.name, color: s.color, kind: "area" as const }))}
      />
      {onceMonths.length > 0 && (
        <p className="hint">
          ▲ one-time extra payment — reported in the tooltip, not stacked (it would dwarf the
          monthly scale).
        </p>
      )}
    </div>
  );
}
