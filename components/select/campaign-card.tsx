"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  CalendarDays,
  MoreHorizontal,
  Trash2,
  PencilLine,
  X,
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogTitleId = useId();

  // Close the ⋯ menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Escape closes the confirm dialog too.
  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) setConfirmOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen, deleting]);

  function openConfirm() {
    setMenuOpen(false);
    setConfirmText("");
    setConfirmOpen(true);
  }

  async function onDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteCampaign(c.id);
      // Server revalidates /select; the card disappears on the refreshed list.
      setConfirmOpen(false);
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
            <span className="campaign-card-top-right">
              <span className="campaign-draft">Draft</span>
              <ArrowRight className="campaign-arrow" />
            </span>
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
              <span className="campaign-card-top-right">
                <ArrowRight className="campaign-arrow" />
              </span>
            </div>
            <div className="campaign-name">{c.candidate}</div>
            <div className="campaign-meta">
              <span className="campaign-meta-row">
                <MapPin className="campaign-ico" />
                {meta}
              </span>
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

      {/* Delete affordance — owner/director only. Sits above the card link. */}
      {canManage && (
        <div className="campaign-menu" ref={menuRef}>
          <button
            type="button"
            className="campaign-menu-btn"
            aria-label={`More actions for ${c.candidate}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal aria-hidden />
          </button>
          {menuOpen && (
            <div className="campaign-menu-pop" role="menu">
              <button
                type="button"
                className="campaign-menu-item danger"
                role="menuitem"
                onClick={openConfirm}
              >
                <Trash2 aria-hidden />
                Delete campaign
              </button>
            </div>
          )}
        </div>
      )}

      {/* Type-to-confirm delete dialog. */}
      {confirmOpen && (
        <div
          className="campaign-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) setConfirmOpen(false);
          }}
        >
          <div className="campaign-confirm">
            <div className="campaign-confirm-head">
              <h2 id={dialogTitleId} className="campaign-confirm-title">
                Delete this campaign?
              </h2>
              <button
                type="button"
                className="campaign-confirm-x"
                aria-label="Cancel"
                onClick={() => !deleting && setConfirmOpen(false)}
              >
                <X aria-hidden />
              </button>
            </div>
            <p className="campaign-confirm-body">
              This permanently deletes <b>{c.candidate}</b> and removes all of its voters,
              turfs, and contacts. This <b>cannot be undone</b>.
            </p>
            <label className="campaign-confirm-label">
              Type <span className="campaign-confirm-name">{c.candidate}</span> to confirm
              <input
                className="scr-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={c.candidate}
                autoFocus
                autoComplete="off"
                disabled={deleting}
              />
            </label>
            <div className="campaign-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn campaign-confirm-delete"
                onClick={onDelete}
                disabled={deleting || confirmText.trim() !== c.candidate.trim()}
              >
                {deleting ? <Loader2 className="onb-spin" /> : <Trash2 aria-hidden />}
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
