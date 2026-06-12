"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getActiveCampaign } from "@/lib/campaign";
import {
  runFormBatch,
  MAX_BATCH_VOTERS,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/forms/generate";

/** A template card on the Forms page. */
export type FormTemplateItem = {
  id: string;
  name: string;
  /** True for the repo-bundled official form (campaign_id null). */
  builtIn: boolean;
  mode: "acroform" | "stamp";
  fieldCount: number;
};

/** One row in the Recent batches list. */
export type FormBatchItem = {
  id: string;
  createdAt: string;
  templateName: string | null;
  voterCount: number;
  precinct: string | null;
  status: string;
};

export type GenerateFormBatchResult =
  | { ok: true; count: number; signedUrl: string; batchId: string }
  | { ok: false; error: string };

/**
 * Generate one merged, prefilled PDF for the ACTIVE campaign — one form
 * page-set per voter — and return a ~1h signed URL to the stored file.
 *
 * Voters come from a precinct (2026-normalized code, same as the dropdown
 * counts) or an explicit id list, capped at 500 per batch. All data reads and
 * the batch log go through the caller's RLS-scoped client; the service-role
 * client touches ONLY storage (private `forms` bucket, no user policies).
 */
export async function generateFormBatch(input: {
  templateId: string;
  precinct?: string;
  voterIds?: string[];
  limit?: number;
}): Promise<GenerateFormBatchResult> {
  const campaign = await getActiveCampaign();
  if (!campaign) return { ok: false, error: "No active campaign" };
  const supabase = await createClient();

  try {
    const { count, signedUrl, batchId } = await runFormBatch({
      db: supabase,
      admin: createAdminClient(),
      campaignId: campaign.id,
      templateId: input.templateId,
      precinct: input.precinct?.trim() || undefined,
      voterIds: input.voterIds,
      limit: Math.min(Math.max(Math.floor(input.limit ?? MAX_BATCH_VOTERS), 1), MAX_BATCH_VOTERS),
    });
    revalidatePath("/forms");
    return { ok: true, count, signedUrl, batchId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Form generation failed";
    console.error("generateFormBatch:", message);
    return { ok: false, error: message };
  }
}

/**
 * Mint a fresh ~1h signed URL for a past batch. The batch row is read through
 * RLS first — only members of the batch's campaign can reach the object.
 */
export async function getBatchDownloadUrl(
  batchId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const campaign = await getActiveCampaign();
  if (!campaign) return { ok: false, error: "No active campaign" };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("form_batches")
    .select("id, storage_path, voter_count")
    .eq("id", batchId)
    .eq("campaign_id", campaign.id)
    .maybeSingle();
  if (error) {
    console.error("getBatchDownloadUrl:", error.message);
    return { ok: false, error: error.message };
  }
  const row = data as { storage_path: string | null; voter_count: number } | null;
  if (!row?.storage_path) return { ok: false, error: "Batch file not found" };

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("forms")
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: `vbm-forms-${row.voter_count}.pdf`,
    });
  if (signError || !signed?.signedUrl) {
    console.error("getBatchDownloadUrl:", signError?.message);
    return { ok: false, error: signError?.message ?? "Could not sign URL" };
  }
  return { ok: true, url: signed.signedUrl };
}
