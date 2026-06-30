/**
 * Structured output contract. The LLM is bound to this Zod schema via
 * `.withStructuredOutput()`, so every response is validated into this exact
 * shape (or the call fails and the parser retries) — no fragile string parsing.
 */
import { z } from "zod";

export const prReviewSchema = z.object({
  title: z
    .string()
    .describe("Concise PR title in imperative mood, ~80 chars max, no trailing period."),
  description: z
    .object({
      summary: z.string().describe("2-4 sentence summary of WHAT changed and WHY."),
      changes: z
        .array(z.string())
        .describe("Bullet list of the concrete changes, each referencing only files in the diff."),
      testing: z
        .string()
        .describe("How the change should be tested / what testing the author should do."),
    })
    .describe("The generated PR description body."),
  reviewChecklist: z
    .array(
      z.object({
        item: z.string().describe("A specific thing the reviewer should verify."),
        rationale: z
          .string()
          .describe("Why it matters, ideally tied to a retrieved standard."),
      }),
    )
    .describe("Actionable review checklist tailored to this diff."),
  riskFlags: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]),
        description: z.string().describe("The risk and the file/area it concerns."),
        // Required string (empty when none) rather than optional/nullable: Gemini's
        // responseSchema rejects type-array unions like ["string","null"], so this
        // keeps the schema portable across Groq and Gemini.
        relatedStandard: z
          .string()
          .describe("Name of the related coding standard, or an empty string if none."),
      }),
    )
    .describe("Risks introduced by this change. Empty array if none found."),
  groundingNote: z
    .string()
    .describe(
      "State if no team standards matched the diff, or if the diff/ticket was empty or truncated. Empty string if fully grounded.",
    ),
});

export type PRReview = z.infer<typeof prReviewSchema>;
