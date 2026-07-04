/**
 * Comparable-sales panel: address + beds/baths inputs, the RapidAPI key
 * setup, and the classified results (same street / nearby streets / school
 * district) as stat tiles plus a detail table. Orchestrates the pipeline in
 * `src/comps/`; the median of any bucket can be pushed into the active
 * scenario's home price.
 */

import { useRef, useState } from "react";
import { classifyComps } from "../comps/analyze";
import { fetchDistrictPolygon, geocodeAddress } from "../comps/geocode";
import {
  loadApiKey,
  loadCache,
  loadPrefs,
  saveApiKey,
  saveCache,
  savePrefs,
} from "../comps/storage";
import type { CompsCache } from "../comps/storage";
import { CompsError } from "../comps/types";
import type { BucketStats } from "../comps/types";
import { fetchRecentlySold } from "../comps/zillow";
import { fmtUsd } from "../format";
import { NumberField } from "./NumberField";

interface Props {
  /** Push a bucket's median into the active scenario's home price. */
  onUseHomePrice: (price: number) => void;
}

type Phase = "idle" | "working" | "done" | "error";

function fmtSoldDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function fmtMiles(km: number | undefined): string {
  return km === undefined ? "—" : `${(km * 0.621371).toFixed(1)} mi`;
}

/** One bucket tile: count, median, range, and the "use median" action. */
function BucketTile(props: {
  label: string;
  stats: BucketStats;
  onUse: (price: number) => void;
}) {
  const { label, stats, onUse } = props;
  return (
    <div className="kpi comps-bucket">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{stats.median === null ? "—" : fmtUsd(stats.median)}</div>
      <div className="kpi-sub">
        {stats.count === 0
          ? "no matching sales"
          : `${stats.count} sale${stats.count > 1 ? "s" : ""} · ${fmtUsd(stats.min ?? 0)}–${fmtUsd(
              stats.max ?? 0,
            )}${stats.medianPerSqft !== null ? ` · ~$${Math.round(stats.medianPerSqft)}/sqft` : ""}`}
      </div>
      {stats.median !== null ? (
        <button
          type="button"
          className="btn comps-use"
          onClick={() => onUse(Math.round(stats.median as number))}
        >
          Use as home price
        </button>
      ) : null}
    </div>
  );
}

