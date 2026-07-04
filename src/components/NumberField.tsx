/**
 * Numeric input with a local text draft: partial entries ("", "3.", "0.0")
 * don't fight the store, every valid keystroke commits so results update
 * live, and blur snaps the text back to the canonical committed value.
 * `min` is enforced only on blur so typing "4" on the way to "40" isn't
 * clamped mid-entry; `max` is enforced immediately.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  /** Enforced on blur. */
  min?: number;
  /** Enforced on every keystroke. */
  max?: number;
  /** Display rounding (decimal places) for canonical values. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

/** Labeled numeric field with optional unit affixes. */
export function NumberField({
  label,
  value,
  onCommit,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  decimals = 0,
  prefix,
  suffix,
}: Props) {
  const display = (v: number): string => String(Number(v.toFixed(decimals)));
  const [text, setText] = useState(() => display(value));
  const committed = useRef(value);

  // External changes (scenario edits from linked fields, plan loads) reset
  // the draft; echoes of our own commits do not, preserving in-progress text.
  useEffect(() => {
    if (Math.abs(value - committed.current) > 1e-9) {
      committed.current = value;
      setText(display(value));
    }
    // eslint-style note: `display` depends only on the constant `decimals`.
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <label className="nf">
      <span className="nf-label">{label}</span>
      <span className="nf-box">
        {prefix ? <span className="nf-affix">{prefix}</span> : null}
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(event) => {
            const draft = event.target.value;
            setText(draft);
            if (draft.trim() === "") return;
            const parsed = Number(draft);
            if (!Number.isFinite(parsed)) return;
            const clamped = Math.min(max, Math.max(0, parsed));
            committed.current = clamped;
            onCommit(clamped);
          }}
          onBlur={() => {
            const final = Math.min(max, Math.max(min, committed.current));
            if (final !== committed.current) {
              committed.current = final;
              onCommit(final);
            }
            setText(display(final));
          }}
        />
        {suffix ? <span className="nf-affix">{suffix}</span> : null}
      </span>
    </label>
  );
}
