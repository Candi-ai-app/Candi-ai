"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { PRIMARY_NAV, V2_NAV } from "@/lib/nav";
import { signOut } from "@/app/login/actions";

// Canvassers get the field-focused subset; owners/directors see everything.
const CANVASSER_HREFS = new Set(["/voters", "/canvassing", "/texting"]);

export function Sidebar({ role = "director", email = "" }: { role?: string; email?: string }) {
  const pathname = usePathname();
  const isCanvasser = role === "canvasser";
  const nav = isCanvasser ? PRIMARY_NAV.filter((i) => CANVASSER_HREFS.has(i.href)) : PRIMARY_NAV;
  const initials = (email.split("@")[0] || "U").slice(0, 2).toUpperCase();
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-mark">C</span>
          Candi <small>v1·MVP</small>
        </div>
      </div>

      <div className="sidebar-section">Campaign OS</div>
      <nav className="nav">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
              <Icon className="ico" />
              <span>{item.label}</span>
              {item.kbd && <span className="kbd">{item.kbd}</span>}
              {item.badge && <span className={item.badgeMuted ? "badge muted" : "badge"}>{item.badge}</span>}
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
