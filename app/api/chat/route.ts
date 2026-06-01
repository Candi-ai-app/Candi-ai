import Anthropic from "@anthropic-ai/sdk";
import { requireUser, rateLimited, logUsage } from "@/lib/ai-guard";
import { getActiveCampaignId } from "@/lib/campaign";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// We keep the DIRECT Anthropic SDK (not the Vercel AI SDK) on purpose: this route
// owns a hand-rolled tool-use loop + a plain-text stream contract the client
// (components/ask-candi.tsx) already reads. Swapping SDKs would buy nothing here.
const MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 5; // hard cap on the agentic loop (cost/latency bound)
const MAX_TOKENS = 700; // modest per-turn output budget

// "Candi" — the in-app assistant. Nonpartisan by design: it helps whoever is running
// the campaign run it well, and never advocates for a party or ideology. It is now a
// DATA-GROUNDED ANALYST: it has read-only tools over THIS campaign's real Supabase
// data and must answer with the real figures (never invented ones).
const SYSTEM = `You are Candi, the AI assistant built into the CANDI campaign operating system — a modern, nonpartisan alternative to NGP VAN.

You help campaign staff with: voter targeting and list-building, turf cutting, canvassing strategy, phone/text outreach, scripts, vote-by-mail chase, GOTV, and making sense of their data.

DATA TOOLS — you can query the ACTIVE campaign's REAL, live data (Supabase, scoped to this user's campaign):
- count_voters: exact count of voters matching optional filters (party D/R/I, race, gender M/F/X, precinct, min_support 1–5, super_voter, flag).
- voter_breakdown: counts grouped by one dimension (party | race | gender | precinct | support).
- turf_summary: the campaign's turfs (name, status, doors, voters, assignee).
- field_stats: doors knocked, contacts (people reached), and supporters ID'd over a recent window of days.

How to use them:
- When a question involves any number, count, share, distribution, turf, or field activity for THIS campaign, CALL A TOOL and answer with the returned figures. Do not guess, estimate, or recall numbers from anywhere else.
- State ONLY numbers the tools returned. Never invent or extrapolate figures. If you compute a derived value (e.g. a percentage), base it strictly on tool numbers and show the basis.
- If a tool returns zero / empty, say so plainly (e.g. "no support scores are recorded yet", "no canvassing logged in that window") and suggest the in-app action to fix it — do not paper over it with a guess.
- If a tool reports no active campaign, tell the user to pick a campaign first.
- A few tool calls are plenty; don't loop pulling data you won't use.

Rules:
- Be strictly NONPARTISAN. Never advocate for a party, candidate, or ideology. Help the user run *their* campaign effectively, whoever they are.
- Be concise and practical. Prefer short, actionable answers; expand only when asked.
- You live inside the app (modules: HQ, Voters, Turf/Canvassing, Scripts, Texts). Speak in terms of those features.
- For questions with no live-data angle, just answer; mention where in the app to look when relevant.
- Never help with anything illegal (voter suppression, intimidation, fraud, impersonation, scraping protected data).`;

// ── Tool schemas (Anthropic tool-use). Inputs are tightly enumerated/bounded. ──
const PARTIES = ["D", "R", "I"] as const;
const GENDERS = ["M", "F", "X"] as const;
const DIMENSIONS = ["party", "race", "gender", "precinct", "support"] as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "count_voters",
    description:
      "Exact count of registered voters in the active campaign matching the given filters. All filters optional; omit a filter to leave it unconstrained. Combine filters with AND.",
    input_schema: {
      type: "object",
      properties: {
        party: { type: "string", enum: [...PARTIES], description: "Party registration." },
        race: { type: "string", description: "Race/ethnicity label, e.g. 'Black', 'White', 'Hispanic/Latino', 'Asian', 'Other'." },
        gender: { type: "string", enum: [...GENDERS], description: "Gender: M, F, or X." },
        precinct: { type: "string", description: "Exact precinct code, e.g. 'K003'." },
        min_support: { type: "integer", minimum: 1, maximum: 5, description: "Minimum support score (1–5); counts voters scored at least this high." },
        super_voter: { type: "boolean", description: "True = voted in at least 3 of the last 4 general elections; false = did not." },
        flag: { type: "string", description: "A campaign flag/tag to require, e.g. 'VBM' or 'persuadable'." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "voter_breakdown",
    description:
      "Counts of the active campaign's voters grouped by ONE dimension. Returns each bucket and its count.",
    input_schema: {
      type: "object",
      properties: {
        by: { type: "string", enum: [...DIMENSIONS], description: "Dimension to group by." },
      },
      required: ["by"],
      additionalProperties: false,
    },
  },
  {
    name: "turf_summary",
    description:
      "The active campaign's turfs: name, status (queued/active/complete), door_count, voter_count, and whether an assignee is set.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "field_stats",
    description:
      "Field activity over a recent window: doors knocked (door attempts), contacts made (people actually reached), and supporters ID'd (score 4–5), plus the door contact rate.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 90, description: "Window size in days (default 14)." },
      },
      additionalProperties: false,
    },
  },
];

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ToolCtx = { db: SupabaseClient; campaignId: string | null };
type Json = Record<string, unknown>;

