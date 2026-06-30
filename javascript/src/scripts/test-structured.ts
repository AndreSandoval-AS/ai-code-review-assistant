/** One-call check that structured output parses correctly with the chosen method. */
import { createStructuredModel } from "../config.js";
import { prReviewSchema, type PRReview } from "../schema.js";
import { buildPrompt } from "../prompt.js";

const model = await createStructuredModel<PRReview>(prReviewSchema);
const chain = buildPrompt({ strictGrounding: true }).pipe(model);
const r = (await chain.invoke({
  ticket: "TIRE-1: add a health-check endpoint",
  diff: "diff --git a/src/health.ts b/src/health.ts\n+export const health = () => ({ ok: true });",
  context: "(none)",
  changed_files: "src/health.ts",
})) as PRReview;

console.log("✓ structured output OK");
console.log("  title:", r.title);
console.log("  checklist items:", r.reviewChecklist.length, "| risks:", r.riskFlags.length);
