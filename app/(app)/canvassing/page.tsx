import { TurfView } from "@/components/canvassing/turf-view";
import { listVoterPoints } from "./actions";

export default async function CanvassingPage() {
  // Fetch the campaign's geocoded voters server-side (RLS-scoped) and hand them
  // to the client turf map as pins. Empty campaigns yield [] → a clean empty map.
  const voterPoints = await listVoterPoints();
  return <TurfView voterPoints={voterPoints} />;
}
