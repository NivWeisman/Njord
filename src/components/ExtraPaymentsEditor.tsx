/**
 * Editor for the extra-principal payment list: repeat kind, amount, and the
 * month window. Purely presentational; emits the whole updated array.
 */

import type { ExtraKind, ExtraPayment } from "../engine/types";
import { uid } from "../state/model";
import { NumberField } from "./NumberField";

interface Props {
  extras: ExtraPayment[];
  onChange: (next: ExtraPayment[]) => void;
}

/** List editor for one scenario's extra principal payments. */
export function ExtraPaymentsEditor({ extras, onChange }: Props) {
  const patch = (id: string, partial: Partial<ExtraPayment>) => {
    onChange(extras.map((e) => (e.id === id ? { ...e, ...partial } : e)));
  };

  return (
    <div>
      {extras.map((extra) => (
        <div className="extra-row" key={extra.id}>
          <label className="nf">
            <span className="nf-label">Repeats</span>
            <select
              value={extra.kind}
              onChange={(event) => patch(extra.id, { kind: event.target.value as ExtraKind })}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="once">Once</option>
            </select>
          </label>
          <NumberField
            label="Amount"
            prefix="$"
            value={extra.amount}
            max={10_000_000}
            onCommit={(amount) => patch(extra.id, { amount })}
          />
          <NumberField
            label={extra.kind === "once" ? "At month" : "From month"}
            value={extra.startMonth}
            min={1}
            max={480}
            onCommit={(startMonth) => patch(extra.id, { startMonth: Math.round(startMonth) })}
          />
          {extra.kind !== "once" ? (
            <label className="nf">
              <span className="nf-label">Until month</span>
              <span className="nf-box">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="payoff"
                  value={extra.endMonth ?? ""}
                  onChange={(event) => {
                    const draft = event.target.value.trim();
                    if (draft === "") {
                      patch(extra.id, { endMonth: undefined });
                      return;
                    }
                    const parsed = Math.round(Number(draft));
                    if (Number.isFinite(parsed) && parsed >= 1) {
                      patch(extra.id, { endMonth: Math.min(480, parsed) });
                    }
                  }}
                />
              </span>
            </label>
          ) : null}
          <button
            type="button"
            className="extra-remove"
            aria-label="Remove extra payment"
            onClick={() => onChange(extras.filter((e) => e.id !== extra.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange([...extras, { id: uid(), kind: "monthly", amount: 200, startMonth: 1 }])
        }
      >
        + Add extra payment
      </button>
      {extras.length === 0 ? (
        <p className="hint">
          Extra principal shortens the loan — add a recurring amount or a one-time payment.
        </p>
      ) : null}
    </div>
  );
}
