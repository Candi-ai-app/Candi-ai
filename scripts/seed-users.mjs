// One-off: create demo login accounts (owner / director / canvasser) on the Reyes campaign.
// Run: node scripts/seed-users.mjs   (uses SUPABASE_SERVICE_ROLE_KEY from .env.local)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ORG = "00000000-0000-0000-0000-000000000001";
const PASSWORD = "CandiDemo2026!";
const accounts = [
  { email: "owner@candi.app", role: "owner" },
  { email: "director@candi.app", role: "director" },
  { email: "canvasser@candi.app", role: "canvasser" },
];

for (const a of accounts) {
  let userId;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: a.email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created?.user) {
    userId = created.user.id;
  } else if (error && /already|registered|exists/i.test(error.message)) {
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 });
    userId = list?.users?.find((u) => u.email === a.email)?.id;
  } else if (error) {
    console.log("✗", a.email, "—", error.message);
    continue;
  }
  if (!userId) {
    console.log("✗", a.email, "— no user id");
    continue;
  }
  const { error: mErr } = await supabase
    .from("memberships")
    .upsert({ org_id: ORG, user_id: userId, role: a.role }, { onConflict: "org_id,user_id" });
  console.log(mErr ? `✗ ${a.email} membership: ${mErr.message}` : `✓ ${a.email} → ${a.role}`);
}

console.log(`\nAll accounts use password: ${PASSWORD}`);
