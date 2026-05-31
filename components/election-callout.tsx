"use client";

import { useEffect, useState } from "react";
import { Pencil, Check } from "lucide-react";

// Editable "campaign focus" callout that replaces the static days-to-election card.
// Persists per-campaign to localStorage for now; moves to a campaign setting in the live-HQ slice.
export function ElectionCallout({
  daysLeft = 171,
  dateLabel = "Nov 3",
  cyclePct = 68,
  campaignId = "default",
}: {
  daysLeft?: number;
  dateLabel?: string;
  cyclePct?: number;
  campaignId?: string;
}) {
  const key = `candi_focus_${campaignId}`;
  const [focus, setFocus] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    try {
      setFocus(localStorage.getItem(key) ?? "");
    } catch {
      /* localStorage unavailable */
    }
  }, [key]);

  const save = () => {
    const v = draft.trim();
    setFocus(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* ignore */
    }
    setEditing(false);
  };

  return (
    <div className="election-callout">
      <div className="ec-count">
        <div className="ec-days">
          {daysLeft}
          <span>days to election · {dateLabel}</span>
        </div>
        <div className="ec-bar"><i style={{ width: `${cyclePct}%` }} /></div>
        <div className="ec-cycle mono">cycle {cyclePct}%</div>
      </div>

      <div className="ec-focus">
        {editing ? (
          <div className="ec-edit">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="Set the campaign's focus for this stretch — e.g. “Chase 4,900 VBM ballots + knock all 3/4 super-voters in K-precincts.”"
              autoFocus
              rows={2}
            />
            <button className="btn primary" type="button" onClick={save}>
              <Check style={{ width: 13, height: 13 }} /> Save
            </button>
          </div>
        ) : (
          <button className="ec-focus-view" type="button" onClick={() => { setDraft(focus); setEditing(true); }}>
            <span className="ec-focus-label">Campaign focus</span>
            <span className={focus ? "ec-focus-text" : "ec-focus-text empty"}>
              {focus || "Add a focus or goal for the team…"}
            </span>
            <Pencil className="ec-pencil" style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>
    </div>
  );
}
