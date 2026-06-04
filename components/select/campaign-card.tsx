"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  MapPin,
  CalendarDays,
  MoreVertical,
  Trash2,
  PencilLine,
  Loader2,
  Pencil,
  ImagePlus,
  X,
  Check,
} from "lucide-react";
import { selectCampaign, deleteCampaign, updateCampaign } from "@/app/select/actions";
import { createClient } from "@/utils/supabase/client";
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

// ── Edit modal ─────────────────────────────────────────────────────────────
function EditModal({
  campaign: c,
  onClose,
}: {
  campaign: PickerCampaign;
  onClose: () => void;
}) {
  const [name, setName] = useState(c.candidate);
  const [office, setOffice] = useState(c.office ?? "");
  const [district, setDistrict] = useState(c.district ?? "");
  const [date, setDate] = useState(c.election_date ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(c.photo_url ?? null);
  const [photoUrl, setPhotoUrl] = useState<string>(c.photo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [saving, onClose]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { setError("Photo must be under 4 MB"); return; }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!photoFile) return photoUrl || null;
    try {
      const supabase = createClient();
      const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${c.id}/${Date.now()}.${ext || "jpg"}`;
      const { error: upErr } = await supabase.storage
        .from("candidates")
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
      if (upErr) { console.error("photo upload:", upErr.message); return photoUrl || null; }
      const { data } = supabase.storage.from("candidates").getPublicUrl(path);
      return data.publicUrl;
    } catch { return photoUrl || null; }
  }

  function onSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setError(null);
    startSave(async () => {
      setUploading(true);
      const url = await uploadPhoto();
      setUploading(false);
      const res = await updateCampaign(c.id, {
        candidate: name.trim(),
        office: office.trim() || null,
        district: district.trim() || null,
        election_date: date || null,
        photo_url: url,
      });
      if (!res.ok) { setError(res.error ?? "Save failed"); return; }
      onClose();
    });
  }

  return (
    <div className="edit-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="edit-modal" role="dialog" aria-label="Edit campaign">
        <div className="edit-modal-head">
          <h2 className="edit-modal-title">Edit campaign</h2>
          <button type="button" className="edit-modal-close" aria-label="Close" onClick={onClose} disabled={saving}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="edit-modal-body">
          {/* Photo */}
          <div className="edit-modal-photo-row">
            <div
              className="edit-modal-photo"
              onClick={() => fileRef.current?.click()}
              title="Click to change photo"
            >
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="Candidate" width={72} height={72} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: "50%" }} />
              ) : (
                <span className="edit-modal-initials">{initials(name || c.candidate)}</span>
              )}
              <div className="edit-modal-photo-overlay">
                <ImagePlus style={{ width: 18, height: 18 }} />
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Candidate photo</div>
              <button type="button" className="edit-modal-photo-btn" onClick={() => fileRef.current?.click()}>
                {photoPreview ? "Change photo" : "Add photo"}
              </button>
              {photoPreview && (
                <button type="button" className="edit-modal-photo-remove" onClick={() => {
                  setPhotoFile(null); setPhotoPreview(null); setPhotoUrl("");
                }}>
                  Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickFile} />
          </div>

          {/* Fields */}
          <label className="edit-modal-label">
            Candidate name
            <input
              className="edit-modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              disabled={saving}
            />
          </label>

          <label className="edit-modal-label">
            Office
            <input
              className="edit-modal-input"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              placeholder="e.g. County Commission"
              disabled={saving}
            />
          </label>

          <label className="edit-modal-label">
            District / Location
            <input
              className="edit-modal-input"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="e.g. Broward District 9"
              disabled={saving}
            />
          </label>

          <label className="edit-modal-label">
            Election date
            <input
              type="date"
              className="edit-modal-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
            />
          </label>

          {error && <div className="edit-modal-error">⚠ {error}</div>}
        </div>

        <div className="edit-modal-foot">
          <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={onSave} disabled={saving || uploading}>
            {saving || uploading ? <Loader2 className="onb-spin" aria-hidden /> : <Check style={{ width: 14, height: 14 }} />}
            {saving || uploading ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Campaign card ──────────────────────────────────────────────────────────
export function CampaignCard({
  campaign: c,
  canManage,
}: {
  campaign: PickerCampaign;
  canManage: boolean;
}) {
  const date = formatDate(c.election_date);
  const meta = [c.office, c.district].filter(Boolean).join(" · ");
  const isDraft = !c.office && !c.district;

  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const popId = useId();

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
      setOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const avatar = c.photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
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
    <>
      {editing && <EditModal campaign={c} onClose={() => setEditing(false)} />}

      <div className="campaign-card-wrap">
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

            {open && !deleting && (
              <div className="campaign-menu-pop campaign-menu-pop-wide" id={popId} role="dialog" aria-label="Campaign actions">
                {/* Edit */}
                <button
                  type="button"
                  className="campaign-menu-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    setEditing(true);
                  }}
                >
                  <Pencil style={{ width: 14, height: 14 }} aria-hidden />
                  Edit campaign
                </button>
                <div className="campaign-menu-divider" />
                {/* Delete confirm */}
                <div className="campaign-menu-pop-title">Delete campaign</div>
                <div className="campaign-menu-pop-sub">removes its voters &amp; turfs</div>
                <div className="campaign-menu-pop-actions">
                  <button
                    type="button"
                    className="btn campaign-menu-cancel"
                    onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn campaign-menu-delete"
                    onClick={(e) => { e.stopPropagation(); void onDelete(); }}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="onb-spin" /> : <Trash2 aria-hidden />}
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}

            {/* Show spinner in place of menu while deleting */}
            {open && deleting && (
              <div className="campaign-menu-pop" id={popId}>
                <Loader2 className="onb-spin" style={{ margin: "12px auto", display: "block" }} />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
