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

/** The 5 MVP pillars — the live "Campaign OS" nav. */
export const PRIMARY_NAV: NavItem[] = [
  { label: "HQ Dashboard", href: "/", icon: LayoutDashboard, kbd: "G H" },
  { label: "Voters", href: "/voters", icon: Users, badge: "412K", badgeMuted: true },
  { label: "Canvassing", href: "/canvassing", icon: Map, badge: "8" },
  { label: "Scripts", href: "/scripts", icon: GitBranch, kbd: "G S" },
  { label: "Texting", href: "/texting", icon: MessageSquare, badge: "4" },
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
