import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/permissions";
import { findServerById, disconnectFromServer } from "@/agent/mcp/client";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user, Permission.MCP_DISCONNECT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const serverId = Number.parseInt(id, 10);
  if (!Number.isFinite(serverId) || serverId <= 0) {
    return NextResponse.json({ error: "Invalid server id" }, { status: 400 });
  }

  const server = findServerById(serverId);
  if (!server) {
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  }

  await disconnectFromServer(serverId);
  return NextResponse.json({ success: true });
}
