/**
 * Scenario tab strip: select, add (up to the palette cap), duplicate, rename
 * (double-click), and delete. Each tab wears its scenario's palette dot; the
 * color follows the scenario for its whole life — never reassigned on delete.
 */

import { useState } from "react";
import { seriesColor } from "../charts/chartUtils";
import { MAX_SCENARIOS } from "../state/model";
import type { Scenario } from "../state/model";

interface Props {
  scenarios: Scenario[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/** Tab strip above the main grid. */
export function ScenarioTabs(props: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const canAdd = props.scenarios.length < MAX_SCENARIOS;

  const commitRename = (scenario: Scenario) => {
    const name = draft.trim();
    if (name.length > 0 && name !== scenario.name) props.onRename(scenario.id, name);
    setEditingId(null);
  };

  return (
    <div className="tabs" role="tablist" aria-label="Scenarios">
      {props.scenarios.map((scenario) => {
        const active = scenario.id === props.activeId;
        return (
          <div className={active ? "tab active" : "tab"} key={scenario.id}>
            {editingId === scenario.id ? (
              <input
                className="tab-rename"
                autoFocus
                value={draft}
                aria-label="Scenario name"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => commitRename(scenario)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename(scenario);
                  if (event.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="tab-label"
                title="Double-click to rename"
                onClick={() => props.onSelect(scenario.id)}
                onDoubleClick={() => {
                  setEditingId(scenario.id);
                  setDraft(scenario.name);
                }}
              >
                <span
                  className="series-dot"
                  style={{ background: seriesColor(scenario.colorSlot) }}
                  aria-hidden="true"
                />
                {scenario.name}
              </button>
            )}
            {props.scenarios.length > 1 ? (
              <button
                type="button"
                className="tab-close"
                aria-label={`Delete ${scenario.name}`}
                onClick={() => props.onDelete(scenario.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        className="tab-add"
        onClick={props.onAdd}
        disabled={!canAdd}
        title={canAdd ? "Add a scenario" : `Up to ${MAX_SCENARIOS} scenarios`}
      >
        + Add
      </button>
      <button
        type="button"
        className="tab-add"
        onClick={props.onDuplicate}
        disabled={!canAdd}
        title={canAdd ? "Duplicate the active scenario" : `Up to ${MAX_SCENARIOS} scenarios`}
      >
        ⧉ Duplicate
      </button>
    </div>
  );
}
