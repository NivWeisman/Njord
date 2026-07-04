/**
 * Chart legend: colored key marks beside ink-colored labels. Rendered only
 * for two or more series — a single series is named by the chart title.
 * Keys mirror the mark: a short line for line series, a swatch for areas.
 */

/** One legend entry. */
export interface LegendItem {
  name: string;
  color: string;
  kind: "line" | "area";
}

/** Horizontal legend row under a chart. */
export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <div className="chart-legend">
      {items.map((item, i) => (
        <span className="chart-legend-item" key={i}>
          <span
            className={item.kind === "line" ? "chart-legend-line" : "chart-legend-swatch"}
            style={{ background: item.color }}
            aria-hidden="true"
          />
          {item.name}
        </span>
      ))}
    </div>
  );
}
