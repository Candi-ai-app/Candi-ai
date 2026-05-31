"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { CAMPAIGN_COOKIE } from "@/lib/campaign";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/select");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // Create a pre-confirmed user via the admin API (skips email confirmation for the demo).
  const admin = createAdminClient();
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr && !/already|exists|registered/i.test(createErr.message)) {
    redirect(`/login?error=${encodeURIComponent(createErr.message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/select");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const c = await cookies();
  c.delete(CAMPAIGN_COOKIE);
  redirect("/login");
}
