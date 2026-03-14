import { NextRequest, NextResponse } from "next/server";
import { cronJobsModel } from "@/database";
import { triggerJob } from "@/lib/cron-engine";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, Permission, PermissionError, requirePermission } from "@/lib/permissions";

/**
 * POST /api/cron/[id]/run — Manually trigger a cron job
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(user, Permission.AGENT_EXECUTE, {
      resource: "cron_jobs",
      metadata: { action: "run_now" },
    });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const { id } = await params;
  const jobId = parseInt(id);
  const job = cronJobsModel.findById(jobId);

  if (!job) {
    return NextResponse.json({ error: "Cron job not found" }, { status: 404 });
  }

  const canViewAll = hasPermission(user, Permission.TENANT_VIEW_ALL);
  if (!canViewAll && job.owner_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (job.last_status === "running") {
    return NextResponse.json(
      { error: `Cron job "${job.name}" is already running.` },
      { status: 409 },
    );
  }

  // Trigger execution in background — don't await
  triggerJob(jobId).catch((err) => {
    console.error(`Failed to trigger cron job ${jobId}:`, err);
  });

  return NextResponse.json({
    success: true,
    message: `Cron job "${job.name}" triggered. Execution started in background.`,
  });
}
