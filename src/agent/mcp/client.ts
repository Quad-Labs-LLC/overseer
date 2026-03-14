/**
 * MCP (Model Context Protocol) Support
 * Connects to MCP servers for extended tool capabilities.
 *
 * The MCP SDK is optional at runtime. If not installed, connection attempts fail
 * gracefully with a clear last_error message.
 */

import { db } from "../../database/db";
import { createLogger } from "../../lib/logger";
import type { Tool } from "ai";
import { tool } from "ai";
import { z } from "zod";

const logger = createLogger("mcp");

interface LoadedMcpSdk {
  Client: any;
  StdioClientTransport: any;
  SSEClientTransport: any;
}

let sdkLoadPromise: Promise<LoadedMcpSdk | null> | null = null;

async function loadMcpSdk(): Promise<LoadedMcpSdk | null> {
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = (async () => {
    try {
      // Keep specifiers dynamic to avoid hard compile/runtime coupling.
      const clientModulePath = "@modelcontextprotocol/sdk/client/index.js";
      const stdioModulePath = "@modelcontextprotocol/sdk/client/stdio.js";
      const sseModulePath = "@modelcontextprotocol/sdk/client/sse.js";

      const [clientMod, stdioMod, sseMod] = await Promise.all([
        import(clientModulePath),
        import(stdioModulePath),
        import(sseModulePath),
      ]);

      return {
        Client: (clientMod as any).Client,
        StdioClientTransport: (stdioMod as any).StdioClientTransport,
        SSEClientTransport: (sseMod as any).SSEClientTransport,
      };
    } catch (error) {
      logger.warn("MCP SDK not available", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  })();

  return sdkLoadPromise;
}

// Active MCP connections
const mcpClients = new Map<string, any>();
const mcpTools = new Map<string, Map<string, Tool>>();

export interface MCPServer {
  id: number;
  name: string;
  server_type: "stdio" | "sse";
  transport_config: string;
  command: string | null;
  args: string | null;
  env_vars: string | null;
  url: string | null;
  headers: string | null;
  is_active: number;
  auto_connect: number;
  last_connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMCPServerInput {
  name: string;
  server_type: "stdio" | "sse";
  command?: string;
  args?: string[];
  env_vars?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  auto_connect?: boolean;
}

type UpdateMCPServerInput = Partial<CreateMCPServerInput> & {
  is_active?: boolean;
};

function hasColumn(table: string, column: string): boolean {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function buildTransportConfig(input: CreateMCPServerInput): Record<string, unknown> {
  if (input.server_type === "stdio") {
    return {
      command: input.command || null,
      args: input.args || [],
      env_vars: input.env_vars || {},
    };
  }

  return {
    url: input.url || null,
    headers: input.headers || {},
  };
}

/**
 * Get all MCP servers
 */
export function getAllServers(): MCPServer[] {
  const stmt = db.prepare("SELECT * FROM mcp_servers ORDER BY name");
  return stmt.all() as MCPServer[];
}

/**
 * Get active MCP servers
 */
export function getActiveServers(): MCPServer[] {
  const stmt = db.prepare("SELECT * FROM mcp_servers WHERE is_active = 1");
  return stmt.all() as MCPServer[];
}

/**
 * Find server by ID
 */
export function findServerById(id: number): MCPServer | null {
  const stmt = db.prepare("SELECT * FROM mcp_servers WHERE id = ?");
  return stmt.get(id) as MCPServer | null;
}

/**
 * Create a new MCP server
 */
export function createServer(input: CreateMCPServerInput): MCPServer {
  const transportConfig = JSON.stringify(buildTransportConfig(input));

  const withTransportConfig = hasColumn("mcp_servers", "transport_config");

  const result = withTransportConfig
    ? db
        .prepare(
          `INSERT INTO mcp_servers (
            name, server_type, transport_config, command, args, env_vars, url, headers, auto_connect
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.name,
          input.server_type,
          transportConfig,
          input.command || null,
          input.args ? JSON.stringify(input.args) : null,
          input.env_vars ? JSON.stringify(input.env_vars) : null,
          input.url || null,
          input.headers ? JSON.stringify(input.headers) : null,
          input.auto_connect ? 1 : 0,
        )
    : db
        .prepare(
          `INSERT INTO mcp_servers (
            name, server_type, command, args, env_vars, url, headers, auto_connect
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.name,
          input.server_type,
          input.command || null,
          input.args ? JSON.stringify(input.args) : null,
          input.env_vars ? JSON.stringify(input.env_vars) : null,
          input.url || null,
          input.headers ? JSON.stringify(input.headers) : null,
          input.auto_connect ? 1 : 0,
        );

  logger.info("Created MCP server", {
    name: input.name,
    type: input.server_type,
  });

  return findServerById(result.lastInsertRowid as number)!;
}

/**
 * Connect to an MCP server
 */
export async function connectToServer(serverId: number): Promise<boolean> {
  const server = findServerById(serverId);
  if (!server) {
    logger.error("MCP server not found", { serverId });
    return false;
  }

  if (server.is_active !== 1) {
    logger.warn("MCP server is inactive", { serverId, name: server.name });
    return false;
  }

  // Disconnect if already connected
  if (mcpClients.has(server.name)) {
    await disconnectFromServer(serverId);
  }

  const sdk = await loadMcpSdk();
  if (!sdk?.Client || !sdk?.StdioClientTransport || !sdk?.SSEClientTransport) {
    const errorText =
      "@modelcontextprotocol/sdk is not installed. Install it to enable MCP connections.";
    db.prepare("UPDATE mcp_servers SET last_error = ? WHERE id = ?").run(
      errorText,
      serverId,
    );
    logger.error("MCP connect failed: SDK missing", {
      serverId,
      name: server.name,
    });
    return false;
  }

  try {
    let transport;

    const cfg = parseJson<Record<string, unknown>>(server.transport_config, {});

    if (server.server_type === "stdio") {
      const command =
        server.command ||
        (typeof cfg.command === "string" ? cfg.command : null);
      if (!command) {
        throw new Error("STDIO server requires a command");
      }

      const args =
        parseJson<string[]>(server.args, []) ||
        (Array.isArray(cfg.args) ? (cfg.args as string[]) : []);
      const env =
        parseJson<Record<string, string>>(server.env_vars, {}) ||
        (typeof cfg.env_vars === "object" && cfg.env_vars
          ? (cfg.env_vars as Record<string, string>)
          : {});

      transport = new sdk.StdioClientTransport({
        command,
        args,
        env: { ...process.env, ...env },
      });
    } else if (server.server_type === "sse") {
      const url =
        server.url ||
        (typeof cfg.url === "string" ? cfg.url : null);
      if (!url) {
        throw new Error("SSE server requires a URL");
      }

      const headers =
        parseJson<Record<string, string>>(server.headers, {}) ||
        (typeof cfg.headers === "object" && cfg.headers
          ? (cfg.headers as Record<string, string>)
          : {});

      transport = new sdk.SSEClientTransport(new URL(url), {
        eventSourceInit: { headers },
      });
    } else {
      throw new Error(`Unknown server type: ${server.server_type}`);
    }

    const client = new sdk.Client(
      { name: "overseer-mcp-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    mcpClients.set(server.name, client);

    // Load tools from this server
    await loadToolsFromServer(server.name, client);

    db.prepare(
      `UPDATE mcp_servers
       SET last_connected_at = CURRENT_TIMESTAMP, last_error = NULL
       WHERE id = ?`,
    ).run(serverId);

    logger.info("Connected to MCP server", {
      id: serverId,
      name: server.name,
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    db.prepare(
      `UPDATE mcp_servers
       SET last_error = ?
       WHERE id = ?`,
    ).run(errorMessage, serverId);

    logger.error("Failed to connect to MCP server", {
      id: serverId,
      name: server.name,
      error: errorMessage,
    });
    return false;
  }
}

/**
 * Disconnect from an MCP server
 */
export async function disconnectFromServer(serverId: number): Promise<void> {
  const server = findServerById(serverId);
  if (!server) return;

  const client = mcpClients.get(server.name);
  if (!client) return;

  try {
    await client.close();
  } catch (error) {
    logger.error("Error disconnecting from MCP server", {
      server: server.name,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    mcpClients.delete(server.name);
    mcpTools.delete(server.name);
    logger.info("Disconnected from MCP server", { server: server.name });
  }
}

/**
 * Load tools from an MCP server
 */
async function loadToolsFromServer(serverName: string, client: any): Promise<void> {
  try {
    const toolsResponse = await client.listTools();
    const serverTools = new Map<string, Tool>();

    for (const mcpTool of toolsResponse.tools || []) {
      // Convert MCP tool to AI SDK tool
      const aiTool = tool<any, any>({
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        inputSchema: convertMCPSchemaToZod(mcpTool.inputSchema),
        execute: async (args: Record<string, any>) => {
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: args,
          });
          return JSON.stringify(result);
        },
      });

      serverTools.set(mcpTool.name, aiTool);
    }

    mcpTools.set(serverName, serverTools);
    logger.info("Loaded MCP tools", {
      server: serverName,
      count: serverTools.size,
    });
  } catch (error) {
    logger.error("Failed to load MCP tools", {
      server: serverName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Convert JSON schema to Zod schema
 */
function convertMCPSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || schema.type !== "object") {
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      const propSchema = prop as any;
      let zodType: z.ZodTypeAny;

      switch (propSchema.type) {
        case "string":
          zodType = z.string();
          break;
        case "number":
          zodType = z.number();
          break;
        case "integer":
          zodType = z.number().int();
          break;
        case "boolean":
          zodType = z.boolean();
          break;
        case "array":
          zodType = z.array(z.any());
          break;
        case "object":
          zodType = convertMCPSchemaToZod(propSchema);
          break;
        default:
          zodType = z.any();
      }

      if (propSchema.description) {
        zodType = zodType.describe(propSchema.description);
      }

      shape[key] = zodType;
    }
  }

  let zodSchema = z.object(shape);

  // Handle required fields
  if (schema.required && Array.isArray(schema.required)) {
    const optionalShape: Record<string, z.ZodTypeAny> = {};
    for (const [key, val] of Object.entries(shape)) {
      if (!schema.required.includes(key)) {
        optionalShape[key] = val.optional();
      } else {
        optionalShape[key] = val;
      }
    }
    zodSchema = z.object(optionalShape);
  }

  return zodSchema;
}

/**
 * Get all tools from all connected MCP servers
 */
export function getAllMCPTools(): Record<string, Tool> {
  const allTools: Record<string, Tool> = {};

  for (const [serverName, tools] of mcpTools) {
    for (const [toolName, loadedTool] of tools) {
      // Prefix tool name with server to avoid conflicts.
      allTools[`${serverName}_${toolName}`] = loadedTool;
    }
  }

  return allTools;
}

/**
 * Connect to all auto-connect servers
 */
export async function connectAutoConnectServers(): Promise<void> {
  const servers = db
    .prepare("SELECT id FROM mcp_servers WHERE auto_connect = 1 AND is_active = 1")
    .all() as Array<{ id: number }>;

  for (const server of servers) {
    await connectToServer(server.id);
  }
}

/**
 * Update server configuration
 */
export function updateServer(
  serverId: number,
  updates: UpdateMCPServerInput,
): void {
  const fields: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.server_type !== undefined) {
    fields.push("server_type = ?");
    values.push(updates.server_type);
  }
  if (updates.command !== undefined) {
    fields.push("command = ?");
    values.push(updates.command);
  }
  if (updates.args !== undefined) {
    fields.push("args = ?");
    values.push(JSON.stringify(updates.args));
  }
  if (updates.env_vars !== undefined) {
    fields.push("env_vars = ?");
    values.push(JSON.stringify(updates.env_vars));
  }
  if (updates.url !== undefined) {
    fields.push("url = ?");
    values.push(updates.url);
  }
  if (updates.headers !== undefined) {
    fields.push("headers = ?");
    values.push(JSON.stringify(updates.headers));
  }
  if (updates.auto_connect !== undefined) {
    fields.push("auto_connect = ?");
    values.push(updates.auto_connect ? 1 : 0);
  }
  if (updates.is_active !== undefined) {
    fields.push("is_active = ?");
    values.push(updates.is_active ? 1 : 0);
  }

  if (hasColumn("mcp_servers", "transport_config")) {
    const existing = findServerById(serverId);
    if (existing) {
      const nextType = updates.server_type ?? existing.server_type;
      const nextConfig =
        nextType === "stdio"
          ? {
              command: updates.command ?? existing.command,
              args:
                updates.args ??
                parseJson<string[]>(existing.args, []),
              env_vars:
                updates.env_vars ??
                parseJson<Record<string, string>>(existing.env_vars, {}),
            }
          : {
              url: updates.url ?? existing.url,
              headers:
                updates.headers ??
                parseJson<Record<string, string>>(existing.headers, {}),
            };

      fields.push("transport_config = ?");
      values.push(JSON.stringify(nextConfig));
    }
  }

  const stmt = db.prepare(`
    UPDATE mcp_servers
    SET ${fields.join(", ")}
    WHERE id = ?
  `);

  stmt.run(...values, serverId);
}

/**
 * Delete an MCP server
 */
export async function deleteServer(serverId: number): Promise<void> {
  const server = findServerById(serverId);
  if (server) {
    await disconnectFromServer(serverId);
  }

  db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(serverId);
}

/**
 * Get connection status
 */
export function getConnectionStatus(): Array<{
  server: string;
  connected: boolean;
  tools: number;
}> {
  return Array.from(mcpClients.keys()).map((serverName) => ({
    server: serverName,
    connected: true,
    tools: mcpTools.get(serverName)?.size || 0,
  }));
}
