import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultModel, getModelById } from "@/agent/providers";
import { loadSoul } from "@/agent/soul";
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

  const systemPrompt = `${soul}

---

## Session Context
- **Date/Time**: ${new Date().toISOString()}
- **User**: ${user.username}
- **Interface**: WebUI Chat

## Response Style
- Be concise and helpful.
- Use markdown formatting when appropriate.
- For code, use fenced code blocks with language tags.
`;

  logger.info("WebUI chat request", {
    userId: user.id,
    messageCount: messages.length,
    providerId,
  });

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    maxRetries: 2,
  });

  return result.toUIMessageStreamResponse();
}
