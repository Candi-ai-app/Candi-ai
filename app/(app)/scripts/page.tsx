import { redirect } from "next/navigation";
import { ScriptsView } from "@/components/scripts/scripts-view";
import { getRole, isAdminRole } from "@/lib/auth";

export default async function ScriptsPage() {
  // Script builder edits shared campaign messaging — owners/directors only.
  if (!isAdminRole(await getRole())) redirect("/canvassing");
  return <ScriptsView />;
}
