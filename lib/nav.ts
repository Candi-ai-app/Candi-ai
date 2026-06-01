import {
  LayoutDashboard,
  Users,
  Map,
  GitBranch,
  MessageSquare,
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
  { label: "Scripts", href: "/scripts", icon: GitBranch },
  { label: "Texting", href: "/texting", icon: MessageSquare },
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
  "/scripts": "Scripts",
  "/texting": "Texting",
};
