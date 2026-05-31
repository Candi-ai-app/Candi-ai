"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Map, GitBranch, MessageSquare } from "lucide-react";

const ITEMS = [
  { label: "HQ", href: "/", icon: LayoutDashboard },
  { label: "Voters", href: "/voters", icon: Users },
  { label: "Turf", href: "/canvassing", icon: Map },
  { label: "Scripts", href: "/scripts", icon: GitBranch },
  { label: "Texts", href: "/texting", icon: MessageSquare },
];

// Canvassers get the field-focused subset; owners/directors see everything.
const CANVASSER_HREFS = new Set(["/voters", "/canvassing", "/texting"]);

export function MobileNav({ role = "director" }: { role?: string }) {
  const pathname = usePathname();
  const items = role === "canvasser" ? ITEMS.filter((it) => CANVASSER_HREFS.has(it.href)) : ITEMS;
  return (
    <nav className="mobile-nav">
      {items.map((it) => {
        const Icon = it.icon;
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={"mnav-item" + (active ? " active" : "")}>
            <Icon style={{ width: 20, height: 20 }} />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
