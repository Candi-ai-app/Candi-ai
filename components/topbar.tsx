"use client";

import { usePathname } from "next/navigation";
import { Search, Bell, Sparkles, ChevronDown } from "lucide-react";
import { CRUMBS } from "@/lib/nav";

export function Topbar() {
  const pathname = usePathname();
  const crumb =
    CRUMBS[pathname] ?? CRUMBS[`/${pathname.split("/")[1]}`] ?? "—";

  return (
    <header className="topbar">
      <div className="context-pill">
        <span className="ico-circ">MR</span>
        <b>Mira Reyes</b>
        <span className="muted">· State Senate · PA-12</span>
        <ChevronDown className="chev" style={{ width: 14, height: 14 }} />
      </div>

      <div className="crumbs">
        <span className="sep">/</span>
        <b>{crumb}</b>
      </div>

      <div className="spacer" />
      <div className="searchbox">
        <Search className="ico" />
        <span>Find voter, address, turf…</span>
        <span className="kbd">⌘K</span>
      </div>
      <div className="spacer" />

      <button className="pill" type="button">
        <span className="muted">Viewing as ·</span> <b>Field Director</b>
      </button>
      <button className="pill" type="button" aria-label="Notifications">
        <Bell className="ico" />
      </button>
      <button className="btn accent" type="button">
        <Sparkles className="ico" /> Ask Candi
      </button>
    </header>
  );
}
