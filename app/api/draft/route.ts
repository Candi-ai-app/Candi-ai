import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Drafts a short, nonpartisan canvassing/text message for one voter. Same posture
// as Ask Candi (app/api/chat): strictly nonpartisan, helps whoever runs the
// campaign. Returns plain text (one message, no preamble) so the detail card can
// drop it straight into a copyable panel.
const SYSTEM = `You are Candi, the AI assistant built into the CANDI campaign operating system — a modern, NONPARTISAN alternative to NGP VAN.

Your job here: write ONE short outreach message (a canvassing or text/SMS message) that a campaign volunteer could send to a specific voter, given that voter's context.

Rules:
- Be strictly NONPARTISAN. Never advocate for a party or ideology. You help the campaign reach this voter respectfully — you do not know or assume which side they're on beyond the support score given.
- Keep it SHORT: 2–4 sentences, friendly, plain language, suitable for a text message. No markdown, no headers, no quotes around it, no "Here's a draft:" preamble — output only the message body itself.
- Personalize lightly using the provided context (first name, and tailor tone to the support score). Use a [Volunteer] placeholder for the sender name and [Candidate] for the candidate — don't invent real names.
- If support is high (4–5): warm, thank them / invite to help or vote. If undecided (3): ask an open question about what issues matter to them. If low (1–2) or unknown: be brief, respectful, low-pressure.
- Never include anything illegal or misleading (no impersonation, no false claims, no intimidation).`;

type VoterCtx = {
  name?: string;
  party?: string;
  support?: number;
  precinct?: string;
};

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(
      "Draft msg isn't configured yet — ANTHROPIC_API_KEY is missing on the server.",
      { status: 503 }
    );
  }

  let v: VoterCtx = {};
  try {
    const body = await req.json();
    if (body && typeof body === "object") v = body as VoterCtx;
  } catch {
    /* fall through to validation */
  }

  const name = typeof v.name === "string" ? v.name.trim().slice(0, 80) : "";
  if (!name) return new Response("No voter provided.", { status: 400 });

  const partyFull =
    v.party === "D" ? "Democrat" : v.party === "R" ? "Republican" : v.party === "I" ? "Independent / NPA" : "Unknown";
  const support =
    typeof v.support === "number" && v.support >= 1 && v.support <= 5
      ? `${v.support}/5`
      : "unknown";
  const precinct = typeof v.precinct === "string" && v.precinct ? v.precinct : "unknown";

  const userPrompt = `Write one short outreach message for this voter.
- Name: ${name}
- Registered party: ${partyFull}
- Support score (1=strong opposed, 5=strong support): ${support}
- Precinct: ${precinct}

Output only the message body.`;

  try {
    const anthropic = new Anthropic({ apiKey: key });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 320,
      // Cache the static system prompt to cut latency + cost across drafts.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return new Response("Couldn't draft a message — please try again.", { status: 502 });
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Sorry — I hit an error drafting that. Please try again.", { status: 502 });
  }
}
