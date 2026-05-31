import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
import { createClient } from "@/utils/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership?.role as string) ?? "canvasser";

  return (
    <div className="app density-cozy">
      <Sidebar role={role} email={user.email ?? ""} />
      <Topbar />
      <main className="canvas">{children}</main>
      <MobileNav role={role} />
    </div>
  );
}
