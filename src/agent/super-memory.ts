/**
 * Super Memory System
 *
 * Two-tier memory architecture:
 *
 *  ┌─ SHORT-TERM  (tier='short_term') ─────────────────────────────┐
 *  │  Session/conversation-scoped facts, recent context, temp       │
 *  │  notes. Auto-expires via expires_at. Purged on conversation    │
 *  │  end or after TTL (default 24 h).                              │
 *  └───────────────────────────────────────────────────────────────┘
 *
 *  ┌─ LONG-TERM  (tier='long_term') ────────────────────────────────┐
 *  │  Persistent cross-conversation knowledge: preferences, facts   │
 *  │  about the user, projects, identities. Never auto-expires.     │
 *  └───────────────────────────────────────────────────────────────┘
 *
 * Smart retrieval scores entries by: importance × recency × tier-weight.
 * Memory consolidation (AI-powered) merges near-duplicate long-term entries.
 */

import { db } from "../database/db";
import { createLogger } from "../lib/logger";
import { generateText, type LanguageModel } from "ai";
import { getDefaultModel } from "./providers";

const logger = createLogger("super-memory");

export type MemoryTier = "short_term" | "long_term";
export type MemoryCategory = "preference" | "fact" | "project" | "context" | "skill" | "goal" | "custom";

export interface MemoryEntry {
  id: number;
  owner_user_id: number;
  scope: "private" | "shared" | string;
  key: string;
  value: string;
  category: MemoryCategory;
  importance: number;
  tier: MemoryTier;
  expires_at?: string | null;
  conversation_id?: string | null;
  embedding_hint?: string | null;
  source?: string;
  created_at: string;
  updated_at: string;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  relevance: number;
}

// ─── Short-term TTL defaults ────────────────────────────────────────────────

const SHORT_TERM_TTL_HOURS = 24;

function expiresAt(hours = SHORT_TERM_TTL_HOURS): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function getMemoryById(id: number): MemoryEntry | undefined {
  return db.prepare("SELECT * FROM memory WHERE id = ?").get(id) as MemoryEntry | undefined;
}

/**
 * Create a long-term memory entry (persists forever).
 */
export function createMemory(
  ownerUserId: number,
  key: string,
  value: string,
  category: MemoryCategory = "custom",
  importance = 5,
  source?: string,
  scope: MemoryEntry["scope"] = "private",
): MemoryEntry {
  const result = db
    .prepare(
      `INSERT INTO memory (owner_user_id, scope, key, value, category, importance, source, tier)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'long_term')`,
    )
    .run(ownerUserId, scope, key, value, category, importance, source ?? null);

  logger.info("Long-term memory created", { key, category, importance });
  return getMemoryById(result.lastInsertRowid as number)!;
}

/**
 * Create a short-term memory entry (expires after `ttlHours`, default 24 h).
 */
export function createShortTermMemory(
  ownerUserId: number,
  key: string,
  value: string,
  category: MemoryCategory = "context",
  importance = 4,
  source?: string,
  conversationId?: string,
  ttlHours = SHORT_TERM_TTL_HOURS,
): MemoryEntry {
  const exp = expiresAt(ttlHours);
  const result = db
    .prepare(
      `INSERT INTO memory
         (owner_user_id, scope, key, value, category, importance, source, tier, expires_at, conversation_id)
       VALUES (?, 'private', ?, ?, ?, ?, ?, 'short_term', ?, ?)`,
    )
    .run(ownerUserId, key, value, category, importance, source ?? null, exp, conversationId ?? null);

  logger.debug("Short-term memory created", { key, expiresAt: exp });
  return getMemoryById(result.lastInsertRowid as number)!;
}

/**
 * Upsert a long-term memory (update value+importance if key already exists).
 */