/** The "Recent sales nearby" card body. */
export function CompsPanel({ onUseHomePrice }: Props) {
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const [keyDraft, setKeyDraft] = useState("");
  const [phase, setPhase] = useState<Phase>(() => (loadCache() ? "done" : "idle"));
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CompsCache | null>(() => loadCache());
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    const address = prefs.address.trim();
    if (address === "") {
      setPhase("error");
      setError("Enter a street address first.");
      return;
    }
    if (apiKey === "") {
      setPhase("error");
      setError("Add your RapidAPI key below first (stored only in this browser).");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("working");
    setError("");
    setNote("");
    savePrefs(prefs);

    try {
      setStep("Geocoding address (US Census)…");
      const subject = await geocodeAddress(address);

      let rings: number[][][] | null = null;
      let districtNote = "";
      if (subject.district) {
        setStep(`Loading boundary — ${subject.district.name}…`);
        try {
          rings = await fetchDistrictPolygon(
            subject.district.geoid,
            subject.district.layer,
            controller.signal,
          );
        } catch {
          districtNote = "District boundary unavailable — the district bucket is empty.";
        }
      } else {
        districtNote = "No school district found for this address.";
      }

      setStep(`Fetching recent sales in ${subject.zip}…`);
      const raw = await fetchRecentlySold(
        apiKey,
        subject.zip,
        { beds: prefs.beds, baths: prefs.baths },
        controller.signal,
      );

      const classified = classifyComps(
        { ...subject, beds: prefs.beds, baths: prefs.baths },
        raw,
        rings,
      );
      const cache: CompsCache = {
        fetchedAt: new Date().toISOString(),
        subjectLabel: subject.matchedAddress,
        districtName: subject.district?.name ?? null,
        searchedZip: subject.zip,
        ...classified,
      };
      setResult(cache);
      saveCache(cache);
      setNote(districtNote);
      setPhase("done");
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof CompsError) {
        setError(cause.message);
      } else if (cause instanceof TypeError) {
        setError(
          "A network request was blocked (offline or CORS). See the README's comps section for details.",
        );
      } else {
        setError("Something went wrong while fetching comps.");
      }
      setPhase("error");
    } finally {
      setStep("");
    }
  };

  return (
    <div>
      <h2>Recent sales nearby</h2>
      <p className="hint comps-intro">
        Looks up sold prices of similar homes (±1 bed/bath, last 3 years) on the same street,
        nearby streets, and in the same school district — searched within the address's ZIP.
      </p>

      <div className="comps-form">
        <label className="nf comps-address">
          <span className="nf-label">Street address</span>
          <span className="nf-box">
            <input
              type="text"
              placeholder="123 Main St, Springfield, IL"
              value={prefs.address}
              onChange={(event) => setPrefs({ ...prefs, address: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") void run();
              }}
            />
          </span>
        </label>
        <NumberField
          label="Bedrooms"
          value={prefs.beds}
          max={10}
          onCommit={(beds) => setPrefs((prev) => ({ ...prev, beds }))}
        />
        <NumberField
          label="Bathrooms"
          decimals={1}
          value={prefs.baths}
          max={10}
          onCommit={(baths) => setPrefs((prev) => ({ ...prev, baths }))}
        />
        <button
          type="button"
          className="btn comps-run"
          disabled={phase === "working"}
          onClick={() => void run()}
        >
          {phase === "working" ? "Working…" : result ? "Refresh comps" : "Find comps"}
        </button>
      </div>

      <details className="comps-key">
        <summary>
          API key — {apiKey === "" ? "not set" : "saved in this browser"}
        </summary>
        <p className="hint">
          Zillow has no official public API; sold data comes from the community
          "zillow-com1" provider on RapidAPI. Create a free RapidAPI account, subscribe to
          that API's free tier, and paste your key here. It is stored only in this
          browser's localStorage and never leaves this machine except toward RapidAPI.
        </p>
        <div className="comps-key-row">
          <input
            type="password"
            placeholder={apiKey === "" ? "RapidAPI key" : "•••••••• (replace)"}
            value={keyDraft}
            aria-label="RapidAPI key"
            onChange={(event) => setKeyDraft(event.target.value)}
          />
          <button
            type="button"
            className="btn"
            disabled={keyDraft.trim() === ""}
            onClick={() => {
              saveApiKey(keyDraft);
              setApiKey(keyDraft.trim());
              setKeyDraft("");
            }}
          >
            Save key
          </button>
          {apiKey !== "" ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                saveApiKey("");
                setApiKey("");
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      </details>

      {phase === "working" ? <p className="comps-status">{step}</p> : null}
      {phase === "error" ? <p className="comps-error">{error}</p> : null}

      {result ? (
        <>
          <p className="hint comps-meta">
            {result.subjectLabel} · searched ZIP {result.searchedZip} · fetched{" "}
            {new Date(result.fetchedAt).toLocaleString()}
            {note !== "" ? ` · ${note}` : ""}
          </p>
          <div className="kpis comps-buckets">
            <BucketTile label="Same street" stats={result.sameStreet} onUse={onUseHomePrice} />
            <BucketTile
              label="Nearby streets (≤0.5 mi)"
              stats={result.nearby}
              onUse={onUseHomePrice}
            />
            <BucketTile
              label={result.districtName ?? "School district"}
              stats={result.district}
              onUse={onUseHomePrice}
            />
          </div>
          {result.comps.length > 0 ? (
            <div className="table-scroll comps-table">
              <table className="amort">
                <caption className="sr-only">
                  Recent comparable sales with price, date, size, distance, and bucket tags.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Address</th>
                    <th scope="col">Sold</th>
                    <th scope="col">Price</th>
                    <th scope="col">Bd</th>
                    <th scope="col">Ba</th>
                    <th scope="col">Sqft</th>
                    <th scope="col">Dist</th>
                    <th scope="col">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comps.map((comp) => (
                    <tr key={comp.id}>
                      <td className="comps-addr">{comp.address}</td>
                      <td>{fmtSoldDate(comp.dateSold)}</td>
                      <td>{fmtUsd(comp.price)}</td>
                      <td>{comp.beds ?? "—"}</td>
                      <td>{comp.baths ?? "—"}</td>
                      <td>{comp.sqft ?? "—"}</td>
                      <td>{fmtMiles(comp.distanceKm)}</td>
                      <td className="comps-tags">
                        {comp.sameStreet ? <span className="badge">Street</span> : null}
                        {comp.nearby ? <span className="badge">Nearby</span> : null}
                        {comp.inDistrict ? <span className="badge">District</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="hint">No similar sales in the window — try widening beds/baths.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
