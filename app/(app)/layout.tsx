import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app density-cozy">
      <Sidebar />
      <Topbar />
      <main className="canvas">{children}</main>
      <MobileNav />
    </div>
  );
}
