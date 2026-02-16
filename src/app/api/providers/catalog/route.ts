import { NextResponse } from "next/server";
import { getDynamicProviderCatalog } from "@/agent/dynamic-provider-catalog";
import { getAllProvidersInfo } from "@/agent/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CatalogProvider = {
  id: string;
  npm?: string;
  [key: string]: unknown;
};

function inferRuntimeAdapter(providerId: string, npm?: string): string {
  if (npm === "@ai-sdk/openai") return "openai";
  if (npm === "@ai-sdk/anthropic") return "anthropic";
  if (npm === "@ai-sdk/google") return "google";
  if (npm === "@ai-sdk/azure") return "azure";
  if (npm === "@ai-sdk/groq") return "groq";
  if (npm === "@ai-sdk/cohere") return "cohere";
  if (npm === "@ai-sdk/mistral") return "mistral";
  if (npm === "@ai-sdk/xai") return "xai";
  if (npm === "@ai-sdk/perplexity") return "perplexity";
  if (npm === "@ai-sdk/fireworks") return "fireworks";
  if (npm === "@ai-sdk/togetherai") return "togetherai";
  if (npm === "@ai-sdk/deepinfra") return "deepinfra";
  if (npm === "@ai-sdk/deepseek") return "deepseek";
  if (npm === "@ai-sdk/amazon-bedrock") return "amazon-bedrock";

  if (providerId === "openai") return "openai";
  if (providerId === "anthropic") return "anthropic";
  if (providerId === "google") return "google";
  if (providerId === "azure") return "azure";
  if (providerId === "groq") return "groq";
  if (providerId === "cohere") return "cohere";
  if (providerId === "mistral") return "mistral";
  if (providerId === "xai") return "xai";
  if (providerId === "perplexity") return "perplexity";
  if (providerId === "fireworks") return "fireworks";
  if (providerId === "togetherai") return "togetherai";
  if (providerId === "deepinfra") return "deepinfra";
  if (providerId === "deepseek") return "deepseek";
  if (providerId === "amazon-bedrock") return "amazon-bedrock";

  return "openai-compatible";
}

export async function GET() {
  // This endpoint returns only public catalog metadata (no secrets). It is used
  // by the dashboard and onboarding flows, so keep it resilient to auth/session
  // issues and transient upstream failures.
  try {
    const staticFallback = getAllProvidersInfo().map((p) => ({
      id: p.id,
      displayName: p.displayName,
      requiresKey: p.requiresKey,
      description: p.description,
      npm: p.npm,
      supportsThinking: p.supportsThinking,
      supportsMultimodal: p.supportsMultimodal,
      models: p.models,
      source: "static" as const,
    }));

    // Hard cap server latency. If models.dev hangs (it happens in some hosted
    // environments), return the static registry immediately.
    const timeoutMs = Number.parseInt(
      process.env.OVERSEER_PROVIDER_CATALOG_TIMEOUT_MS || "2500",
      10,
    );

    const providers =
      await Promise.race([
        getDynamicProviderCatalog(),
        new Promise<typeof staticFallback>((resolve) =>
          setTimeout(() => resolve(staticFallback as any), timeoutMs),
        ) as any,
      ]);

    return NextResponse.json({
      providers: (providers as CatalogProvider[]).map((provider) => ({
        ...provider,
        runtimeAdapter: inferRuntimeAdapter(provider.id, provider.npm),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        providers: getAllProvidersInfo().map((p) => ({
          id: p.id,
          displayName: p.displayName,
          requiresKey: p.requiresKey,
          description: p.description,
          npm: p.npm,
          supportsThinking: p.supportsThinking,
          supportsMultimodal: p.supportsMultimodal,
          models: p.models,
          source: "static" as const,
          runtimeAdapter: inferRuntimeAdapter(p.id, p.npm),
        })),
        error: `Failed to load provider catalog: ${msg}`,
      },
      { status: 500 },
    );
  }
}
