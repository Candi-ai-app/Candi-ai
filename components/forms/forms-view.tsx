"use client";

import { useMemo, useState, useTransition } from "react";
import { FileText, Download, Loader2, CheckCircle2, Printer } from "lucide-react";
import {
  generateFormBatch,
  getBatchDownloadUrl,
  type FormTemplateItem,
  type FormBatchItem,
} from "@/app/(app)/forms/actions";

const MAX_VOTERS = 500;

/** "2026-06-12T14:03:22Z" → "Jun 12, 2:03 PM" (viewer-local). */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type GenState =
  | { phase: "idle" }
  | { phase: "working"; count: number }
  | { phase: "done"; count: number; signedUrl: string }
  | { phase: "error"; message: string };

export function FormsView({
  templates,
  precincts,
  batches,
}: {
  templates: FormTemplateItem[];
  /** 2026-normalized precinct codes + voter counts (same source as the turf map). */
  precincts: { code: string; voters: number }[];
  batches: FormBatchItem[];
}) {
  const sortedPrecincts = useMemo(
    () => [...precincts].sort((a, b) => a.code.localeCompare(b.code)),
    [precincts]
  );
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [precinct, setPrecinct] = useState<string>("");
  const [limit, setLimit] = useState<number>(MAX_VOTERS);
  const [gen, setGen] = useState<GenState>({ phase: "idle" });
  const [, startGenerate] = useTransition();
  const [fetchingBatch, setFetchingBatch] = useState<string | null>(null);

  const selectedPrecinct = sortedPrecincts.find((p) => p.code === precinct) ?? null;
  const willGenerate = selectedPrecinct
    ? Math.min(selectedPrecinct.voters, Math.min(Math.max(limit || 1, 1), MAX_VOTERS))
    : 0;
  const working = gen.phase === "working";
  const canGenerate = !!templateId && !!selectedPrecinct && willGenerate > 0 && !working;

  const onGenerate = () => {
    if (!canGenerate || !selectedPrecinct) return;
    setGen({ phase: "working", count: willGenerate });
    startGenerate(async () => {
      const res = await generateFormBatch({
        templateId,
        precinct: selectedPrecinct.code,
        limit: Math.min(Math.max(limit || 1, 1), MAX_VOTERS),
      });
      if (res.ok) setGen({ phase: "done", count: res.count, signedUrl: res.signedUrl });
      else setGen({ phase: "error", message: res.error });
    });
  };

  const onBatchDownload = async (batchId: string) => {
    setFetchingBatch(batchId);
    try {
      const res = await getBatchDownloadUrl(batchId);
      if (res.ok) window.location.assign(res.url);
      else setGen({ phase: "error", message: res.error });
    } finally {
      setFetchingBatch(null);
    }
  };

  return (
    <div className="forms">
      <div className="module-head">
        <div>
          <h1>Forms</h1>
          <div className="sub">
            Prefill official forms for a voter list — built for vote-by-mail pushes. Print,
            canvass, done.
          </div>
        </div>
      </div>

      <div className="forms-body">
        <div className="forms-main">
          {/* ── 1 · Template ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="card-head">
              <h3>1 · Form template</h3>
              <span className="sub">New forms are added as templates — no rebuild.</span>
            </div>
            <div className="card-body forms-tpl-list">
              {templates.length === 0 && (
                <div className="forms-empty">No form templates available yet.</div>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={"forms-tpl" + (templateId === t.id ? " selected" : "")}
                  onClick={() => setTemplateId(t.id)}
                  disabled={working}
                >
                  <span className="forms-tpl-ico">
                    <FileText style={{ width: 16, height: 16 }} />
                  </span>
                  <span className="forms-tpl-info">
                    <b>{t.name}</b>
                    {t.builtIn ? (
                      <span className="forms-tpl-note">
                        Official statewide form (DS-DE 160, dos.fl.gov). Voter adds DOB, ID
                        number &amp; signature by hand.
                      </span>
                    ) : (
                      <span className="forms-tpl-note">Campaign template</span>
                    )}
                  </span>
                  <span className="forms-tpl-tags">
                    {t.builtIn && <span className="tag teal">Official FL form</span>}
                    <span className="tag und">
                      {t.mode === "acroform" ? "Fillable PDF" : "Stamped"} · {t.fieldCount}{" "}
                      fields
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── 2 · Voters ───────────────────────────────────────────────── */}
          <div className="card">
            <div className="card-head">
              <h3>2 · Voters</h3>
              <span className="sub">One prefilled form per voter, merged into a single PDF.</span>
            </div>
            <div className="card-body">
              <div className="forms-pick-row">
                <label className="forms-lbl" htmlFor="forms-precinct">
                  Precinct
                </label>
                <select
                  id="forms-precinct"
                  className="map-select forms-select"
                  value={precinct}
                  onChange={(e) => setPrecinct(e.target.value)}
                  disabled={working}
                >
                  <option value="">
                    {sortedPrecincts.length ? "Choose a precinct…" : "No precincts on file"}
                  </option>
                  {sortedPrecincts.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} · {p.voters.toLocaleString()} voters
                    </option>
                  ))}
                </select>

                <label className="forms-lbl" htmlFor="forms-limit">
                  Cap
                </label>
                <input
                  id="forms-limit"
                  className="map-select forms-cap"
                  type="number"
                  min={1}
                  max={MAX_VOTERS}
                  value={limit}
                  onChange={(e) =>
                    setLimit(Math.min(Math.max(Number(e.target.value) || 1, 1), MAX_VOTERS))
                  }
                  disabled={working}
                />
              </div>
              <div className="forms-preview">
                {sortedPrecincts.length === 0 ? (
                  <>Import a voter file with precincts to start generating forms.</>
                ) : selectedPrecinct ? (
                  <>
                    Will generate <b className="mono">{willGenerate.toLocaleString()}</b>{" "}
                    prefilled {willGenerate === 1 ? "form" : "forms"}
                    {selectedPrecinct.voters > willGenerate && (
                      <span className="muted">
                        {" "}
                        (first {willGenerate.toLocaleString()} of{" "}
                        {selectedPrecinct.voters.toLocaleString()}, A→Z)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="muted">Pick a precinct to preview the batch size.</span>
                )}
              </div>
            </div>
          </div>

          {/* ── 3 · Generate ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="card-body forms-gen">
              <button
                type="button"
                className="btn primary"
                disabled={!canGenerate}
                onClick={onGenerate}
              >
                {working ? (
                  <>
                    <Loader2 className="ico vot-spin" /> Generating{" "}
                    {gen.phase === "working" ? gen.count.toLocaleString() : ""} forms…
                  </>
                ) : (
                  <>
                    <Printer className="ico" /> Generate forms
                  </>
                )}
              </button>
              {working && (
                <span className="forms-gen-note muted">
                  Filling one form per voter — large batches can take up to a minute.
                </span>
              )}

              {gen.phase === "done" && (
                <div className="forms-result">
                  <CheckCircle2 style={{ width: 16, height: 16, color: "var(--accent-ink)" }} />
                  <div className="forms-result-info">
                    <b>
                      {gen.count.toLocaleString()} {gen.count === 1 ? "form" : "forms"} ready
                    </b>
                    <span className="muted">One merged PDF — link valid for about an hour.</span>
                  </div>
                  <a className="btn accent" href={gen.signedUrl}>
                    <Download className="ico" /> Download PDF
                  </a>
                </div>
              )}
              {gen.phase === "error" && <div className="forms-error">{gen.message}</div>}
            </div>
          </div>
        </div>

        {/* ── Recent batches ─────────────────────────────────────────────── */}
        <div className="forms-side">
          <div className="card">
            <div className="card-head">
              <h3>Recent batches</h3>
              {batches.length > 0 && <span className="sub">{batches.length} shown</span>}
            </div>
            <div className="card-body flush">
              {batches.length === 0 ? (
                <div className="forms-empty">
                  No batches yet — pick a precinct and generate your first.
                </div>
              ) : (
                <ul className="forms-batches">
                  {batches.map((b) => (
                    <li key={b.id} className="forms-batch">
                      <div className="forms-batch-info">
                        <b>
                          {b.voterCount.toLocaleString()} {b.voterCount === 1 ? "form" : "forms"}
                          {b.precinct && <span className="tag und">{b.precinct}</span>}
                        </b>
                        <span className="muted">
                          {fmtWhen(b.createdAt)} · {b.templateName ?? "Template removed"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn ghost forms-batch-dl"
                        title="Download (fresh link)"
                        disabled={fetchingBatch === b.id}
                        onClick={() => onBatchDownload(b.id)}
                      >
                        {fetchingBatch === b.id ? (
                          <Loader2 className="ico vot-spin" />
                        ) : (
                          <Download className="ico" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
