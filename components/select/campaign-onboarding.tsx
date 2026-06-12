"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
  ImagePlus,
  X,
} from "lucide-react";
import { createCampaign } from "@/app/select/actions";
import { createClient } from "@/utils/supabase/client";
import type { AreaState } from "@/lib/areas";

type Filled = {
  candidate?: string;
  office?: string;
  state?: string;
  county?: string;
  district?: string;
};

export type ResumeDraft = {
  id: string;
  candidate: string | null;
  office: string | null;
  district: string | null;
  state: string | null;
  county: string | null;
  election_date: string | null;
  photo_url: string | null;
};

const STEPS = ["Basics", "Area", "Review"] as const;

/** An org the user may create a campaign in (owner/director), with a label. */
export type EligibleOrg = { id: string; name: string };

export function CampaignOnboarding({
  areas,
  sampleCount,
  draft = null,
  eligibleOrgs = [],
}: {
  areas: AreaState[];
  sampleCount: number;
  /** When present, prefill + UPDATE this draft instead of creating a new one. */
  draft?: ResumeDraft | null;
  /**
   * Orgs the user may create this campaign in. 0 or 1 → no picker (single-org is
   * the common case and shows zero new UI). 2+ → a "Workspace" select is shown
   * and the chosen org_id is posted with the form.
   */
  eligibleOrgs?: EligibleOrg[];
}) {
  const [step, setStep] = useState(0);

  // Which workspace to create the campaign in. With a single eligible org we
  // preselect it (the server would pick it anyway); with several it starts
  // empty so the user must choose. Only surfaced in the UI when 2+ exist.
  const [orgId, setOrgId] = useState(eligibleOrgs.length === 1 ? eligibleOrgs[0].id : "");
  const multiOrg = eligibleOrgs.length > 1;

  // Error returned by createCampaign (e.g. "Multiple workspaces — choose one",
  // "Not authorised for that workspace"). On success the action redirects, so
  // this only ever holds a real failure.
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form fields — prefilled from the draft when resuming.
  const [candidate, setCandidate] = useState(draft?.candidate ?? "");
  const [office, setOffice] = useState(draft?.office ?? "");
  const [state, setState] = useState(draft?.state ?? "");
  const [county, setCounty] = useState(draft?.county ?? "");
  const [district, setDistrict] = useState(draft?.district ?? "");
  const [electionDate, setElectionDate] = useState(draft?.election_date ?? "");

  // Candidate photo (optional). `photoUrl` holds an already-uploaded URL (e.g.
  // from the resumed draft); `photoFile` holds a freshly chosen file to upload.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(draft?.photo_url ?? null);
  const [photoUrl, setPhotoUrl] = useState<string>(draft?.photo_url ?? "");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Image must be under 5 MB.");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoUrl("");
    setPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Upload the chosen photo to the public `candidates` bucket and return its
   * public URL. Returns the existing URL if no new file was picked, or null on
   * failure (the wizard then proceeds without a photo rather than blocking).
   */
  async function uploadPhoto(): Promise<string | null> {
    if (!photoFile) return photoUrl || null;
    try {
      const supabase = createClient();
      const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      // Stable folder per draft; otherwise a unique throwaway prefix.
      const prefix = draft?.id ?? `new-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const path = `${prefix}/${Date.now()}.${ext || "jpg"}`;
      const { error } = await supabase.storage
        .from("candidates")
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
      if (error) {
        console.error("photo upload:", error.message);
        return photoUrl || null;
      }
      const { data } = supabase.storage.from("candidates").getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.error("photo upload threw:", e);
      return photoUrl || null;
    }
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

  // Step 0 is complete once the required candidate name is set — and, for
  // multi-org users, once a workspace is chosen (so the picker can't be skipped).
  const canNext0 = candidate.trim().length > 0 && (!multiOrg || !!orgId);
  const stateObj = areas.find((a) => a.state === state);
  const willSeed = Boolean(stateObj); // we can place voters once a known state is chosen

  function submit() {
    if (submitting) return;
    // Guard the only client-side precondition for the picker: a multi-org user
    // must choose a workspace. (The server enforces this too — this is just a
    // friendlier inline message before the round-trip.)
    if (multiOrg && !orgId) {
      setSubmitError("Choose a workspace for this campaign.");
      return;
    }
    setSubmitError(null);
    startSubmit(async () => {
      // Upload the photo (if any) before the action runs — the action redirects,
      // so we can't do client work after it. Failure is non-blocking.
      const url = await uploadPhoto();
      const fd = new FormData();
      if (draft?.id) fd.set("id", draft.id); // resume → UPDATE in place
      fd.set("candidate", candidate.trim());
      fd.set("office", office.trim());
      fd.set("state", state);
      fd.set("county", county);
      fd.set("district", district);
      fd.set("election_date", electionDate);
      if (url) fd.set("photo_url", url);
      // The chosen workspace. createCampaign reads org_id from the FormData and
      // verifies the user is owner/director there; it picks the lone org itself
      // when only one is eligible, so sending it for the single-org case is safe.
      if (orgId) fd.set("org_id", orgId);
      // createCampaign seeds voters (if none yet) then redirects to "/" on
      // success (the redirect throws NEXT_REDIRECT, which propagates past this
      // await). It only RETURNS a value on failure — surface that inline.
      const res = await createCampaign(fd);
      if (res && !res.ok) setSubmitError(res.error);
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
          <h1 className="select-title serif">{draft ? "Finish setup" : "New campaign"}</h1>
          <p className="muted select-sub">
            {draft
              ? "Pick up where you left off — review the details below and finish setting up your workspace."
              : "Set up your workspace in three quick steps. We’ll create a realistic sample voter set so you can explore right away."}
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
              {/* Workspace picker — only for users who are owner/director in more
                  than one org. Single-org users see nothing here (zero change). */}
              {multiOrg && (
                <Field label="Workspace" required htmlFor="onb-org">
                  <select
                    id="onb-org"
                    className="scr-input onb-select"
                    value={orgId}
                    onChange={(e) => {
                      setOrgId(e.target.value);
                      setSubmitError(null);
                    }}
                  >
                    <option value="">Select a workspace…</option>
                    {eligibleOrgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name || "Untitled workspace"}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

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

              <div className="onb-field">
                <span className="onb-field-head">
                  <span className="onb-label">
                    Candidate photo
                    <span className="muted onb-optional"> (optional)</span>
                  </span>
                </span>
                <div className="onb-photo">
                  <div className="onb-photo-preview" aria-hidden={!photoPreview}>
                    {photoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local object URL / remote Storage URL preview
                      <img src={photoPreview} alt="Candidate preview" />
                    ) : (
                      <ImagePlus className="onb-photo-placeholder" aria-hidden />
                    )}
                  </div>
                  <div className="onb-photo-actions">
                    <input
                      ref={fileInputRef}
                      id="onb-photo"
                      type="file"
                      accept="image/*"
                      className="onb-photo-input"
                      onChange={onPhotoChange}
                    />
                    <button
                      type="button"
                      className="btn onb-photo-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus style={{ width: 14, height: 14 }} />
                      {photoPreview ? "Change photo" : "Upload photo"}
                    </button>
                    {photoPreview && (
                      <button type="button" className="btn ghost onb-photo-remove" onClick={clearPhoto}>
                        <X style={{ width: 14, height: 14 }} />
                        Remove
                      </button>
                    )}
                    <p className="onb-photo-hint muted">
                      {photoError ?? "JPG or PNG, up to 5 MB. Shows on the campaign card."}
                    </p>
                  </div>
                </div>
              </div>
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
              <Summary label="Photo" value={photoPreview ? "Added" : "Not set"} />
              {draft && (
                <div className="onb-review-seed">
                  <Check className="onb-seed-ico" />
                  Finishing setup for your existing draft — no duplicate campaign is created.
                </div>
              )}
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

          {/* Submit error (e.g. workspace not chosen / not authorised). Reuses the
              same rose error pill the edit-campaign modal uses for action errors. */}
          {submitError && (
            <div className="edit-modal-error" role="alert" style={{ marginTop: 14 }}>
              ⚠ {submitError}
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
                {submitting ? "Saving…" : draft ? "Finish setup" : "Create campaign"}
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
