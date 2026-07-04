/**
 * Save / load / share the whole plan. Named plans live in localStorage;
 * "Copy link" flushes the current state into the URL and copies it to the
 * clipboard (with a prompt fallback outside secure contexts).
 */

import { useState } from "react";
import type { PlanState } from "../state/model";
import { deletePlan, listPlans, savePlan } from "../state/storage";
import type { SavedPlan } from "../state/storage";
import { writeStateToUrl } from "../state/urlState";

interface Props {
  state: PlanState;
  onLoad: (state: PlanState) => void;
  onNew: () => void;
}

/** Header toolbar: share link, saved-plan panel, fresh plan. */
export function SavedPlans({ state, onLoad, onNew }: Props) {
  const [plans, setPlans] = useState<SavedPlan[]>(() => listPlans());
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const save = () => {
    const planName = name.trim() || `Plan ${new Date().toLocaleDateString()}`;
    savePlan(planName, state);
    setPlans(listPlans());
    setName("");
  };

  const copyLink = async () => {
    writeStateToUrl(state); // make sure the URL reflects the latest edits
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", link);
    }
  };

  return (
    <div className="plans">
      <button type="button" className="btn" onClick={() => void copyLink()}>
        {copied ? "Copied ✓" : "Copy link"}
      </button>
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => {
          setPlans(listPlans());
          setOpen(!open);
        }}
      >
        Plans ▾
      </button>
      <button type="button" className="btn" title="Start a fresh plan" onClick={onNew}>
        New
      </button>
      {open ? (
        <div className="plans-panel">
          <div className="plans-save">
            <input
              placeholder="Plan name"
              value={name}
              aria-label="Plan name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
              }}
            />
            <button type="button" className="btn" onClick={save}>
              Save
            </button>
          </div>
          {plans.length === 0 ? (
            <p className="hint">No saved plans yet — name one and hit Save.</p>
          ) : (
            <ul className="plans-list">
              {plans.map((plan) => (
                <li key={plan.name}>
                  <button
                    type="button"
                    className="plans-load"
                    title={`Saved ${new Date(plan.savedAt).toLocaleString()}`}
                    onClick={() => {
                      onLoad(plan.state);
                      setOpen(false);
                    }}
                  >
                    {plan.name}
                  </button>
                  <button
                    type="button"
                    className="plans-del"
                    aria-label={`Delete ${plan.name}`}
                    onClick={() => {
                      deletePlan(plan.name);
                      setPlans(listPlans());
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
