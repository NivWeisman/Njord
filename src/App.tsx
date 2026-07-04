/**
 * Njord — mortgage calculator. App shell: owns the plan state, derives every
 * scenario's schedule, and wires persistence (URL + localStorage autosave).
 * All money math lives in `engine/`; all chart drawing in `charts/`.
 */

import { useEffect, useMemo, useState } from "react";
import { BalanceChart } from "./charts/BalanceChart";
import type { BalanceSeries } from "./charts/BalanceChart";
import { PaymentSplitChart } from "./charts/PaymentSplitChart";
import { seriesColor } from "./charts/chartUtils";
import { AmortizationTable } from "./components/AmortizationTable";
import { CompareTable } from "./components/CompareTable";
import { CompsPanel } from "./components/CompsPanel";
import { LoanForm } from "./components/LoanForm";
import { SavedPlans } from "./components/SavedPlans";
import { ScenarioTabs } from "./components/ScenarioTabs";
import { SummaryCards } from "./components/SummaryCards";
import { buildSchedule } from "./engine/mortgage";
import type { LoanInputs, ScheduleResult } from "./engine/types";
import { defaultState, newScenario } from "./state/defaults";
import type { PlanState } from "./state/model";
import { loadAutosave, saveAutosave } from "./state/storage";
import { readStateFromUrl, writeStateToUrl } from "./state/urlState";

/** Root component. */
export default function App() {
  // Priority on first load: shared URL > last session's autosave > defaults.
  const [state, setState] = useState<PlanState>(
    () => readStateFromUrl() ?? loadAutosave() ?? defaultState(),
  );

  // Reflect every change into the URL and the autosave slot (debounced), so
  // reload and "Copy link" always resume the current plan.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      writeStateToUrl(state);
      saveAutosave(state);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [state]);

  const schedules = useMemo(
    () =>
      new Map<string, ScheduleResult>(
        state.scenarios.map((s) => [s.id, buildSchedule(s.inputs)]),
      ),
    [state.scenarios],
  );

  const active = state.scenarios.find((s) => s.id === state.activeId) ?? state.scenarios[0];
  const activeSchedule = schedules.get(active.id) ?? buildSchedule(active.inputs);

  const patchActive = (patch: Partial<LoanInputs>) => {
    setState((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) =>
        s.id === prev.activeId ? { ...s, inputs: { ...s.inputs, ...patch } } : s,
      ),
    }));
  };

  const addScenario = (cloneActive: boolean) => {
    setState((prev) => {
      const source = cloneActive
        ? prev.scenarios.find((s) => s.id === prev.activeId)
        : undefined;
      const created = newScenario(prev.scenarios, source?.inputs);
      if (!created) return prev;
      return { ...prev, activeId: created.id, scenarios: [...prev.scenarios, created] };
    });
  };

  const deleteScenario = (id: string) => {
    setState((prev) => {
      if (prev.scenarios.length <= 1) return prev;
      const scenarios = prev.scenarios.filter((s) => s.id !== id);
      return {
        ...prev,
        activeId: prev.activeId === id ? scenarios[0].id : prev.activeId,
        scenarios,
      };
    });
  };

  const balanceSeries: BalanceSeries[] = state.scenarios.map((s) => {
    const schedule = schedules.get(s.id) ?? buildSchedule(s.inputs);
    return {
      name: s.name,
      color: seriesColor(s.colorSlot),
      loanAmount: schedule.summary.loanAmount,
      rows: schedule.rows,
      active: s.id === active.id,
    };
  });

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>🌊 Njord</h1>
          <p className="app-sub">
            Mortgage calculator — amortization, extra payments, scenario comparison.
          </p>
        </div>
        <SavedPlans state={state} onLoad={setState} onNew={() => setState(defaultState())} />
      </header>

      <ScenarioTabs
        scenarios={state.scenarios}
        activeId={active.id}
        onSelect={(id) => setState((prev) => ({ ...prev, activeId: id }))}
        onAdd={() => addScenario(false)}
        onDuplicate={() => addScenario(true)}
        onRename={(id, name) =>
          setState((prev) => ({
            ...prev,
            scenarios: prev.scenarios.map((s) =>
              s.id === id ? { ...s, name: name.slice(0, 40) } : s,
            ),
          }))
        }
        onDelete={deleteScenario}
      />

      <div className="app-grid">
        <section className="form-pane" aria-label="Loan inputs">
          <LoanForm key={active.id} inputs={active.inputs} onPatch={patchActive} />
        </section>

        <section className="results-pane" aria-label="Results">
          <SummaryCards summary={activeSchedule.summary} usEnabled={active.inputs.usEnabled} />

          <div className="card">
            <h2>Remaining balance</h2>
            <BalanceChart series={balanceSeries} />
          </div>

          <div className="card">
            <h2>Payment composition — {active.name}</h2>
            <PaymentSplitChart
              rows={activeSchedule.rows}
              extras={active.inputs.extraPayments}
            />
          </div>

          {state.scenarios.length > 1 ? (
            <div className="card">
              <h2>Compare scenarios</h2>
              <CompareTable scenarios={state.scenarios} schedules={schedules} />
            </div>
          ) : null}

          <div className="card">
            <AmortizationTable rows={activeSchedule.rows} />
          </div>

          <div className="card">
            <CompsPanel
              onUseHomePrice={(price) =>
                patchActive({
                  homePrice: price,
                  downPayment: Math.min(active.inputs.downPayment, price),
                })
              }
            />
          </div>
        </section>
      </div>

      <footer className="app-footer">
        Estimates only — actual rates, taxes, insurance, and PMI terms vary by lender and
        location. Not financial advice.
      </footer>
    </div>
  );
}
