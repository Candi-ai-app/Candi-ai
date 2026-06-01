"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  CalendarDays,
  MoreVertical,
  Trash2,
  PencilLine,
  Loader2,
} from "lucide-react";
import { selectCampaign, deleteCampaign } from "@/app/select/actions";
import type { PickerCampaign } from "@/components/select/campaign-picker";

function formatDate(d: string | null): string | null {
  if (!d) return null;
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

export function CampaignCard({
  campaign: c,
  canManage,
}: {
  campaign: PickerCampaign;
  canManage: boolean;
}) {
  const date = formatDate(c.election_date);
  const meta = [c.office, c.district].filter(Boolean).join(" · ");
  // A campaign with no office AND no district is an incomplete draft.
  const isDraft = !c.office && !c.district;

  // The kebab popover doubles as the delete confirm — a single light step
  // (no type-to-confirm), with Cancel / Delete (Delete destructive-styled).
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, deleting]);

  async function onDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteCampaign(c.id);
      // Server revalidates /select; the card disappears on the refreshed list.
      setOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const avatar = c.photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL, fixed small size
    <img
      className="campaign-avatar campaign-avatar-img"
      src={c.photo_url}
      alt={`${c.candidate} photo`}
      width={38}
      height={38}
    />
  ) : (
    <span className="campaign-avatar" aria-hidden>
      {initials(c.candidate)}
    </span>
  );

  return (
    <div className="campaign-card-wrap">
      {/* Primary action: drafts resume onboarding; complete campaigns enter the app. */}
      {isDraft ? (
        <Link
          href={`/select/new?resume=${c.id}`}
          className="campaign-card"
          aria-label={`Resume setup for ${c.candidate}`}
        >
          <div className="campaign-card-top">
            {avatar}
            <span className="campaign-draft">Draft</span>
          </div>
          <div className="campaign-name">{c.candidate}</div>
          <div className="campaign-meta">
            <span className="campaign-resume">
              <PencilLine className="campaign-ico" />
              Resume setup
            </span>
            {date ? (
              <span className="campaign-meta-row">
                <CalendarDays className="campaign-ico" />
                {date}
              </span>
            ) : null}
          </div>
        </Link>
      ) : (
        <form action={selectCampaign.bind(null, c.id)}>
          <button type="submit" className="campaign-card" aria-label={`Open ${c.candidate}`}>
            <div className="campaign-card-top">
              {avatar}
            </div>
            <div className="campaign-name">{c.candidate}</div>
            <div className="campaign-meta">
              {meta ? (
                <span className="campaign-meta-row">
                  <MapPin className="campaign-ico" />
                  {meta}
                </span>
              ) : null}
              {date ? (
                <span className="campaign-meta-row">
                  <CalendarDays className="campaign-ico" />
                  {date}
                </span>
              ) : null}
            </div>
          </button>
        </form>
      )}

      {/* Delete affordance — owner/director only. Vertical kebab in the UPPER-RIGHT,
          faint until hover/focus. Sits above the card; all pointer events are
          stopped so the card's select/resume action never fires. The popover is
          anchored to the right edge so it stays fully inside the card width. */}
      {canManage && (
        <div
          className={"campaign-menu" + (open ? " open" : "")}
          ref={menuRef}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="campaign-menu-btn"
            aria-label={`More actions for ${c.candidate}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? popId : undefined}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen((v) => !v);
            }}
          >
            <MoreVertical aria-hidden />
          </button>
          {open && (
            <div className="campaign-menu-pop" id={popId} role="dialog" aria-label="Delete campaign">
              <div className="campaign-menu-pop-title">Delete campaign</div>
              <div className="campaign-menu-pop-sub">removes its voters &amp; turfs</div>
              <div className="campaign-menu-pop-actions">
                <button
                  type="button"
                  className="btn campaign-menu-cancel"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!deleting) setOpen(false);
                  }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn campaign-menu-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDelete();
                  }}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="onb-spin" /> : <Trash2 aria-hidden />}
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
