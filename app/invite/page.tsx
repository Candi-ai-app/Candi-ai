import type { Metadata } from "next";
import { InviteAccept } from "@/components/team/invite-accept";

export const metadata: Metadata = {
  title: "Join your team — Candi",
  description: "Accept your campaign workspace invitation.",
};

// The Supabase invite email lands here: GoTrue verifies the emailed token and
// redirects with the session in the URL hash (#access_token=…) — invites use
// the implicit grant (PKCE is unsupported for them), so only client JS can
// read it. The client island below picks the session up, lets the invitee set
// a password, and sends them to /select. The signup trigger already placed
// them in the inviting org at send time, so /select shows that org's
// campaigns — no personal org.
export default function InvitePage() {
  return <InviteAccept />;
}
