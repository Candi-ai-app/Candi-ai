import { getFieldTurfs } from "./actions";
import { FieldView } from "@/components/field/field-view";

export default async function FieldPage() {
  const turfs = await getFieldTurfs();
  return <FieldView turfs={turfs} />;
}