// "No active campaign" sentinel — tools degrade to an empty/zero result + a note so
// Claude can tell the user to pick a campaign (rather than fabricating data).
const NO_CAMPAIGN: Json = { note: "No active campaign is selected. Ask the user to choose a campaign first." };

const clampInt = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof v === "number" ? Math.trunc(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const cleanStr = (v: unknown, max = 64): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s.length ? s : undefined;
};

// ── Tool executors (RLS session client, scoped to the active campaign) ─────────
async function countVoters(ctx: ToolCtx, input: Json): Promise<Json> {
  if (!ctx.campaignId) return { count: 0, ...NO_CAMPAIGN };
  // Whitelist/validate every input before it reaches the DB.
  const party = oneOf(input.party, PARTIES);
  const gender = oneOf(input.gender, GENDERS);
  const race = cleanStr(input.race);
  const precinct = cleanStr(input.precinct, 24);
  const flag = cleanStr(input.flag, 40);
  const min_support =
    input.min_support == null ? null : clampInt(input.min_support, 1, 5, 1);
  const super_voter = typeof input.super_voter === "boolean" ? input.super_voter : null;

  // One server-side count (handles the super-voter 3-of-4 jsonb arithmetic too).
  const { data, error } = await ctx.db.rpc("campaign_count_voters", {
    p_campaign: ctx.campaignId,
    p_party: party ?? null,
    p_race: race ?? null,
    p_gender: gender ?? null,
    p_precinct: precinct ?? null,
    p_min_support: min_support,
    p_super_voter: super_voter,
    p_flag: flag ?? null,
  });
  if (error) return { count: 0, note: "Could not read voter data right now." };

  const applied: Json = {};
  if (party) applied.party = party;
  if (race) applied.race = race;
  if (gender) applied.gender = gender;
  if (precinct) applied.precinct = precinct;
  if (min_support != null) applied.min_support = min_support;
  if (super_voter != null) applied.super_voter = super_voter;
  if (flag) applied.flag = flag;
  return { count: Number(data ?? 0), filters: applied };
}

async function voterBreakdown(ctx: ToolCtx, input: Json): Promise<Json> {
  if (!ctx.campaignId) return { buckets: {}, ...NO_CAMPAIGN };
  const by = oneOf(input.by, DIMENSIONS);
  if (!by) return { buckets: {}, note: "Invalid 'by' dimension." };

  const { data, error } = await ctx.db.rpc("campaign_voter_breakdown", {
    p_campaign: ctx.campaignId,
    p_dimension: by,
  });
  if (error) return { buckets: {}, note: "Could not read voter data right now." };

  const rows = (data ?? []) as { bucket: string; n: number }[];
  const buckets: Record<string, number> = {};
  for (const r of rows) buckets[r.bucket] = Number(r.n);
  return { by, buckets };
}

