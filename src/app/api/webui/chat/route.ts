import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultModel, getModelById } from "@/agent/providers";
import { loadSoul } from "@/agent/soul";
import { loadUserIdentity } from "@/agent/identity";
import { getSmartMemoryContextForUser } from "@/agent/super-memory";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const logger = createLogger("webui-chat");

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const {
    messages,
    providerId,
  }: {
    messages: UIMessage[];
    providerId?: number;
  } = body;

  const model = providerId ? getModelById(providerId) : getDefaultModel();
  if (!model) {
    return new Response(
      JSON.stringify({ error: "No LLM provider configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const soul = loadSoul(user.id);
  const identity = loadUserIdentity(user.id);
  const memoryContext = getSmartMemoryContextForUser(user.id);

  const identitySection = identity.trim()
    ? `\n\n---\n\n## Who I'm talking to\n${identity.trim()}`
    : "";

  const now = new Date().toLocaleString("en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  const systemPrompt = `${soul}${identitySection}${memoryContext}

---

- **Right now**: ${now}
- **Talking to**: ${user.username}

I talk like a person — short when short is enough, detailed when it matters. No filler, no "certainly!", no unnecessary preamble. I use markdown when it actually helps (code blocks for code, structure when content needs it). If I'm not sure about something, I say so. If something is wrong, I say that too.
`;

  logger.info("WebUI chat request", {
    userId: user.id,
    messageCount: messages.length,
    providerId,
    hasIdentity: !!identity.trim(),
    hasMemory: !!memoryContext.trim(),
  });

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    maxRetries: 2,
  });

  return result.toUIMessageStreamResponse();
}
