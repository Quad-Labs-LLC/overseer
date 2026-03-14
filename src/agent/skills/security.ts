export interface SkillSecurityIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface SkillSecurityScanInput {
  skillId: string;
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
  tools?: unknown;
  indexSource?: string;
  readmeSource?: string;
  repositoryUrl?: string;
}

export interface SkillSecurityScanResult {
  allowed: boolean;
  issues: SkillSecurityIssue[];
  verification: {
    verified: boolean;
    method: "static-agentic-guard";
    riskScore: number;
    verdict: "allow" | "warn" | "block";
  };
}

const BLOCKED_CONTENT_PATTERNS: Array<{
  code: string;
  regex: RegExp;
  message: string;
}> = [
  {
    code: "SCRIPT_TAG",
    regex: /<script\b/i,
    message:
      "Contains HTML <script> content, which is not allowed in skill metadata/source.",
  },
  {
    code: "DANGEROUS_SHELL_PIPE",
    regex: /(curl|wget)\s+[^\n|]+\|\s*(sh|bash)/i,
    message: "Contains pipe-to-shell command pattern (curl/wget | sh/bash).",
  },
  {
    code: "DESTRUCTIVE_RM",
    // Match dangerous root wipe patterns (rm -rf /), but not safe scoped paths like /var/lib/apt/lists.
    regex: /(?:^|[;|&]\s*|\s)rm\s+-rf\s+\/(?:\s|$)/i,
    message: "Contains destructive command pattern rm -rf /.",
  },
  {
    code: "ENCODED_POWERSHELL",
    regex: /powershell(?:\.exe)?\s+.*-enc/i,
    message: "Contains encoded PowerShell execution pattern.",
  },
  {
    code: "PROMPT_INJECTION_OVERRIDE",
    regex: /ignore\s+(all\s+)?previous\s+instructions/i,
    message: "Contains prompt-injection style instruction override text.",
  },
  {
    code: "TOKEN_EXFILTRATION",
    regex: /(exfiltrat|steal|dump).*(token|secret|credential|password)/i,
    message: "Contains suspicious credential exfiltration language.",
  },
];

