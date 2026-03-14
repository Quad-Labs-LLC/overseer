import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/permissions";
import {
  findServerById,
  updateServer,
  deleteServer,
  disconnectFromServer,
} from "@/agent/mcp/client";

async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!hasPermission(user, permission)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, user };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission(Permission.MCP_MANAGE);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const serverId = Number.parseInt(id, 10);
  if (!Number.isFinite(serverId) || serverId <= 0) {
    return NextResponse.json({ error: "Invalid server id" }, { status: 400 });
  }

  const existing = findServerById(serverId);
  if (!existing) {
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Parameters<typeof updateServer>[1] = {};

  if (typeof body?.name === "string") updates.name = body.name;
  if (body?.server_type === "stdio" || body?.server_type === "sse") {
    updates.server_type = body.server_type;
  }
  if (typeof body?.command === "string") updates.command = body.command;
  if (Array.isArray(body?.args)) updates.args = body.args.filter((v: unknown) => typeof v === "string");
  if (body?.env_vars && typeof body.env_vars === "object") updates.env_vars = body.env_vars;
  if (typeof body?.url === "string") updates.url = body.url;
  if (body?.headers && typeof body.headers === "object") updates.headers = body.headers;
  if (typeof body?.auto_connect === "boolean") updates.auto_connect = body.auto_connect;
  if (typeof body?.is_active === "boolean") updates.is_active = body.is_active;

  updateServer(serverId, updates);

  if (updates.is_active === false) {
    await disconnectFromServer(serverId);
  }

  const updated = findServerById(serverId);
  return NextResponse.json({ success: true, server: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission(Permission.MCP_MANAGE);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const serverId = Number.parseInt(id, 10);
  if (!Number.isFinite(serverId) || serverId <= 0) {
    return NextResponse.json({ error: "Invalid server id" }, { status: 400 });
  }

  const existing = findServerById(serverId);
  if (!existing) {
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  }

  await deleteServer(serverId);
  return NextResponse.json({ success: true });
}
