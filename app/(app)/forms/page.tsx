import { FormsView } from "@/components/forms/forms-view";
import { createClient } from "@/utils/supabase/server";
import { getActiveCampaign } from "@/lib/campaign";
import { getPrecinctStats } from "@/app/(app)/canvassing/actions";
import { isFormMapping } from "@/lib/forms/mapping";
import type { FormTemplateItem, FormBatchItem } from "@/app/(app)/forms/actions";

export const dynamic = "force-dynamic";
// Filling + merging up to 500 form copies takes ~15-30s; the page-level
// maxDuration covers the generateFormBatch server action invoked from here.
export const maxDuration = 120;

export default async function FormsPage() {
  const supabase = await createClient();
  const campaign = await getActiveCampaign();
  const campaignId = campaign?.id ?? null;

  // Templates (global built-ins + this campaign's), precinct counts (same RPC
  // the canvassing overlay uses), and recent batches — all RLS-scoped.
  const [templatesRes, precincts, batchesRes] = await Promise.all([
    supabase
      .from("form_templates")
      .select("id, campaign_id, name, mapping")
      .order("created_at", { ascending: true }),
    getPrecinctStats(),
    campaignId
      ? supabase
          .from("form_batches")
          .select("id, created_at, voter_count, params, status, form_templates(name)")
          .eq("campaign_id", campaignId)
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
  ]);

  const templates: FormTemplateItem[] = ((templatesRes.data ?? []) as {
    id: string;
    campaign_id: string | null;
    name: string;
    mapping: unknown;
  }[]).map((t) => ({
    id: t.id,
    name: t.name,
    builtIn: t.campaign_id === null,
    mode: isFormMapping(t.mapping) ? t.mapping.mode : "acroform",
    fieldCount: isFormMapping(t.mapping) ? t.mapping.fields.length : 0,
  }));

  const batches: FormBatchItem[] = ((batchesRes.data ?? []) as unknown as {
    id: string;
    created_at: string;
    voter_count: number | null;
    params: { precinct?: string | null } | null;
    status: string;
    form_templates: { name: string } | null;
  }[]).map((b) => ({
    id: b.id,
    createdAt: b.created_at,
    templateName: b.form_templates?.name ?? null,
    voterCount: b.voter_count ?? 0,
    precinct: b.params?.precinct ?? null,
    status: b.status,
  }));

  return (
    <FormsView
      templates={templates}
      precincts={precincts.map((p) => ({ code: p.precinct, voters: p.voters }))}
      batches={batches}
    />
  );
}
