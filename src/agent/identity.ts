/**
 * Identity System
 *
 * Manages IDENTITY.md per user — a rich document describing who the user is:
 * their background, skills, goals, communication style, and context.
 * This is injected into the system prompt so the AI always knows who it's talking to.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getUserSandboxRoot } from "../lib/userfs";

function getUserIdentityPath(ownerUserId: number): string {
  const root = getUserSandboxRoot({ kind: "web", id: String(ownerUserId) });
  return join(root, "agent", "identity.md");
}

export function loadUserIdentity(ownerUserId: number): string {
  const path = getUserIdentityPath(ownerUserId);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function saveUserIdentity(ownerUserId: number, content: string): void {
  const path = getUserIdentityPath(ownerUserId);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, "utf-8");
}

export function hasUserIdentity(ownerUserId: number): boolean {
  return existsSync(getUserIdentityPath(ownerUserId));
}

export function resetUserIdentity(ownerUserId: number): void {
  const path = getUserIdentityPath(ownerUserId);
  if (existsSync(path)) unlinkSync(path);
}
