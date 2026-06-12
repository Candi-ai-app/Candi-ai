import { getFieldTurfs } from "./actions";
import { getActiveCampaign } from "@/lib/campaign";
import { FieldView } from "@/components/field/field-view";

export default async function FieldPage() {
  const [turfs, campaign] = await Promise.all([getFieldTurfs(), getActiveCampaign()]);
  return <FieldView turfs={turfs} campaignCounty={campaign?.county ?? null} />;
}