const SUSPICIOUS_CONTENT_PATTERNS: Array<{
  code: string;
  regex: RegExp;
  message: string;
}> = [
  {
    code: "INSTALL_HINT",
    regex: /\bnpm\s+i\s+-g\b|\bpip\s+install\s+--user\b/i,
    message: "Contains global package installation commands. Verify this is expected.",
  },
  {
    code: "EVAL_USAGE",
    regex: /\beval\s*\(/i,
    message: "Contains eval() usage. This is potentially unsafe.",
  },
  {
    code: "FUNCTION_CONSTRUCTOR",
    regex: /new\s+Function\s*\(/i,
    message: "Contains Function constructor usage. This is potentially unsafe.",
  },
];

function normalizeTextParts(input: SkillSecurityScanInput): string[] {
  const toolJson = input.tools ? JSON.stringify(input.tools) : "";

  return [
    input.skillId,
    input.name,
    input.description || "",
    input.systemPrompt || "",
    toolJson,
    input.indexSource || "",
    input.readmeSource || "",
    input.repositoryUrl || "",
  ];
}

function isLikelyPatternDefinitionContext(text: string, matchIndex: number): boolean {
  const lineStart = text.lastIndexOf("\n", Math.max(0, matchIndex - 1)) + 1;
  const lineEndRaw = text.indexOf("\n", matchIndex);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  const line = text.slice(lineStart, lineEnd);

  // JS/TS object style: { pattern: /.../g } or { regex: /.../g }
  if (/\b(pattern|regex)\b\s*:\s*\/.*\/[a-z]*/i.test(line)) return true;

  // RegExp constructor style.
  if (/new\s+RegExp\s*\(/i.test(line)) return true;

  // Metadata text inside analyzer rule dictionaries should not be treated as executable intent.
  if (/\b(description|title|message)\b\s*:\s*["'`]/i.test(line)) return true;

  return false;
}

function shouldIgnorePatternMatch(code: string, text: string, matchIndex: number): boolean {
  // Avoid false positives when security keywords appear inside scanner rule definitions.
  if (
    code === "EVAL_USAGE" ||
    code === "FUNCTION_CONSTRUCTOR" ||
    code === "DESTRUCTIVE_RM" ||
    code === "DANGEROUS_SHELL_PIPE"
  ) {
    return isLikelyPatternDefinitionContext(text, matchIndex);
  }

  return false;
}

function hasSafeExecuteReference(value: string): boolean {
  // Allowed format: "functionName" or "index.ts:functionName" or "module.js:functionName"
  // Blocks whitespace and shell-like separators.
  return /^[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?$/.test(value);
}

function validateToolsShape(tools: unknown): SkillSecurityIssue[] {
  const issues: SkillSecurityIssue[] = [];

  if (!Array.isArray(tools)) {
    issues.push({
      level: "error",
      code: "TOOLS_NOT_ARRAY",
      message: "Skill tools must be an array.",
    });
    return issues;
  }

  if (tools.length > 40) {
    issues.push({
      level: "warning",
      code: "TOOLS_LARGE_COUNT",
      message: `Skill defines ${tools.length} tools; this is unusually high.`,
    });
  }

  for (const item of tools) {
    if (!item || typeof item !== "object") {
      issues.push({
        level: "error",
        code: "TOOL_INVALID_ITEM",
        message: "Skill tool entry is not an object.",
      });
      continue;
    }

    const tool = item as { name?: unknown; execute?: unknown };
    if (typeof tool.name !== "string" || tool.name.trim().length === 0) {
      issues.push({
        level: "error",
        code: "TOOL_NAME_INVALID",
        message: "Skill tool name must be a non-empty string.",
      });
    }

    const execute = typeof tool.execute === "string" ? tool.execute.trim() : "";
    if (!execute) {
      issues.push({
        level: "error",
        code: "TOOL_EXECUTE_MISSING",
        message: `Skill tool '${String(tool.name || "unknown")}' is missing execute reference.`,
      });
      continue;
    }

    if (!hasSafeExecuteReference(execute)) {
      issues.push({
        level: "error",
        code: "TOOL_EXECUTE_UNSAFE",
        message: `Skill tool '${String(tool.name || "unknown")}' has unsafe execute reference '${execute}'.`,
      });
    }
  }

  return issues;
}

export function scanSkillSecurity(
  input: SkillSecurityScanInput,
): SkillSecurityScanResult {
  const issues: SkillSecurityIssue[] = [];
  const text = normalizeTextParts(input).join("\n");

  for (const pattern of BLOCKED_CONTENT_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let hasRealMatch = false;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (!shouldIgnorePatternMatch(pattern.code, text, match.index)) {
        hasRealMatch = true;
        break;
      }
      if (!regex.global) break;
    }

    if (hasRealMatch) {
      issues.push({
        level: "error",
        code: pattern.code,
        message: pattern.message,
      });
    }
  }

  for (const pattern of SUSPICIOUS_CONTENT_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let hasRealMatch = false;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (!shouldIgnorePatternMatch(pattern.code, text, match.index)) {
        hasRealMatch = true;
        break;
      }
      if (!regex.global) break;
    }

    if (hasRealMatch) {
      issues.push({
        level: "warning",
        code: pattern.code,
        message: pattern.message,
      });
    }
  }

  issues.push(...validateToolsShape(input.tools));

  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const warningCount = issues.filter(
    (issue) => issue.level === "warning",
  ).length;
  const riskScore = Math.min(100, errorCount * 40 + warningCount * 10);
  const verdict =
    errorCount > 0 ? "block" : warningCount > 0 ? "warn" : "allow";

  return {
    allowed: errorCount === 0,
    issues,
    verification: {
      verified: true,
      method: "static-agentic-guard",
      riskScore,
      verdict,
    },
  };
}
