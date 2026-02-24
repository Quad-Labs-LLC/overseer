import { z } from "zod/v4";
import { router, authedProcedure } from "../trpc";
import { db } from "@/database/db";
import { getCostTracker } from "@/lib/cost-tracker";
import { getMemoryStatsForUser } from "@/agent/super-memory";
import { getStats as getSubAgentStats } from "@/agent/subagents/manager";
import { getContextStats } from "@/agent/infinite-context";
import { hasPermission, Permission } from "@/lib/permissions";

export const analyticsRouter = router({
  get: authedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const canViewAll = hasPermission(ctx.user, Permission.TENANT_VIEW_ALL);
      const ownerId = canViewAll ? undefined : ctx.user.id;

      try {
        getCostTracker();
      } catch {
        // Continue with partial data if init fails
      }

      let dailyData: { day: string; cost: number; requests: number; tokens: number }[] = [];
      try {
        dailyData = (typeof ownerId === "number"
          ? db
              .prepare(
                `SELECT
                  DATE(created_at) as day,
                  CAST(COALESCE(SUM(cost_usd), 0) AS REAL) as cost,
                  CAST(COUNT(*) AS INTEGER) as requests,
                  CAST(COALESCE(SUM(input_tokens + output_tokens), 0) AS INTEGER) as tokens
                FROM cost_tracking
                WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' day')
                GROUP BY DATE(created_at)
                ORDER BY day ASC`
              )
              .all(String(ownerId), input.days)
          : db
              .prepare(
                `SELECT
                  DATE(created_at) as day,
                  CAST(COALESCE(SUM(cost_usd), 0) AS REAL) as cost,
                  CAST(COUNT(*) AS INTEGER) as requests,
                  CAST(COALESCE(SUM(input_tokens + output_tokens), 0) AS INTEGER) as tokens
                FROM cost_tracking
                WHERE created_at >= datetime('now', '-' || ? || ' day')
                GROUP BY DATE(created_at)
                ORDER BY day ASC`
              )
              .all(input.days)) as typeof dailyData;
      } catch {
        dailyData = [];
      }

      let modelData: { model: string; cost: number; requests: number; tokens: number }[] = [];
      try {
        modelData = (typeof ownerId === "number"
          ? db
              .prepare(
                `SELECT
                  model,
                  CAST(COALESCE(SUM(cost_usd), 0) AS REAL) as cost,
                  CAST(COUNT(*) AS INTEGER) as requests,
                  CAST(COALESCE(SUM(input_tokens + output_tokens), 0) AS INTEGER) as tokens
                FROM cost_tracking
                WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' day')
                GROUP BY model
                ORDER BY cost DESC
                LIMIT 15`
              )
              .all(String(ownerId), input.days)
          : db
              .prepare(
                `SELECT
                  model,
                  CAST(COALESCE(SUM(cost_usd), 0) AS REAL) as cost,
                  CAST(COUNT(*) AS INTEGER) as requests,
                  CAST(COALESCE(SUM(input_tokens + output_tokens), 0) AS INTEGER) as tokens
                FROM cost_tracking
                WHERE created_at >= datetime('now', '-' || ? || ' day')
                GROUP BY model
                ORDER BY cost DESC
                LIMIT 15`
              )
              .all(input.days)) as typeof modelData;
      } catch {
        modelData = [];
      }

      const topUsers = canViewAll ? getCostTracker().getTopUsers(20) : [];

      let convStats = { total: 0, tokens: 0, messages: 0 };
      try {
        if (typeof ownerId === "number") {
          convStats = db
            .prepare(
              `SELECT 
                CAST(COUNT(*) AS INTEGER) as total,
                CAST(COALESCE(SUM(total_tokens), 0) AS INTEGER) as tokens,
                CAST(COALESCE(SUM(message_count), 0) AS INTEGER) as messages
              FROM conversations
              WHERE owner_user_id = ?`
            )
            .get(ownerId) as typeof convStats;
        } else {
          convStats = db
            .prepare(
              `SELECT 
                CAST(COUNT(*) AS INTEGER) as total,
                CAST(COALESCE(SUM(total_tokens), 0) AS INTEGER) as tokens,
                CAST(COALESCE(SUM(message_count), 0) AS INTEGER) as messages
              FROM conversations`
            )
            .get() as typeof convStats;
        }
      } catch {
        // ignore
      }

      let memoryStats = { total: 0, byCategory: {} as Record<string, number>, avgImportance: 0 };
      try {
        memoryStats = getMemoryStatsForUser(ctx.user.id);
      } catch {
        // ignore
      }

      let subAgentStats = { total: 0, by_type: {} as Record<string, number>, completed: 0, error: 0, working: 0 };
      try {
        subAgentStats = getSubAgentStats();
      } catch {
        // ignore
      }

      let contextStats: ReturnType<typeof getContextStats> = { totalSummaries: 0, conversations: [] };
      try {
        contextStats = getContextStats(ownerId);
      } catch {
        // ignore
      }

      const systemHealth = {
        api: "healthy",
        database: "connected",
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      };

      return {
        dailyData,
        modelData,
        topUsers,
        convStats,
        memoryStats,
        subAgentStats,
        contextStats,
        systemHealth,
      };
    }),
});
