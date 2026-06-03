import {
  LayoutDashboard,
  Users,
  Map,
  GitBranch,
  MessageSquare,
  Navigation,
  Phone,
  Radio,
  Globe,
  HeartHandshake,
  UserPlus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  kbd?: string;
  badge?: string;
  badgeMuted?: boolean;
  /** Greyed-out / non-interactive — built but not ready to demo. */
  comingSoon?: boolean;
};

/**
 * The 5 MVP pillars — the live "Campaign OS" nav. Badges are no longer hardcoded:
 * Voters (voter count) and Canvassing (active-turf count) get their badges injected
 * at render from real campaign data; Texting has no real backing count, so no badge.
 */
export const PRIMARY_NAV: NavItem[] = [
  { label: "HQ Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Voters", href: "/voters", icon: Users, badgeMuted: true },
  { label: "Canvassing", href: "/canvassing", icon: Map },
  { label: "Field", href: "/field", icon: Navigation },
  { label: "Scripts", href: "/scripts", icon: GitBranch, comingSoon: true },
  { label: "Texting", href: "/texting", icon: MessageSquare, comingSoon: true },
];

/** The "Coming in V2" shelf — visible but disabled. */
export const V2_NAV: { label: string; icon: LucideIcon }[] = [
  { label: "AI Dialer", icon: Phone },
  { label: "Voice Shots", icon: Radio },
  { label: "GIS / District", icon: Globe },
  { label: "Donors", icon: HeartHandshake },
  { label: "Volunteers", icon: UserPlus },
  { label: "Candi Pro", icon: Sparkles },
];

export const CRUMBS: Record<string, string> = {
  "/": "HQ Dashboard",
  "/voters": "Voters",
  "/canvassing": "Canvassing",
  "/field": "Field",
  "/scripts": "Scripts",
  "/texting": "Texting",
};
