"use client";

import { useState } from "react";
import { Plus, ArrowRight, MapPin, CalendarDays } from "lucide-react";
import { selectCampaign, createCampaign } from "@/app/select/actions";

export type PickerCampaign = {
  id: string;
  candidate: string;
  office: string | null;
  district: string | null;
  election_date: string | null;
};

function formatDate(d: string | null): string | null {
  if (!d) return null;
  // d is a date string like "2026-11-03"; render without timezone shift.
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !day) return d;
  const date = new Date(Date.UTC(y, m - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function CampaignPicker({
  campaigns,
  canCreate,
  email,
}: {
  campaigns: PickerCampaign[];
  canCreate: boolean;
  email?: string;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="select-screen">
      <div className="select-shell">
        <header className="select-head">
          <div className="brand" style={{ fontSize: 16 }}>
            <span className="brand-mark">C</span>
            Candi <small>v1·MVP</small>
          </div>
          <h1 className="select-title serif">Choose a campaign</h1>
          <p className="muted select-sub">
            {campaigns.length > 0
              ? "Select the campaign you’re working on today."
              : "You don’t have access to any campaigns yet."}
            {email ? (
              <>
                {" "}
                Signed in as <b style={{ color: "var(--ink-2)", fontWeight: 600 }}>{email}</b>.
              </>
            ) : null}
          </p>
        </header>

        <div className="select-grid">
          {campaigns.map((c) => {
            const date = formatDate(c.election_date);
            const meta = [c.office, c.district].filter(Boolean).join(" · ");
            return (
              <form key={c.id} action={selectCampaign.bind(null, c.id)}>
                <button type="submit" className="campaign-card" aria-label={`Open ${c.candidate}`}>
                  <div className="campaign-card-top">
                    <span className="campaign-avatar">{initials(c.candidate)}</span>
                    <ArrowRight className="campaign-arrow" />
                  </div>
                  <div className="campaign-name">{c.candidate}</div>
                  <div className="campaign-meta">
                    {meta ? (
                      <span className="campaign-meta-row">
                        <MapPin className="campaign-ico" />
                        {meta}
                      </span>
                    ) : (
                      <span className="campaign-meta-row muted">No office set</span>
                    )}
                    {date ? (
                      <span className="campaign-meta-row">
                        <CalendarDays className="campaign-ico" />
                        {date}
                      </span>
                    ) : null}
                  </div>
                </button>
              </form>
            );
          })}

          {canCreate &&
            (creating ? (
              <form action={createCampaign} className="campaign-card campaign-card-form">
                <div className="campaign-name" style={{ marginBottom: 4 }}>
                  New campaign
                </div>
                <input
                  className="scr-input"
                  name="candidate"
                  placeholder="Candidate name *"
                  required
                  autoFocus
                  autoComplete="off"
                />
                <input className="scr-input" name="office" placeholder="Office (optional)" autoComplete="off" />
                <input className="scr-input" name="district" placeholder="District (optional)" autoComplete="off" />
                <label className="campaign-field-label">
                  Election date
                  <input className="scr-input" name="election_date" type="date" />
                </label>
                <div className="row" style={{ gap: 8, marginTop: 2 }}>
                  <button type="submit" className="btn accent" style={{ flex: 1, justifyContent: "center", height: 34 }}>
                    Create campaign
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ height: 34 }}
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="campaign-card campaign-card-new" onClick={() => setCreating(true)}>
                <span className="campaign-new-icon">
                  <Plus />
                </span>
                <span className="campaign-new-label">New campaign</span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Start a fresh campaign workspace
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
