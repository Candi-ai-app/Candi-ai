"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Route, MapPin, Navigation, ChevronDown, Users } from "lucide-react";
import type { TurfListItem, CampaignMember } from "@/app/(app)/canvassing/actions";
import { assignTurf } from "@/app/(app)/canvassing/actions";

function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "··";
}

export function CanvassersView({
  turfs,
  members,
}: {
  turfs: TurfListItem[];
  members: CampaignMember[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const assign = (turfId: string, memberId: string | null) => {
    setErr(null);
    startTransition(async () => {
      const r = await assignTurf(turfId, memberId);
      if (!r.ok) { setErr(r.error ?? "Failed to update assignment"); return; }
      router.refresh();
    });
  };

  const turfsFor = (id: string) => turfs.filter((t) => t.assigneeId === id);
  const unassigned = turfs.filter((t) => !t.assigneeId);

  // Canvassers first, then any other member who has turfs assigned.
  const roster = [...members]
    .sort((a, b) => {
      const ac = a.role === "canvasser" ? 0 : 1, bc = b.role === "canvasser" ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.name.localeCompare(b.name);
    })
    .filter((m) => m.role === "canvasser" || turfsFor(m.id).length > 0);

  return (
    <div className="canv-tab">
      {err && <div className="canv-tab-err">⚠ {err}</div>}

      {roster.length === 0 ? (
        <div className="turf-empty" style={{ maxWidth: 420, margin: "40px auto" }}>
          <span className="turf-empty-ico"><Users style={{ width: 20, height: 20 }} /></span>
          <b>No canvassers yet</b>
          <span className="muted">
            Add canvassers to this campaign&apos;s workspace, then assign them turfs and routes here.
          </span>
        </div>
      ) : (
        <div className="canv-grid">
          {roster.map((m) => {
            const mine = turfsFor(m.id);
            const doors = mine.reduce((n, t) => n + t.doorCount, 0);
            const routed = mine.filter((t) => t.routeStops > 0).length;
            return (
              <div className="canv-card" key={m.id}>
                <div className="canv-card-head">
                  <span className="avatar">{initials(m.name)}</span>
                  <div className="canv-card-id">
                    <b>{m.name}</b>
                    <span className="muted">{m.role}</span>
                  </div>
                  <span className="canv-card-stat mono">
                    {mine.length} turf{mine.length === 1 ? "" : "s"} · {doors.toLocaleString()} doors
                  </span>
                </div>

                {/* GPS placeholder — honest about the field-app dependency */}
                <div className="canv-gps">
                  <Navigation style={{ width: 13, height: 13 }} />
                  Live location — available with the GPS field app
                </div>

                {mine.length === 0 ? (
                  <div className="canv-none muted">No turfs assigned yet</div>
                ) : (
                  <div className="canv-turf-list">
                    {mine.map((t) => (
                      <div className="canv-turf-row" key={t.id}>
                        <MapPin style={{ width: 13, height: 13, color: "var(--muted)", flexShrink: 0 }} />
                        <span className="canv-turf-name">{t.name}</span>
                        <span className="muted mono canv-turf-doors">{t.doorCount.toLocaleString()}</span>
                        {t.routeStops > 0 ? (
                          <span className="tag accent canv-route-tag"><Route style={{ width: 11, height: 11 }} /> {t.routeStops}</span>
                        ) : (
                          <span className="tag canv-route-tag">no route</span>
                        )}
                        <button type="button" className="canv-unassign" disabled={isPending}
                          onClick={() => assign(t.id, null)}>Unassign</button>
                      </div>
                    ))}
                    {routed < mine.length && (
                      <div className="canv-hint muted">
                        {mine.length - routed} turf{mine.length - routed === 1 ? "" : "s"} still need a route
                        — open it on the Map tab and hit Generate route.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned turfs → assign to a canvasser */}
      <div className="canv-unassigned">
        <div className="turf-detail-h">
          Unassigned turfs <span className="mono">{unassigned.length}</span>
        </div>
        {unassigned.length === 0 ? (
          <span className="muted" style={{ fontSize: 13 }}>Every turf is assigned. 🎉</span>
        ) : (
          unassigned.map((t) => (
            <div className="canv-turf-row canv-turf-row-wide" key={t.id}>
              <DoorOpen style={{ width: 13, height: 13, color: "var(--muted)", flexShrink: 0 }} />
              <span className="canv-turf-name">{t.name}</span>
              <span className="muted mono canv-turf-doors">{t.doorCount.toLocaleString()} doors</span>
              {t.routeStops > 0 ? (
                <span className="tag accent canv-route-tag"><Route style={{ width: 11, height: 11 }} /> {t.routeStops}</span>
              ) : (
                <span className="tag canv-route-tag">no route</span>
              )}
              <div className="turf-select-wrap" style={{ marginLeft: "auto", minWidth: 150 }}>
                <select className="map-select" value="" disabled={isPending || members.length === 0}
                  onChange={(e) => { if (e.target.value) assign(t.id, e.target.value); }}
                  style={{ width: "100%" }}>
                  <option value="">Assign to…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
                </select>
                <ChevronDown style={{ width: 12, height: 12, pointerEvents: "none" }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
