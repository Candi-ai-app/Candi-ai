import Anthropic from "@anthropic-ai/sdk";
import { requireUser, rateLimited, logUsage } from "@/lib/ai-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Candi's onboarding parser. It reads a free-text "describe your race" blurb and
// extracts ONLY the campaign fields the user actually stated — nonpartisan, no
// invented details. Output is forced through a tool so we always get clean JSON.
const SYSTEM = `You are Candi, the nonpartisan assistant inside the CANDI campaign operating system.

A user is starting a new campaign and described their race in free text. Extract the structured fields they actually stated and call the set_campaign tool.

Rules:
- Be strictly NONPARTISAN. Never infer or add a party, ideology, or stance.
- Only fill a field if the user clearly stated it. Leave anything unstated empty — do NOT guess a county, district, office, or full name from partial hints.
- "candidate" is the person's name. "office" is the seat (e.g. "State Senate", "County Commission"). "state" is the US state. "county" is the county. "district" is the district label if given.
- Normalize lightly: full state name (e.g. "PA" -> "Pennsylvania"), Title Case names. Do not expand abbreviations you are unsure about.`;

const SET_CAMPAIGN = {
  name: "set_campaign",
  description: "Record the campaign fields the user explicitly stated. Omit any field not stated.",
  input_schema: {
    type: "object" as const,
    properties: {
      candidate: { type: "string", description: "Candidate's name, if stated." },
      office: { type: "string", description: "Office / seat being sought, if stated." },
      state: { type: "string", description: "US state (full name), if stated." },
      county: { type: "string", description: "County, if stated." },
      district: { type: "string", description: "District label, if stated." },
    },
  },
};

type Filled = {
  candidate?: string;
  office?: string;
  state?: string;
  county?: string;
  district?: string;
};

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Auto-fill isn't configured yet — ANTHROPIC_API_KEY is missing on the server." },
      { status: 503 }
    );
  }

  const userId = await requireUser();
  if (!userId) return Response.json({ error: "Sign in to use auto-fill." }, { status: 401 });
  if (rateLimited(userId)) return Response.json({ error: "Slow down a moment, then try again." }, { status: 429 });

  let description = "";
  try {
    const body = await req.json();
    if (typeof body?.description === "string") description = body.description.trim();
  } catch {
    /* fall through to validation */
  }
  if (!description) return Response.json({ error: "No description provided." }, { status: 400 });
  // Bound the input — a race description is short.
  description = description.slice(0, 1200);

  const anthropic = new Anthropic({ apiKey: key });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [SET_CAMPAIGN],
      // Force the model to emit structured output via the tool.
      tool_choice: { type: "tool", name: "set_campaign" },
      messages: [{ role: "user", content: description }],
    });
    logUsage("onboarding", userId, "claude-sonnet-4-6", msg.usage);

    const toolUse = msg.content.find((b) => b.type === "tool_use");
    const input = (toolUse && "input" in toolUse ? toolUse.input : {}) as Filled;

    // Whitelist + trim; never return anything outside the known fields.
    const clean: Filled = {};
    for (const k of ["candidate", "office", "state", "county", "district"] as const) {
      const v = input[k];
      if (typeof v === "string" && v.trim()) clean[k] = v.trim();
    }
    return Response.json(clean, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Couldn't reach Candi. Please fill the fields manually." }, { status: 502 });
  }
}
