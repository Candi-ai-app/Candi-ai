import Anthropic from "@anthropic-ai/sdk";
import { requireUser, rateLimited, logUsage } from "@/lib/ai-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// "Candi" — the in-app assistant. Nonpartisan by design: it helps whoever is running
// the campaign run it well, and never advocates for a party or ideology.
const SYSTEM = `You are Candi, the AI assistant built into the CANDI campaign operating system — a modern, nonpartisan alternative to NGP VAN.

You help campaign staff with: voter targeting and list-building, turf cutting, canvassing strategy, phone/text outreach, scripts, vote-by-mail chase, GOTV, and making sense of their data.

Rules:
- Be strictly NONPARTISAN. Never advocate for a party, candidate, or ideology. Help the user run *their* campaign effectively, whoever they are.
- Be concise and practical. Prefer short, actionable answers; expand only when asked.
- You live inside the app (modules: HQ, Voters, Turf/Canvassing, Scripts, Texts). Speak in terms of those features.
- If you lack live data, say what you'd look at and where to find it in the app — don't invent specific numbers.
- Never help with anything illegal (voter suppression, intimidation, fraud, impersonation, scraping protected data).`;

type Msg = { role: "user" | "assistant"; content: string };

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

  const anthropic = new Anthropic({ apiKey: key });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const ms = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          // cache the (static) system prompt to cut latency + cost on repeat turns
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of ms) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await ms.finalMessage();
        logUsage("chat", userId, "claude-sonnet-4-6", final.usage);
      } catch {
        controller.enqueue(encoder.encode("\n\nSorry — I hit an error reaching Candi. Please try again."));
      } finally {
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
