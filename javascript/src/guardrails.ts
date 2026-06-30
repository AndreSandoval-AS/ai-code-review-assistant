/**
 * Guardrails: the edge-case handling that separates a demo from something
 * production-shaped. Covers empty inputs, the zero-retrieval fallback, and the
 * grounding self-check that catches hallucinated file references.
 */
import type { PRReview } from "./schema.js";
import { extractChangedFiles } from "./sanitize.js";

export class InputError extends Error {}

/** Reject empty/whitespace-only inputs before spending an LLM call. */
export function validateInputs(input: { diff: string; ticket: string }): void {
  if (!input.diff || input.diff.trim() === "") {
    throw new InputError(
      "The diff is empty. Provide a non-empty git diff (e.g. `git diff main... > change.diff`).",
    );
  }
  if (!input.ticket || input.ticket.trim() === "") {
    throw new InputError("The ticket is empty. Provide a ticket description.");
  }
}

/**
 * Grounding self-check: find files the model referenced that are NOT in the
 * diff. Used to decide whether one corrective retry is warranted.
 */
export function findHallucinatedFiles(review: PRReview, diff: string): string[] {
  const allowed = extractChangedFiles(diff).map((f) => f.toLowerCase());
  const allowedBasenames = new Set(allowed.map((f) => f.split("/").pop() || f));

  // Collect file-like tokens the model mentioned across the description.
  const haystack = [
    ...review.description.changes,
    review.description.summary,
    ...review.reviewChecklist.map((c) => c.item),
    ...review.riskFlags.map((r) => r.description),
  ].join(" ");

  // Only consider source-code files. Markdown/JSON tokens are excluded because
  // the model legitimately cites coding-standard docs (e.g. `api-design.md`) —
  // that is correct grounding, not a hallucination.
  const fileTokens = haystack.match(/[\w./-]+\.(ts|tsx|js|jsx)\b/gi) || [];
  const hallucinated = new Set<string>();
  for (const token of fileTokens) {
    const base = token.toLowerCase().split("/").pop() || token.toLowerCase();
    if (!allowedBasenames.has(base)) hallucinated.add(token);
  }
  return [...hallucinated];
}

export const NO_STANDARDS_MESSAGE =
  "(no matching team standards were found for this change)";
