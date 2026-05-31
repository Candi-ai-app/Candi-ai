import { TurfView } from "@/components/canvassing/turf-view";
import { getCanvassingData, listVoterPoints } from "./actions";

export const dynamic = "force-dynamic";

export default async function CanvassingPage() {
  // Fetch the campaign's geocoded voters (for the map pins) plus the real turf
  // list + header stats, all server-side and RLS-scoped. Empty campaigns yield
  // [] / zeroed stats → a clean empty map and turf-list empty state.
  const [voterPoints, canvassing] = await Promise.all([listVoterPoints(), getCanvassingData()]);
  return <TurfView voterPoints={voterPoints} turfs={canvassing.turfs} stats={canvassing.stats} />;
}
