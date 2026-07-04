/**
 * Shared chart plumbing: container measurement, "nice" axis ticks, SVG path
 * builders, palette-slot lookup, and the crosshair hover-index hook. Chart
 * components own their geometry; this module owns only the math they share.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** CSS color for a palette slot (values live in styles.css, light + dark). */
export function seriesColor(slot: number): string {
  const clamped = Math.max(0, Math.min(3, Math.round(slot)));
  return `var(--series-${clamped})`;
}

/** Measure a container's content width with ResizeObserver (rounded px). */
export function useMeasuredWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(Math.max(280, Math.round(entry.contentRect.width)));
      }
    });
    observer.observe(el);
    setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A rounded-up "nice" maximum and tick list for a zero-based linear axis. */
export function niceScale(maxValue: number, tickCount = 5): { max: number; ticks: number[] } {
  if (!(maxValue > 0)) return { max: 1, ticks: [0, 1] };
  const roughStep = maxValue / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const step =
    (residual > 5 ? 10 : residual > 2.5 ? 5 : residual > 2 ? 2.5 : residual > 1 ? 2 : 1) *
    magnitude;
  const max = Math.ceil(maxValue / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= max + step / 2; tick += step) ticks.push(tick);
  return { max, ticks };
}

/** Year gridline positions (in months) for a monthly x-axis. */
export function yearTicks(totalMonths: number): number[] {
  const years = Math.max(1, Math.ceil(totalMonths / 12));
  const step = [1, 2, 5, 10, 20].find((s) => years / s <= 8) ?? 20;
  const ticks: number[] = [];
  for (let year = 0; year <= years; year += step) ticks.push(year * 12);
  return ticks;
}

/** "M x0 y0 L x1 y1 …" polyline path from pixel points. */
export function linePath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return "";
  let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
  }
  return d;
}

/** Closed region between an upper boundary and a lower boundary (reversed). */
export function bandPath(
  upper: ReadonlyArray<readonly [number, number]>,
  lower: ReadonlyArray<readonly [number, number]>,
): string {
  if (upper.length === 0 || lower.length === 0) return "";
  let d = linePath(upper);
  for (let i = lower.length - 1; i >= 0; i--) {
    d += `L${lower[i][0].toFixed(2)} ${lower[i][1].toFixed(2)}`;
  }
  return d + "Z";
}

/** Minimal keyboard-event shape (structural, so no React/DOM type coupling). */
interface KeyLike {
  key: string;
  shiftKey: boolean;
}

/**
 * Crosshair state shared by both charts: an integer hover index in
 * [min, max], driven by pointer position and arrow keys (Shift = 1 year).
 */
export function useHoverIndex(min: number, max: number) {
  const [index, setIndexRaw] = useState<number | null>(null);
  const clamp = (value: number) => Math.min(max, Math.max(min, value));

  useEffect(() => {
    setIndexRaw((current) => (current === null ? null : Math.min(current, max)));
  }, [max]);

  const setIndex = (value: number | null) => {
    setIndexRaw(value === null ? null : clamp(value));
  };

  /** Returns true when the key was consumed (caller should preventDefault). */
  const handleKey = (event: KeyLike): boolean => {
    const stepBy = event.shiftKey ? 12 : 1;
    switch (event.key) {
      case "ArrowLeft":
        setIndexRaw((current) => clamp((current ?? max + 1) - stepBy));
        return true;
      case "ArrowRight":
        setIndexRaw((current) => clamp((current ?? min - 1) + stepBy));
        return true;
      case "Home":
        setIndexRaw(min);
        return true;
      case "End":
        setIndexRaw(max);
        return true;
      case "Escape":
        setIndexRaw(null);
        return true;
      default:
        return false;
    }
  };

  return { index, setIndex, handleKey };
}
