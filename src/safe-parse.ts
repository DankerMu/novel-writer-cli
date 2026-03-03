import { truncateWithEllipsis } from "./text-utils.js";
import { isPlainObject } from "./type-guards.js";

export function safePositiveIntOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null;
}

export function safeNonNegativeIntOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

export function safeNonNegativeFiniteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export function safeStringOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0) return null;
  return truncateWithEllipsis(t, maxLen);
}

export type SummaryIssue = { id: string | null; severity: string | null; summary: string | null; suggestion: string | null };

export function parseSummaryIssues(issuesRaw: unknown[], maxCount: number = 5): SummaryIssue[] {
  const issues: SummaryIssue[] = [];
  for (const it of issuesRaw) {
    if (!isPlainObject(it)) continue;
    const issue = it as Record<string, unknown>;
    issues.push({
      id: safeStringOrNull(issue.id, 240),
      severity: safeStringOrNull(issue.severity, 32),
      summary: safeStringOrNull(issue.summary, 240),
      suggestion: safeStringOrNull(issue.suggestion, 200)
    });
    if (issues.length >= maxCount) break;
  }
  return issues;
}
