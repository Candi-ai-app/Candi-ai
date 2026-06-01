"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Sparkles, X, ChevronDown } from "lucide-react";

type Suggestion = {
  id: string;
  c: number;
  title: string;
  body: string;
  tags: string[];
};

// Static for now — wiring "Candi suggests" to the modeling/AI pipeline is a
// separate feature, so it stays client-side mock data flagged "Preview".
const SUGGESTIONS: Suggestion[] = [
  {
    id: "recanvass-12s",
    c: 0.86,
    title: "Re-canvass Precinct 12S tomorrow AM",
    body: "67% of 12S doors were not-home 2–5 PM. Modeled response jumps to 41% at 10 AM Saturday.",
    tags: ["Turf", "Modeling"],
  },
  {
    id: "renter-relief",
    c: 0.79,
    title: "Move 220 renters to the renter-relief script",
    body: "High-persuasion renters in 07N respond better to housing messaging than the default.",
    tags: ["Script", "Persuasion"],
  },
  {
    id: "vbm-chase",
    c: 0.72,
    title: "Text 480 outstanding VBM ballots",
    body: "Chase vote-by-mail no-returns before the weekend to lift the 25% return rate.",
    tags: ["Texting", "GOTV"],
  },
];

const DEFAULT_VISIBLE = 2;

export function CandiSuggests() {
  const [items, setItems] = useState<Suggestion[]>(SUGGESTIONS);
  const [expanded, setExpanded] = useState(false);

  function dismiss(id: string) {
    setItems((prev) => {
      const next = prev.filter((s) => s.id !== id);
      // Collapsing avoids a dangling "View less" once the list fits in the default.
      if (next.length <= DEFAULT_VISIBLE) setExpanded(false);
      return next;
    });
  }

  const visible = expanded ? items : items.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = items.length - DEFAULT_VISIBLE;

  return (
    <div className="card ai">
      <div className="card-head">
        <span className="ai-mark">AI</span>
        <h3>Candi suggests</h3>
        <span className="sub">
          · {items.length} {items.length === 1 ? "action" : "actions"}
        </span>
        <span className="tag" style={{ marginLeft: "auto" }}>
          Preview
        </span>
      </div>
      <div className="card-body flush">
        {items.length === 0 ? (
          <div className="cs-empty">
            <span className="cs-empty-ico" aria-hidden>
              <Sparkles strokeWidth={1.75} />
            </span>
            <b>All caught up</b>
            <span className="muted">No suggestions right now.</span>
          </div>
        ) : (
          <>
            {visible.map((s) => (
              <div className="insight" key={s.id}>
                <div className="cs-row">
                  <div className="conf-ring" style={{ ["--c"]: s.c } as CSSProperties}>
                    <span>{Math.round(s.c * 100)}</span>
                  </div>
                  <div className="col cs-main">
                    <b className="cs-title">{s.title}</b>
                    <span className="muted cs-body">
                      {s.body}
                    </span>
                    <div className="cs-foot">
                      {s.tags.map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                      <button
                        type="button"
                        className="cs-dismiss"
                        onClick={() => dismiss(s.id)}
                        aria-label={`Dismiss: ${s.title}`}
                      >
                        <X strokeWidth={2} aria-hidden />
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {hiddenCount > 0 && (
              <button
                type="button"
                className="cs-more"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
              >
                {expanded ? "View less" : `View more (${hiddenCount})`}
                <ChevronDown className={"cs-more-chev" + (expanded ? " up" : "")} strokeWidth={2} aria-hidden />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
