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

  return (
    <div className="app density-cozy">
      <Sidebar />
      <Topbar />
      <main className="canvas">{children}</main>
      <MobileNav />
    </div>
  );
}
