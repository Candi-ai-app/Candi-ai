"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { PRIMARY_NAV, V2_NAV } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

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
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "active" : undefined}
            >
              <Icon className="ico" />
              <span>{item.label}</span>
              {item.kbd && <span className="kbd">{item.kbd}</span>}
              {item.badge && (
                <span className={item.badgeMuted ? "badge muted" : "badge"}>
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

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

      <div className="sidebar-foot">
        <div className="avatar">SP</div>
        <div className="who">
          <b>Sam Park</b>
          <span>Field Director</span>
        </div>
        <Settings className="ico" aria-label="Settings" style={{ width: 16, height: 16, color: "var(--muted)" }} />
      </div>
    </aside>
  );
}
