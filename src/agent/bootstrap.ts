import { createLogger } from "@/lib/logger";
import { initializeAgent } from "./init";

const logger = createLogger("agent:bootstrap");

let initPromise: Promise<void> | null = null;

/**
 * Ensures agent runtime services are initialized once per process:
 * - built-in skills sync
 * - MCP auto-connect (best effort)
 */
export async function ensureAgentReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const result = await initializeAgent();
      if (!result.success) {
        logger.warn("Agent initialized with warnings", {
          errors: result.errors,
          mcpConnected: result.mcp.connected,
          activeSkills: result.skills.active,
        });
      }
    })().catch((err) => {
      // Allow retry on next request if initialization hard-fails.
      initPromise = null;
      throw err;
    });
  }

  await initPromise;
}
