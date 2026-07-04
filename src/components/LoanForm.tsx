/**
 * Input form for the active scenario. Purely presentational: every change is
 * reported upward as a partial `LoanInputs` patch; no money math lives here
 * beyond the down-payment $ ↔ % linkage.
 */

import type { LoanInputs } from "../engine/types";
import { fmtUsd } from "../format";
import { ExtraPaymentsEditor } from "./ExtraPaymentsEditor";
import { NumberField } from "./NumberField";

interface Props {
  inputs: LoanInputs;
  onPatch: (patch: Partial<LoanInputs>) => void;
}

/** The left-pane loan editor. */
export function LoanForm({ inputs, onPatch }: Props) {
  const loan = Math.max(0, inputs.homePrice - inputs.downPayment);
  const downPct = inputs.homePrice > 0 ? (inputs.downPayment / inputs.homePrice) * 100 : 0;

  return (
    <form className="loan-form" onSubmit={(event) => event.preventDefault()}>
      <fieldset>
        <legend>Purchase</legend>
        <NumberField
          label="Home price"
          prefix="$"
          value={inputs.homePrice}
          max={100_000_000}
          onCommit={(homePrice) =>
            onPatch({ homePrice, downPayment: Math.min(inputs.downPayment, homePrice) })
          }
        />
        <div className="field-row">
          <NumberField
            label="Down payment"
            prefix="$"
            value={inputs.downPayment}
            max={inputs.homePrice}
            onCommit={(downPayment) => onPatch({ downPayment })}
          />
          <NumberField
            label="Down payment"
            suffix="%"
            decimals={1}
            value={downPct}
            max={100}
            onCommit={(pct) =>
              onPatch({ downPayment: Math.round((inputs.homePrice * pct) / 100) })
            }
          />
        </div>
        <p className="derived">
          Loan amount <strong>{fmtUsd(loan)}</strong>
          {loan > 0 && inputs.homePrice > 0
            ? ` · LTV ${((loan / inputs.homePrice) * 100).toFixed(1)}%`
            : ""}
        </p>
      </fieldset>

      <fieldset>
        <legend>Loan</legend>
        <div className="field-row">
          <NumberField
            label="Interest rate"
            suffix="% / yr"
            decimals={3}
            value={inputs.annualRatePct}
            max={30}
            onCommit={(annualRatePct) => onPatch({ annualRatePct })}
          />
          <NumberField
            label="Term"
            suffix="years"
            value={inputs.termYears}
            min={1}
            max={40}
            onCommit={(termYears) => onPatch({ termYears })}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>
          <label className="toggle">
            <input
              type="checkbox"
              checked={inputs.usEnabled}
              onChange={(event) => onPatch({ usEnabled: event.target.checked })}
            />
            US costs — tax · insurance · PMI · HOA
          </label>
        </legend>
        {inputs.usEnabled ? (
          <>
            <div className="field-row">
              <NumberField
                label="Property tax"
                suffix="% / yr"
                decimals={2}
                value={inputs.us.propertyTaxAnnualPct}
                max={10}
                onCommit={(propertyTaxAnnualPct) =>
                  onPatch({ us: { ...inputs.us, propertyTaxAnnualPct } })
                }
              />
              <NumberField
                label="Insurance"
                prefix="$"
                suffix="/ yr"
                value={inputs.us.insuranceAnnual}
                max={100_000}
                onCommit={(insuranceAnnual) => onPatch({ us: { ...inputs.us, insuranceAnnual } })}
              />
            </div>
            <div className="field-row">
              <NumberField
                label="PMI"
                suffix="% / yr"
                decimals={2}
                value={inputs.us.pmiAnnualPct}
                max={5}
                onCommit={(pmiAnnualPct) => onPatch({ us: { ...inputs.us, pmiAnnualPct } })}
              />
              <NumberField
                label="HOA"
                prefix="$"
                suffix="/ mo"
                value={inputs.us.hoaMonthly}
                max={10_000}
                onCommit={(hoaMonthly) => onPatch({ us: { ...inputs.us, hoaMonthly } })}
              />
            </div>
            <p className="hint">
              PMI applies while the loan-to-value ratio is above 80%, then drops automatically.
            </p>
          </>
        ) : null}
      </fieldset>

      <fieldset>
        <legend>Extra principal payments</legend>
        <ExtraPaymentsEditor
          extras={inputs.extraPayments}
          onChange={(extraPayments) => onPatch({ extraPayments })}
        />
      </fieldset>
    </form>
  );
}