export function upsertLongTermMemory(
  ownerUserId: number,
  key: string,
  value: string,
  category: MemoryCategory = "custom",
  importance = 5,
  source?: string,
): MemoryEntry {
  const existing = db
    .prepare("SELECT id FROM memory WHERE owner_user_id = ? AND key = ? AND tier = 'long_term' LIMIT 1")
    .get(ownerUserId, key) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE memory SET value = ?, category = ?, importance = ?, source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(value, category, importance, source ?? null, existing.id);
    return getMemoryById(existing.id)!;
  }

  return createMemory(ownerUserId, key, value, category, importance, source);
}

export function updateMemory(
  id: number,
  updates: Partial<Pick<MemoryEntry, "key" | "value" | "category" | "importance" | "scope" | "tier" | "expires_at">>,
): MemoryEntry | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (fields.length === 0) return getMemoryById(id);

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  db.prepare(`UPDATE memory SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getMemoryById(id);
}

export function deleteMemory(id: number): boolean {
  return (db.prepare("DELETE FROM memory WHERE id = ?").run(id)).changes > 0;
}

// ─── Retrieval ───────────────────────────────────────────────────────────────

/**
 * Purge all expired short-term memories for a user (or all users if not given).
 */
export function purgeExpiredMemories(ownerUserId?: number): number {
  const now = new Date().toISOString();
  const result = ownerUserId
    ? db
        .prepare("DELETE FROM memory WHERE owner_user_id = ? AND tier = 'short_term' AND expires_at IS NOT NULL AND expires_at < ?")
        .run(ownerUserId, now)
    : db
        .prepare("DELETE FROM memory WHERE tier = 'short_term' AND expires_at IS NOT NULL AND expires_at < ?")
        .run(now);
  if (result.changes > 0) logger.info("Purged expired short-term memories", { count: result.changes });
  return result.changes;
}

/**
 * Purge all short-term memories for a specific conversation (call on conversation end).
 */
export function purgeConversationMemories(ownerUserId: number, conversationId: string): number {
  const result = db
    .prepare("DELETE FROM memory WHERE owner_user_id = ? AND conversation_id = ? AND tier = 'short_term'")
    .run(ownerUserId, conversationId);
  return result.changes;
}

export function getShortTermMemoriesForUser(ownerUserId: number): MemoryEntry[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `SELECT * FROM memory
       WHERE owner_user_id = ? AND tier = 'short_term'
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY importance DESC, updated_at DESC`,
    )
    .all(ownerUserId, now) as MemoryEntry[];
}

export function getLongTermMemoriesForUser(
  ownerUserId: number,
  category?: MemoryCategory,
  limit = 80,
): MemoryEntry[] {
  if (category) {
    return db
      .prepare(
        `SELECT * FROM memory
         WHERE (owner_user_id = ? OR scope = 'shared') AND tier = 'long_term' AND category = ?
         ORDER BY importance DESC, updated_at DESC LIMIT ?`,
      )
      .all(ownerUserId, category, limit) as MemoryEntry[];
  }
  return db
    .prepare(
      `SELECT * FROM memory
       WHERE (owner_user_id = ? OR scope = 'shared') AND tier = 'long_term'
       ORDER BY importance DESC, updated_at DESC LIMIT ?`,
    )
    .all(ownerUserId, limit) as MemoryEntry[];
}

/** Legacy alias — returns all long-term memories */
export function getAllMemoriesForUser(
  ownerUserId: number,
  category?: MemoryEntry["category"],
): MemoryEntry[] {
  return getLongTermMemoriesForUser(ownerUserId, category as MemoryCategory);
}

// ─── Search / Scoring ────────────────────────────────────────────────────────

function recencyScore(updatedAt: string): number {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const ageDays = ageMs / 86_400_000;
  // Decays from 1 → ~0.1 over 30 days
  return Math.max(0.1, 1 - ageDays / 30);
}

function keywordScore(entry: MemoryEntry, query: string): number {
  const lq = query.toLowerCase();
  const lk = entry.key.toLowerCase();
  const lv = entry.value.toLowerCase();
  let s = 0;
  if (lk === lq) s += 20;
  else if (lk.includes(lq)) s += 10;
  if (lv.includes(lq)) s += 5;
  if (entry.importance >= 8) s += 4;
  else if (entry.importance >= 6) s += 2;
  return s;
}

export function searchMemoriesForUser(ownerUserId: number, query: string): MemorySearchResult[] {
  purgeExpiredMemories(ownerUserId);
  const term = `%${query}%`;
  const entries = db
    .prepare(
      `SELECT * FROM memory
       WHERE (owner_user_id = ? OR scope = 'shared')
         AND (key LIKE ? OR value LIKE ?)
         AND (tier = 'long_term' OR (tier = 'short_term' AND (expires_at IS NULL OR expires_at > ?)))
       ORDER BY importance DESC LIMIT 50`,
    )
    .all(ownerUserId, term, term, new Date().toISOString()) as MemoryEntry[];

  return entries
    .map((entry) => ({
      entry,
      relevance: keywordScore(entry, query) * recencyScore(entry.updated_at),
    }))
    .sort((a, b) => b.relevance - a.relevance);
}

// ─── Smart Context Formatting ────────────────────────────────────────────────

/**
 * Returns a richly formatted memory block for injection into the system prompt.
 * Includes both long-term knowledge and current short-term context.
 */
export function getSmartMemoryContextForUser(ownerUserId: number, longTermLimit = 50): string {
  purgeExpiredMemories(ownerUserId);

  const longTerm = getLongTermMemoriesForUser(ownerUserId, undefined, longTermLimit);
  const shortTerm = getShortTermMemoriesForUser(ownerUserId);

  if (longTerm.length === 0 && shortTerm.length === 0) return "";

  const lines: string[] = ["---", "", "## Memory Context"];

  if (longTerm.length > 0) {
    lines.push("", "### Long-Term Knowledge");
    const grouped: Partial<Record<MemoryCategory, MemoryEntry[]>> = {};
    for (const m of longTerm) {
      (grouped[m.category] ??= []).push(m);
    }
    const ORDER: MemoryCategory[] = ["fact", "preference", "goal", "project", "skill", "context", "custom"];
    for (const cat of ORDER) {
      const entries = grouped[cat];
      if (!entries?.length) continue;
      const label = cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, " ");
      lines.push(`\n**${label}**`);
      for (const m of entries) lines.push(`- ${m.key}: ${m.value}`);
    }
  }

  if (shortTerm.length > 0) {
    lines.push("", "### Current Session Context");
    for (const m of shortTerm) lines.push(`- ${m.key}: ${m.value}`);
  }

  lines.push("");
  return lines.join("\n");
}

/** Legacy alias */
export function getMemoriesForPromptForUser(ownerUserId: number, limit = 50): string {
  return getSmartMemoryContextForUser(ownerUserId, limit);
}

// ─── Memory Statistics ───────────────────────────────────────────────────────

export function getMemoryStatsForUser(ownerUserId: number): {
  total: number;
  longTerm: number;
  shortTerm: number;
  byCategory: Record<string, number>;
  avgImportance: number;
} {
  const all = db
    .prepare("SELECT * FROM memory WHERE owner_user_id = ?")
    .all(ownerUserId) as MemoryEntry[];

  const byCategory: Record<string, number> = {};
  let totalImportance = 0;
  let shortTerm = 0;

  for (const m of all) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
    totalImportance += m.importance;
    if (m.tier === "short_term") shortTerm++;
  }

  return {
    total: all.length,
    longTerm: all.length - shortTerm,
    shortTerm,
    byCategory,
    avgImportance: all.length > 0 ? totalImportance / all.length : 0,
  };
}

// ─── Auto-Extraction ─────────────────────────────────────────────────────────

/**
 * Auto-extract and persist long-term memories from a conversation transcript.
 * Called after conversations end to learn new things about the user.
 */
export async function extractMemoriesFromConversation(
  ownerUserId: number,
  conversationText: string,
  model?: LanguageModel,
): Promise<MemoryEntry[]> {
  const llm = model ?? getDefaultModel();
  if (!llm) {
    logger.warn("No model available for memory extraction");
    return [];
  }

  const prompt = `You are a memory extraction system. Analyze this conversation and extract information worth remembering long-term about the user.

Extract only HIGH-VALUE items:
- User preferences (communication style, likes/dislikes, workflows)
- Important facts (name, role, timezone, tech stack, team size)
- Goals and projects (what they are working on, KPIs, deadlines)
- Skills and expertise levels
- Recurring patterns or strong opinions

Skip trivial, one-off, or already-obvious facts.

Return ONLY a JSON array (no other text) with items in this schema:
[{"key": "string", "value": "string", "category": "preference|fact|project|context|skill|goal", "importance": 1-10}]

Conversation:
${conversationText.slice(-5000)}`;

  try {
    const result = await generateText({ model: llm, prompt, maxRetries: 1, maxOutputTokens: 2000 });
    const match = result.text.trim().match(/\[[\s\S]*\]/);
    if (!match) return [];

    const items = JSON.parse(match[0]) as Array<{
      key: string;
      value: string;
      category: MemoryCategory;
      importance: number;
    }>;

    const saved: MemoryEntry[] = [];
    for (const item of items) {
      if (!item.key || !item.value) continue;
      const entry = upsertLongTermMemory(
        ownerUserId,
        item.key,
        item.value,
        item.category ?? "custom",
        Math.max(1, Math.min(10, item.importance ?? 5)),
        "auto-extracted",
      );
      saved.push(entry);
    }

    if (saved.length > 0) logger.info("Auto-extracted memories", { count: saved.length });
    return saved;
  } catch (err) {
    logger.error("Memory extraction failed", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ─── Memory Consolidation ────────────────────────────────────────────────────

/**
 * AI-powered consolidation: merges near-duplicate long-term memories, removes stale entries.
 * Call periodically (e.g. weekly or on dashboard visit).
 */
export async function consolidateMemoriesForUser(
  ownerUserId: number,
  model?: LanguageModel,
): Promise<{ merged: number; removed: number }> {
  const llm = model ?? getDefaultModel();
  if (!llm) return { merged: 0, removed: 0 };

  const memories = getLongTermMemoriesForUser(ownerUserId, undefined, 100);
  if (memories.length < 5) return { merged: 0, removed: 0 };

  const listText = memories
    .map((m) => `[${m.id}] (${m.category}, imp=${m.importance}) ${m.key}: ${m.value}`)
    .join("\n");

  const prompt = `You are a memory consolidation system. Review these memory entries and identify:
1. Near-duplicates that should be merged (keep the most informative)
2. Outdated/stale entries that should be removed
3. Entries whose importance should be updated

Return ONLY a JSON object (no other text):
{
  "merge": [{"keep_id": number, "remove_ids": number[], "new_value": "string", "new_importance": number}],
  "remove": [number],
  "update": [{"id": number, "importance": number}]
}

Memory entries:
${listText}`;

  try {
    const result = await generateText({ model: llm, prompt, maxRetries: 1, maxOutputTokens: 1500 });
    const match = result.text.trim().match(/\{[\s\S]*\}/);
    if (!match) return { merged: 0, removed: 0 };

    const plan = JSON.parse(match[0]) as {
      merge?: Array<{ keep_id: number; remove_ids: number[]; new_value: string; new_importance: number }>;
      remove?: number[];
      update?: Array<{ id: number; importance: number }>;
    };

    let merged = 0;
    let removed = 0;

    for (const m of plan.merge ?? []) {
      updateMemory(m.keep_id, { value: m.new_value, importance: m.new_importance });
      for (const rid of m.remove_ids) { deleteMemory(rid); removed++; }
      merged++;
    }
    for (const rid of plan.remove ?? []) { deleteMemory(rid); removed++; }
    for (const u of plan.update ?? []) { updateMemory(u.id, { importance: u.importance }); }

    logger.info("Memory consolidation complete", { merged, removed });
    return { merged, removed };
  } catch (err) {
    logger.error("Memory consolidation failed", { error: err instanceof Error ? err.message : String(err) });
    return { merged: 0, removed: 0 };
  }
}