async function turfSummary(ctx: ToolCtx): Promise<Json> {
  if (!ctx.campaignId) return { turfs: [], ...NO_CAMPAIGN };
  const { data, error } = await ctx.db
    .from("turfs")
    .select("name, status, door_count, voter_count, assignee_id")
    .eq("campaign_id", ctx.campaignId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return { turfs: [], note: "Could not read turf data right now." };

  const turfs = (data ?? []).map((t) => ({
    name: t.name,
    status: t.status,
    doors: t.door_count ?? 0,
    voters: t.voter_count ?? 0,
    assigned: t.assignee_id != null,
  }));
  return { count: turfs.length, turfs };
}

// Mirrors the HQ page's contacts logic: "made" = someone was actually reached
// (drop a NO_CONTACT result), door rate = reached/attempts. Capped fetch.
const NO_CONTACT_RESULTS = new Set(["not-home", "lit-dropped"]);
const FIELD_FETCH_CAP = 5000;

async function fieldStats(ctx: ToolCtx, input: Json): Promise<Json> {
  if (!ctx.campaignId) return { ...NO_CAMPAIGN, days: 14, doors_knocked: 0, contacts_made: 0, supporters_idd: 0 };
  const days = clampInt(input.days, 1, 90, 14);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [contactsRes, supportersRes] = await Promise.all([
    ctx.db
      .from("contacts")
      .select("channel, result")
      .eq("campaign_id", ctx.campaignId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(FIELD_FETCH_CAP),
    // Supporters ID'd campaign-wide = voters scored 4–5 (HQ's primary definition).
    ctx.db
      .from("voters")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", ctx.campaignId)
      .gte("support", 4),
  ]);
  if (contactsRes.error) return { note: "Could not read field data right now.", days };

  const rows = (contactsRes.data ?? []) as { channel: string | null; result: string | null }[];
  let doorsKnocked = 0;
  let doorsReached = 0;
  let contactsMade = 0;
  for (const r of rows) {
    const reached = !NO_CONTACT_RESULTS.has(r.result ?? "");
    if (reached) contactsMade++;
    if (r.channel === "door") {
      doorsKnocked++;
      if (reached) doorsReached++;
    }
  }
  const contactRatePct = doorsKnocked > 0 ? Math.round((doorsReached / doorsKnocked) * 100) : 0;
  return {
    days,
    doors_knocked: doorsKnocked,
    contacts_made: contactsMade,
    door_contact_rate_pct: contactRatePct,
    supporters_idd: supportersRes.count ?? 0,
    capped: rows.length >= FIELD_FETCH_CAP,
  };
}

async function runTool(ctx: ToolCtx, name: string, input: Json): Promise<Json> {
  switch (name) {
    case "count_voters":
      return countVoters(ctx, input);
    case "voter_breakdown":
      return voterBreakdown(ctx, input);
    case "turf_summary":
      return turfSummary(ctx);
    case "field_stats":
      return fieldStats(ctx, input);
    default:
      return { note: `Unknown tool '${name}'.` };
  }
}

type Msg = { role: "user" | "assistant"; content: string };
// Accumulated usage across every turn of the loop (input/output/cache tokens).
type Totals = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
function addUsage(t: Totals, u: Anthropic.Usage | undefined): void {
  if (!u) return;
  t.input_tokens += u.input_tokens ?? 0;
  t.output_tokens += u.output_tokens ?? 0;
  t.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response("Ask Candi isn't configured yet — ANTHROPIC_API_KEY is missing on the server.", { status: 503 });
  }

  // Require a signed-in user — these endpoints call the paid Anthropic API.
  const userId = await requireUser();
  if (!userId) return new Response("Sign in to use Ask Candi.", { status: 401 });
  if (rateLimited(userId)) return new Response("You're sending messages too fast — give it a moment.", { status: 429 });

  let messages: Msg[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.messages)) messages = body.messages as Msg[];
  } catch {
    /* fall through to validation */
  }
  messages = messages
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
    .slice(-20); // keep recent turns; bound the context
  if (!messages.length) return new Response("No message provided.", { status: 400 });

  // Active campaign (RLS-scoped) + the session DB client used by every tool.
  const campaignId = await getActiveCampaignId();
  const db = await createClient();
  const ctx: ToolCtx = { db, campaignId };

  const anthropic = new Anthropic({ apiKey: key });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const totals: Totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
      try {
        // Conversation grows as we append assistant tool_use turns + tool_result turns.
        const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
        let toldChecking = false;

        // ── Bounded agentic loop ──────────────────────────────────────────────
        // Up to MAX_TURNS calls. While Claude asks for tools, run them, feed the
        // results back, and continue. We only STREAM the final (text) turn.
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const last = turn === MAX_TURNS - 1;

          if (last) {
            // Final allowed turn: forbid more tools and stream the answer text.
            const ms = anthropic.messages.stream({
              model: MODEL,
              max_tokens: MAX_TOKENS,
              system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
              tools: TOOLS,
              tool_choice: { type: "none" }, // must answer now, no more tool calls
              messages: convo,
            });
            for await (const event of ms) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                controller.enqueue(encoder.encode(event.delta.text));
              }
            }
            addUsage(totals, (await ms.finalMessage()).usage);
            break;
          }

          // Non-final turn: a single non-streamed call so we can inspect tool_use.
          const resp = await anthropic.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
            tools: TOOLS,
            messages: convo,
          });
          addUsage(totals, resp.usage);

          if (resp.stop_reason !== "tool_use") {
            // Claude answered directly — stream whatever text it produced.
            for (const block of resp.content) {
              if (block.type === "text") controller.enqueue(encoder.encode(block.text));
            }
            break;
          }

          // Let the user know we're pulling their data (once, before the first run).
          if (!toldChecking) {
            controller.enqueue(encoder.encode("_Checking your data…_\n\n"));
            toldChecking = true;
          }

          // Execute every requested tool; collect tool_result blocks.
          convo.push({ role: "assistant", content: resp.content });
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of resp.content) {
            if (block.type !== "tool_use") continue;
            const out = await runTool(ctx, block.name, (block.input ?? {}) as Json);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(out),
            });
          }
          convo.push({ role: "user", content: toolResults });
        }
      } catch {
        controller.enqueue(encoder.encode("\n\nSorry — I hit an error reaching Candi. Please try again."));
      } finally {
        // Cost monitoring: ONE log line per request, summed across all turns.
        logUsage("chat", userId, MODEL, totals);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
