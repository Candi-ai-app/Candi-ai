"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search, Bell, Sparkles } from "lucide-react";
import { CRUMBS } from "@/lib/nav";
import { AskCandiPanel } from "@/components/ask-candi";

export function Topbar() {
  const pathname = usePathname();
  const crumb =
    CRUMBS[pathname] ?? CRUMBS[`/${pathname.split("/")[1]}`] ?? "—";
  const [askOpen, setAskOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="crumbs">
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
      <button
        className={"btn accent" + (askOpen ? " is-on" : "")}
        type="button"
        onClick={() => setAskOpen((v) => !v)}
      >
        <Sparkles className="ico" /> Ask Candi
      </button>

      <AskCandiPanel open={askOpen} onClose={() => setAskOpen(false)} />
    </header>
  );
}
