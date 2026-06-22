/**
 * CLI entry point.
 *
 *   docker compose run --rm app <diff-path> <ticket-path> [--json]
 *
 * Reads a git diff + a Jira-style ticket, runs the grounded PR-review chain,
 * and prints a PR description + reviewer checklist + risk flags.
 */
import { readFile } from "node:fs/promises";
import { buildKnowledgeBase } from "./ingest.js";
import { generatePRReview, type PRReviewResult } from "./chain.js";
import { InputError } from "./guardrails.js";
import type { PRReview } from "./schema.js";

const SEVERITY_ICON: Record<string, string> = { low: "🟢", medium: "🟡", high: "🔴" };

function usage(): never {
  console.error(
    [
      "Usage: <diff-path> <ticket-path> [--json]",
      "",
      "Example:",
      "  docker compose run --rm app data/sample-diffs/feature-discount-codes.diff data/sample-tickets/feature-discount-codes.md",
    ].join("\n"),
  );
  process.exit(2);
}

function render(result: PRReviewResult): void {
  const { review, meta } = result;
  const line = "─".repeat(70);

  console.log(`\n${line}\n# ${review.title}\n${line}`);

  console.log("\n## Summary\n" + review.description.summary);

  console.log("\n## Changes");
  for (const c of review.description.changes) console.log(`- ${c}`);

  console.log("\n## Testing\n" + review.description.testing);

  console.log("\n## Reviewer checklist");
  for (const c of review.reviewChecklist) console.log(`- [ ] ${c.item}\n      ↳ ${c.rationale}`);

  console.log("\n## Risk flags");
  if (review.riskFlags.length === 0) {
    console.log("- none identified");
  } else {
    for (const r of review.riskFlags) {
      const std = r.relatedStandard ? ` (${r.relatedStandard})` : "";
      console.log(`- ${SEVERITY_ICON[r.severity] ?? ""} [${r.severity}] ${r.description}${std}`);
    }
  }

  if (review.groundingNote && review.groundingNote.trim()) {
    console.log("\n## Grounding note\n" + review.groundingNote);
  }

  console.log(`\n${line}`);
  console.log(
    "meta: " +
      JSON.stringify({
        providers: meta.providersAvailable,
        grounded: meta.grounded,
        sources: meta.retrievedSources,
        diffTruncated: meta.diffTruncated,
        injectionSuspected: meta.injectionSuspected,
        selfCheckRetried: meta.selfCheckRetried,
        hallucinatedFiles: meta.hallucinatedFiles,
      }),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("--"));
  if (positional.length < 2) usage();

  const [diffPath, ticketPath] = positional;
  const [diff, ticket] = await Promise.all([
    readFile(diffPath, "utf8"),
    readFile(ticketPath, "utf8"),
  ]);

  const retriever = await buildKnowledgeBase();
  const result = await generatePRReview(retriever, { diff, ticket }, { traceFile: "cli-runs" });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    render(result);
  }
}

main().catch((err) => {
  if (err instanceof InputError) {
    console.error(`\n⚠ ${err.message}`);
    process.exit(1);
  }
  console.error("\n✗ Failed to generate PR review:", err?.message ?? err);
  process.exit(1);
});

// Re-export for typed consumers (eval harness).
export type { PRReview };
