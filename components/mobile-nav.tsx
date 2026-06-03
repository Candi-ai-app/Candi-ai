"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Map, Navigation, GitBranch, MessageSquare } from "lucide-react";

const ITEMS = [
  { label: "HQ",      href: "/",           icon: LayoutDashboard, comingSoon: false },
  { label: "Voters",  href: "/voters",      icon: Users,           comingSoon: false },
  { label: "Turf",    href: "/canvassing",  icon: Map,             comingSoon: false },
  { label: "Field",   href: "/field",       icon: Navigation,      comingSoon: false },
  // Scripts + Texting are greyed out in the desktop nav — hidden on mobile until ready.
  { label: "Scripts", href: "/scripts",     icon: GitBranch,       comingSoon: true },
  { label: "Texts",   href: "/texting",     icon: MessageSquare,   comingSoon: true },
];

// Canvassers get the field-focused subset; owners/directors see everything.
const CANVASSER_HREFS = new Set(["/voters", "/canvassing", "/field", "/texting"]);

export function MobileNav({ role = "director" }: { role?: string }) {
  const pathname = usePathname();
  const items = (role === "canvasser" ? ITEMS.filter((it) => CANVASSER_HREFS.has(it.href)) : ITEMS)
    .filter((it) => !it.comingSoon);
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
