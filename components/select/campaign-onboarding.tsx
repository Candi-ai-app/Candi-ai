"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Check,
  MapPin,
  CalendarDays,
  Users,
  Loader2,
} from "lucide-react";
import { createCampaign } from "@/app/select/actions";
import type { AreaState } from "@/lib/areas";

type Filled = {
  candidate?: string;
  office?: string;
  state?: string;
  county?: string;
  district?: string;
};

const STEPS = ["Basics", "Area", "Review"] as const;

export function CampaignOnboarding({
  areas,
  sampleCount,
}: {
  areas: AreaState[];
  sampleCount: number;
}) {
  const [step, setStep] = useState(0);

  // Form fields.
  const [candidate, setCandidate] = useState("");
  const [office, setOffice] = useState("");
  const [state, setState] = useState("");
  const [county, setCounty] = useState("");
  const [district, setDistrict] = useState("");
  const [electionDate, setElectionDate] = useState("");

  // Which fields Candi auto-filled (for the subtle hint).
  const [aiFilled, setAiFilled] = useState<Set<keyof Filled>>(new Set());
  const [describe, setDescribe] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [submitting, startSubmit] = useTransition();

  // Filtered picklists from the curated areas tree.
  const counties = useMemo(
    () => areas.find((a) => a.state === state)?.counties ?? [],
    [areas, state]
  );
  const districts = useMemo(
    () => counties.find((c) => c.county === county)?.districts ?? [],
    [counties, county]
  );

  function clearAi(field: keyof Filled) {
    setAiFilled((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  // State drives the county/district options, so reset downstream picks.
  function onStateChange(v: string) {
    setState(v);
    setCounty("");
    setDistrict("");
    clearAi("state");
    clearAi("county");
    clearAi("district");
  }
  function onCountyChange(v: string) {
    setCounty(v);
    setDistrict("");
    clearAi("county");
    clearAi("district");
  }

  async function autoFill() {
    const text = describe.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiNote(data?.error ?? "Couldn't auto-fill. Please enter the details manually.");
        return;
      }

      const filled = new Set<keyof Filled>();
      const f = data as Filled;
      if (f.candidate) {
        setCandidate(f.candidate);
        filled.add("candidate");
      }
      if (f.office) {
        setOffice(f.office);
        filled.add("office");
      }
      // Only accept area values that exist in our curated tree so the
      // picklists stay valid; otherwise leave for manual selection.
      const matchState = f.state ? areas.find((a) => a.state.toLowerCase() === f.state!.toLowerCase()) : undefined;
      if (matchState) {
        setState(matchState.state);
        filled.add("state");
        const matchCounty = f.county
          ? matchState.counties.find((c) => c.county.toLowerCase() === f.county!.toLowerCase())
          : undefined;
        if (matchCounty) {
          setCounty(matchCounty.county);
          filled.add("county");
          const matchDistrict = f.district
            ? matchCounty.districts.find((d) => d.toLowerCase() === f.district!.toLowerCase())
            : undefined;
          if (matchDistrict) {
            setDistrict(matchDistrict);
            filled.add("district");
          } else {
            setCounty(matchCounty.county);
            setDistrict("");
          }
        } else {
          setCounty("");
          setDistrict("");
        }
      }

      setAiFilled(filled);
      setAiNote(
        filled.size > 0
          ? "Filled by Candi — review and edit anything below."
          : "Candi couldn't pull clear details. Please enter them manually."
      );
    } catch {
      setAiNote("Couldn't reach Candi. Please enter the details manually.");
    } finally {
      setAiBusy(false);
    }
  }

  const canNext0 = candidate.trim().length > 0;
  const stateObj = areas.find((a) => a.state === state);
  const willSeed = Boolean(stateObj); // we can place voters once a known state is chosen

  function submit() {
    if (submitting) return;
    const fd = new FormData();
    fd.set("candidate", candidate.trim());
    fd.set("office", office.trim());
    fd.set("state", state);
    fd.set("county", county);
    fd.set("district", district);
    fd.set("election_date", electionDate);
    startSubmit(() => {
      // createCampaign seeds voters then redirects to "/".
      void createCampaign(fd);
    });
  }

  return (
    <div className="select-screen">
      <div className="select-shell onb-shell">
        <header className="select-head">
          <div className="brand" style={{ fontSize: 16 }}>
            <span className="brand-mark">C</span>
            Candi <small>v1·MVP</small>
          </div>
          <h1 className="select-title serif">New campaign</h1>
          <p className="muted select-sub">
            Set up your workspace in three quick steps. We&rsquo;ll create a realistic sample
            voter set so you can explore right away.
          </p>
        </header>

        {/* Step indicator */}
        <ol className="onb-steps" aria-label="Progress">
          {STEPS.map((label, i) => {
            const stateCls = i === step ? "current" : i < step ? "done" : "upcoming";
            return (
              <li key={label} className={`onb-step ${stateCls}`}>
                <span className="onb-step-dot">{i < step ? <Check /> : i + 1}</span>
                <span className="onb-step-label">{label}</span>
              </li>
            );
          })}
        </ol>

        <div className="onb-card">
          {/* ── Step 1: Basics + AI assist ─────────────────────────────── */}
          {step === 0 && (
            <div className="onb-fields">
              <div className="onb-ai">
                <label className="onb-label" htmlFor="onb-describe">
                  <Sparkles className="onb-label-ico" />
                  Describe your race <span className="muted onb-optional">(optional)</span>
                </label>
                <textarea
                  id="onb-describe"
                  className="scr-textarea onb-textarea"
                  placeholder="e.g. Mira Reyes is running for State Senate District 12 in Allegheny County, Pennsylvania."
                  value={describe}
                  onChange={(e) => setDescribe(e.target.value)}
                  rows={3}
                />
                <div className="row onb-ai-row">
                  <button
                    type="button"
                    className="btn accent onb-ai-btn"
                    onClick={autoFill}
                    disabled={aiBusy || !describe.trim()}
                  >
                    {aiBusy ? (
                      <Loader2 className="onb-spin" />
                    ) : (
                      <Sparkles style={{ width: 14, height: 14 }} />
                    )}
                    {aiBusy ? "Reading…" : "Auto-fill with Candi"}
                  </button>
                  {aiNote && <span className="muted onb-ai-note">{aiNote}</span>}
                </div>
              </div>

              <div className="onb-divider">
                <span>or enter manually</span>
              </div>

              <Field
                label="Candidate"
                required
                filled={aiFilled.has("candidate")}
                htmlFor="onb-candidate"
              >
                <input
                  id="onb-candidate"
                  className="scr-input"
                  value={candidate}
                  onChange={(e) => {
                    setCandidate(e.target.value);
                    clearAi("candidate");
                  }}
                  placeholder="Candidate name"
                  autoComplete="off"
                />
              </Field>

              <Field label="Office" filled={aiFilled.has("office")} htmlFor="onb-office">
                <input
                  id="onb-office"
                  className="scr-input"
                  value={office}
                  onChange={(e) => {
                    setOffice(e.target.value);
                    clearAi("office");
                  }}
                  placeholder="e.g. State Senate (optional)"
                  autoComplete="off"
                />
              </Field>
            </div>
          )}

          {/* ── Step 2: Area ───────────────────────────────────────────── */}
          {step === 1 && (
            <div className="onb-fields">
              <Field label="State" filled={aiFilled.has("state")} htmlFor="onb-state">
                <select
                  id="onb-state"
                  className="scr-input onb-select"
                  value={state}
                  onChange={(e) => onStateChange(e.target.value)}
                >
                  <option value="">Select a state…</option>
                  {areas.map((a) => (
                    <option key={a.abbr} value={a.state}>
                      {a.state}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="County" filled={aiFilled.has("county")} htmlFor="onb-county">
                <select
                  id="onb-county"
                  className="scr-input onb-select"
                  value={county}
                  onChange={(e) => onCountyChange(e.target.value)}
                  disabled={!state}
                >
                  <option value="">{state ? "Select a county…" : "Pick a state first"}</option>
                  {counties.map((c) => (
                    <option key={c.county} value={c.county}>
                      {c.county}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="District / office" filled={aiFilled.has("district")} htmlFor="onb-district">
                <select
                  id="onb-district"
                  className="scr-input onb-select"
                  value={district}
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    clearAi("district");
                  }}
                  disabled={!county}
                >
                  <option value="">{county ? "Select a district…" : "Pick a county first"}</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Election date" htmlFor="onb-date">
                <input
                  id="onb-date"
                  type="date"
                  className="scr-input"
                  value={electionDate}
                  onChange={(e) => setElectionDate(e.target.value)}
                />
              </Field>

              <p className="onb-seed-note">
                <Users className="onb-seed-ico" />
                {willSeed ? (
                  <>
                    ~{sampleCount.toLocaleString()} sample voters will be created
                    {county ? <> in {county}</> : state ? <> in {state}</> : null}.
                  </>
                ) : (
                  <>Pick a state to generate sample voters for that area.</>
                )}
              </p>
            </div>
          )}

          {/* ── Step 3: Review + Create ────────────────────────────────── */}
          {step === 2 && (
            <div className="onb-review">
              <Summary label="Candidate" value={candidate.trim() || "—"} />
              <Summary label="Office" value={office.trim() || "Not set"} icon={<MapPin />} />
              <Summary
                label="Area"
                value={
                  [county, state].filter(Boolean).join(", ") || "Not set"
                }
                icon={<MapPin />}
              />
              <Summary label="District" value={district || "Not set"} />
              <Summary
                label="Election date"
                value={electionDate || "Not set"}
                icon={<CalendarDays />}
              />
              <div className="onb-review-seed">
                <Users className="onb-seed-ico" />
                {willSeed ? (
                  <>
                    Creating <b>~{sampleCount.toLocaleString()}</b> sample voters scoped to this
                    area. Your Voters list and header stats go live immediately.
                  </>
                ) : (
                  <>
                    A generic sample voter set will be created (no area selected). Your Voters
                    list goes live immediately.
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Footer nav ─────────────────────────────────────────────── */}
          <div className="onb-footer">
            {step === 0 ? (
              <Link href="/select" className="btn onb-back">
                <ArrowLeft style={{ width: 14, height: 14 }} />
                Cancel
              </Link>
            ) : (
              <button
                type="button"
                className="btn onb-back"
                onClick={() => setStep((s) => s - 1)}
                disabled={submitting}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} />
                Back
              </button>
            )}

            {step < 2 ? (
              <button
                type="button"
                className="btn accent onb-next"
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 0 && !canNext0}
              >
                Continue
                <ArrowRight style={{ width: 14, height: 14 }} />
              </button>
            ) : (
              <button
                type="button"
                className="btn accent onb-next"
                onClick={submit}
                disabled={submitting || !canNext0}
              >
                {submitting ? <Loader2 className="onb-spin" /> : <Check style={{ width: 14, height: 14 }} />}
                {submitting ? "Creating…" : "Create campaign"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  filled,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  filled?: boolean;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className="onb-field" htmlFor={htmlFor}>
      <span className="onb-field-head">
        <span className="onb-label">
          {label}
          {required ? <span className="onb-req"> *</span> : null}
        </span>
        {filled ? (
          <span className="onb-filled">
            <Sparkles style={{ width: 10, height: 10 }} />
            filled by Candi
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function Summary({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="onb-summary-row">
      <span className="onb-summary-label">{label}</span>
      <span className="onb-summary-value">
        {icon ? <span className="onb-summary-ico">{icon}</span> : null}
        {value}
      </span>
    </div>
  );
}
