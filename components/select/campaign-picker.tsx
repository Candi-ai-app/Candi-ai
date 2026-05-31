"use client";

import Link from "next/link";
import { Plus, ArrowRight, MapPin, CalendarDays } from "lucide-react";
import { selectCampaign } from "@/app/select/actions";

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
            const isDraft = !meta;
            return (
              <form key={c.id} action={selectCampaign.bind(null, c.id)}>
                <button type="submit" className="campaign-card" aria-label={`Open ${c.candidate}`}>
                  <div className="campaign-card-top">
                    <span className="campaign-avatar">{initials(c.candidate)}</span>
                    <span className="campaign-card-top-right">
                      {isDraft && <span className="campaign-draft">Draft</span>}
                      <ArrowRight className="campaign-arrow" />
                    </span>
                  </div>
                  <div className="campaign-name">{c.candidate}</div>
                  <div className="campaign-meta">
                    {meta ? (
                      <span className="campaign-meta-row">
                        <MapPin className="campaign-ico" />
                        {meta}
                      </span>
                    ) : (
                      <span className="campaign-meta-row muted">Finish setup to add voters</span>
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

          {canCreate && (
            <Link href="/select/new" className="campaign-card campaign-card-new">
              <span className="campaign-new-icon">
                <Plus />
              </span>
              <span className="campaign-new-label">New campaign</span>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Guided setup with a sample voter file
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
