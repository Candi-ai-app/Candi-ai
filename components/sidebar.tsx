"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { PRIMARY_NAV, V2_NAV } from "@/lib/nav";
import { signOut } from "@/app/login/actions";

// Canvassers get the field-focused subset; owners/directors see everything.
const CANVASSER_HREFS = new Set(["/voters", "/canvassing", "/texting"]);

/** Compact count for nav badges: 412847 → "413K", 600 → "600", 0 → "". */
function compact(n: number): string {
  if (!n || n < 0) return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function Sidebar({
  role = "director",
  email = "",
  activeCampaign = "",
  voterCount = 0,
  turfCount = 0,
}: {
  role?: string;
  email?: string;
  activeCampaign?: string;
  /** Real voter count for the active campaign → Voters nav badge. */
  voterCount?: number;
  /** Real active-turf count for the active campaign → Canvassing nav badge. */
  turfCount?: number;
}) {
  const pathname = usePathname();
  const isCanvasser = role === "canvasser";
  const nav = isCanvasser ? PRIMARY_NAV.filter((i) => CANVASSER_HREFS.has(i.href)) : PRIMARY_NAV;
  const initials = (email.split("@")[0] || "U").slice(0, 2).toUpperCase();
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  // Inject real badges by href; nav items themselves no longer carry static counts.
  const badgeFor = (href: string): string | undefined => {
    if (href === "/voters") return compact(voterCount) || undefined;
    if (href === "/canvassing") return turfCount > 0 ? String(turfCount) : undefined;
    return undefined;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-mark">C</span>
          Candi <small>v1·MVP</small>
        </div>
      </div>

      {activeCampaign && (
        <div className="campaign-switch">
          <div className="campaign-switch-info">
            <span className="campaign-switch-label">Campaign</span>
            <b title={activeCampaign}>{activeCampaign}</b>
          </div>
          <Link href="/select" className="campaign-switch-link">
            Switch
          </Link>
        </div>
      )}

      <div className="sidebar-section">Campaign OS</div>
      <nav className="nav">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badge = badgeFor(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
              <Icon className="ico" />
              <span>{item.label}</span>
              {item.kbd && <span className="kbd">{item.kbd}</span>}
              {badge && <span className={item.badgeMuted ? "badge muted" : "badge"}>{badge}</span>}
            </Link>
          );
        })}
      </nav>

      {!isCanvasser && (
        <>
          <div className="sidebar-section">Coming in V2</div>
          <nav className="nav">
            {V2_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <a key={item.label} className="soon">
                  <Icon className="ico" />
                  <span>{item.label}</span>
                  <span className="badge muted">SOON</span>
                </a>
              );
            })}
          </nav>
        </>
      )}

      <div className="sidebar-foot">
        <div className="avatar">{initials}</div>
        <div className="who">
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email || "Signed in"}</b>
          <span>{roleLabel}</span>
        </div>
        <form action={signOut}>
          <button type="submit" title="Sign out" style={{ border: 0, background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--muted)" }}>
            <LogOut style={{ width: 16, height: 16 }} />
          </button>
        </form>
      </div>
    </aside>
  );
}
