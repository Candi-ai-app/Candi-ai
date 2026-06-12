"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import { inviteMember, revokeInvite, type TeamData } from "@/app/(app)/team/actions";

function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "··";
}

/** "2026-06-12T14:03:22Z" → "Jun 12, 2026" (viewer-local). */
function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ROLE_TAG: Record<string, string> = {
  owner: "tag accent",
  director: "tag indigo",
  canvasser: "tag und",
};

function RoleTag({ role }: { role: string }) {
  return <span className={ROLE_TAG[role] ?? "tag und"}>{role}</span>;
}

export function TeamView({ team }: { team: TeamData }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"canvasser" | "director">("canvasser");
  const [sending, startSend] = useTransition();
  const [revoking, startRevoke] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !email.trim()) return;
    setMsg(null);
    startSend(async () => {
      const r = await inviteMember({ email, role });
      if (!r.ok) {
        setMsg({ kind: "err", text: r.error });
        return;
      }
      setMsg({
        kind: "ok",
        text:
          r.status === "added-directly"
            ? `${r.email} already had a Candi account — added to your team. They can log in as usual.`
            : r.warning
              ? `Invite saved for ${r.email}, but ${r.warning}`
              : `Invite sent to ${r.email} — they'll get an email link to join.`,
      });
      setEmail("");
      router.refresh();
    });
  };

  const revoke = (id: string, who: string) => {
    if (revoking) return;
    setMsg(null);
    setRevokingId(id);
    startRevoke(async () => {
      const r = await revokeInvite(id);
      setRevokingId(null);
      if (!r.ok) {
        setMsg({ kind: "err", text: r.error ?? "Couldn't revoke the invite." });
        return;
      }
      setMsg({ kind: "ok", text: `Invite for ${who} revoked.` });
      router.refresh();
    });
  };

  return (
    <div className="team">
      <div className="module-head">
        <div>
          <h1>Team</h1>
          <div className="sub">
            Who can access {team.orgName || "this workspace"} — invite directors and canvassers,
            revoke pending invites.
          </div>
        </div>
      </div>

      <div className="team-body">
        {/* ── Invite ───────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>Invite a teammate</h3>
            <span className="sub">They&apos;ll get an email link to join this workspace.</span>
          </div>
          <div className="card-body">
            <form className="team-invite-row" onSubmit={submit}>
              <input
                className="map-select team-invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={sending}
                aria-label="Teammate email"
                required
              />
              <div className="turf-select-wrap team-invite-role">
                <select
                  className="map-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as "canvasser" | "director")}
                  disabled={sending}
                  aria-label="Role"
                  style={{ width: "100%" }}
                >
                  <option value="canvasser">Canvasser — field app only</option>
                  <option value="director">Director — full campaign access</option>
                </select>
                <ChevronDown style={{ width: 12, height: 12, pointerEvents: "none" }} />
              </div>
              <button type="submit" className="btn primary" disabled={sending || !email.trim()}>
                <UserPlus className="ico" />
                {sending ? "Sending…" : "Send invite"}
              </button>
            </form>
            {msg && (
              <div className={"team-msg" + (msg.kind === "err" ? " err" : "")} role="status">
                {msg.text}
              </div>
            )}
          </div>
        </div>

        {/* ── Members ──────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>Members</h3>
            <span className="sub">
              {team.members.length} in this workspace
            </span>
          </div>
          <div className="card-body flush">
            {team.members.length === 0 ? (
              <div className="team-empty muted">No members yet.</div>
            ) : (
              team.members.map((m) => (
                <div className="team-row" key={m.membershipId}>
                  <span className="avatar">{initials(m.name)}</span>
                  <div className="team-row-id">
                    <b>
                      {m.name}
                      {m.isYou && <span className="tag und team-you-tag">you</span>}
                    </b>
                    <span className="muted">{m.email || "—"}</span>
                  </div>
                  <RoleTag role={m.role} />
                  <span className="team-row-when muted mono">Joined {fmtDay(m.joinedAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Pending invites ──────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>Pending invites</h3>
            <span className="sub">Sent but not yet signed in.</span>
          </div>
          <div className="card-body flush">
            {team.invites.length === 0 ? (
              <div className="team-empty muted">
                <ShieldCheck style={{ width: 14, height: 14 }} />
                No pending invites.
              </div>
            ) : (
              team.invites.map((i) => (
                <div className="team-row" key={i.id}>
                  <span className="avatar team-avatar-pending">
                    <Mail style={{ width: 13, height: 13 }} />
                  </span>
                  <div className="team-row-id">
                    <b>{i.email}</b>
                    <span className="muted">
                      {i.emailSent
                        ? "Awaiting first sign-in"
                        : "Email delivery unconfirmed — revoke and retry"}
                    </span>
                  </div>
                  <RoleTag role={i.role} />
                  <span className="team-row-when muted mono">Sent {fmtDay(i.sentAt)}</span>
                  <button
                    type="button"
                    className="btn ghost team-revoke"
                    disabled={revoking}
                    onClick={() => revoke(i.id, i.email)}
                  >
                    {revoking && revokingId === i.id ? "Revoking…" : "Revoke"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="team-foot muted">
          <Users style={{ width: 13, height: 13 }} />
          Canvassers see only Voters, Canvassing, Field and Texting. Directors get the full
          campaign workspace. Invites grant access to every campaign in this workspace.
        </div>
      </div>
    </div>
  );
}
