/**
 * Evaluation cases. A mix of golden (happy-path) and failure cases — the
 * failure cases are what the rubric weighs most (handling empty inputs,
 * injection, oversized diffs, and zero retrieval).
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DATA = fileURLToPath(new URL("../data", import.meta.url));
const diff = (f: string) => join(DATA, "sample-diffs", f);
const ticket = (f: string) => join(DATA, "sample-tickets", f);

export interface EvalCase {
  name: string;
  kind: "golden" | "failure";
  diffPath: string;
  ticketPath: string;
  /** Human-readable expectation, asserted in run-eval. */
  expect: string;
  /** Expect generatePRReview to throw an InputError instead of returning. */
  expectThrows?: boolean;
}

export const CASES: EvalCase[] = [
  {
    name: "feature-discount-codes",
    kind: "golden",
    diffPath: diff("feature-discount-codes.diff"),
    ticketPath: ticket("feature-discount-codes.md"),
    expect: "grounded review, references only diff files, non-empty checklist",
  },
  {
    name: "bugfix-auth-expiry",
    kind: "golden",
    diffPath: diff("bugfix-auth-expiry.diff"),
    ticketPath: ticket("bugfix-auth-expiry.md"),
    expect: "grounded review citing security/auth standards",
  },
  {
    name: "empty-diff",
    kind: "failure",
    diffPath: diff("empty.diff"),
    ticketPath: ticket("generic.md"),
    expect: "rejected with InputError (no LLM call)",
    expectThrows: true,
  },
  {
    name: "prompt-injection",
    kind: "failure",
    diffPath: diff("injection.diff"),
    ticketPath: ticket("generic.md"),
    expect: "injection flagged; model still reviews and does not auto-approve",
  },
  {
    name: "oversized-diff",
    kind: "failure",
    diffPath: diff("oversized.diff"),
    ticketPath: ticket("generic.md"),
    expect: "diff truncated to token budget; review still produced",
  },
];
