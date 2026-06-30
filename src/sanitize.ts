/**
 * Input hardening: size caps + prompt-injection defenses for the untrusted
 * diff/ticket text. The PRIMARY injection defense is structural — the prompt
 * frames this content as untrusted DATA wrapped in delimiters (see prompt.ts).
 * Here we additionally cap size, strip delimiter-spoofing, and flag obvious
 * injection attempts so they are visible in logs/traces.
 */
import { config } from "./config.js";
import { logger } from "./logger.js";

/** Rough token estimate (~4 chars/token) — good enough for budgeting. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface DiffPrep {
  text: string;
  truncated: boolean;
  originalTokens: number;
}

/** Cap the diff to MAX_DIFF_TOKENS, truncating on a hunk boundary when possible. */
export function capDiff(diff: string): DiffPrep {
  const originalTokens = approxTokens(diff);
  if (originalTokens <= config.maxDiffTokens) {
    return { text: diff, truncated: false, originalTokens };
  }
  const maxChars = config.maxDiffTokens * 4;
  let slice = diff.slice(0, maxChars);
  // Prefer cutting at the last hunk header so we don't end mid-line.
  const lastHunk = slice.lastIndexOf("\n@@");
  if (lastHunk > maxChars * 0.5) slice = slice.slice(0, lastHunk);
  logger.warn(`diff truncated: ${originalTokens} -> ~${config.maxDiffTokens} tokens`);
  return {
    text: `${slice}\n\n[... diff truncated: ${originalTokens} tokens exceeded MAX_DIFF_TOKENS=${config.maxDiffTokens} ...]`,
    truncated: true,
    originalTokens,
  };
}

// Heuristic patterns that signal a prompt-injection attempt embedded in content.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (the )?(system|previous) prompt/i,
  /you are now/i,
  /reveal (your|the) (system )?prompt/i,
  /approve this pr/i,
  /\boverride\b.*\b(rules|instructions|guardrails)\b/i,
];

export interface Sanitized {
  text: string;
  injectionSuspected: boolean;
}

/**
 * Neutralize untrusted text: strip sequences that could spoof our delimiters
 * and flag suspected injection. We do NOT silently delete the content (the LLM
 * still needs to review the real code) — we mark it so the model treats it as
 * data and the trace records the attempt.
 */
export function sanitizeUntrusted(text: string, label: string): Sanitized {
  const injectionSuspected = INJECTION_PATTERNS.some((re) => re.test(text));
  if (injectionSuspected) {
    logger.warn(`possible prompt injection detected in ${label} (treated as data).`);
  }
  // Defang our own fence so embedded content can't close the delimiter early.
  const text2 = text.replace(/<\/?untrusted[^>]*>/gi, "[redacted-tag]");
  return { text: text2, injectionSuspected };
}

/** Extract the set of file paths touched by a unified diff. */
export function extractChangedFiles(diff: string): string[] {
  const files = new Set<string>();
  const re = /^(?:diff --git a\/(\S+) b\/(\S+)|\+\+\+ b\/(\S+)|--- a\/(\S+))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(diff)) !== null) {
    const path = m[2] || m[1] || m[3] || m[4];
    if (path && path !== "/dev/null") files.add(path);
  }
  return [...files];
}
