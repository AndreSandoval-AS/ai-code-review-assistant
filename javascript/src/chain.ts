/**
 * The orchestration layer (LCEL). The core pipeline is:
 *
 *   prompt  ->  structured model (with cross-provider fallback)  ->  validated PRReview
 *
 * `withStructuredOutput` collapses the "LLM -> Output Parser" stages of the
 * required data-flow into one validated step. Retrieval runs as an explicit
 * pre-step so we can handle the zero-results fallback and capture metadata.
 */
import type { Runnable } from "@langchain/core/runnables";
import type { Document } from "@langchain/core/documents";
import type { ParentDocumentRetriever } from "@langchain/classic/retrievers/parent_document";
import { createStructuredModel, providerChain } from "./config.js";
import { buildPrompt } from "./prompt.js";
import { prReviewSchema, type PRReview } from "./schema.js";
import { capDiff, sanitizeUntrusted, extractChangedFiles } from "./sanitize.js";
import { validateInputs, findHallucinatedFiles, NO_STANDARDS_MESSAGE } from "./guardrails.js";
import { recordTrace, langsmithEnabled } from "./trace.js";
import { logger } from "./logger.js";

export interface PRInput {
  diff: string;
  ticket: string;
}

export interface PRReviewMeta {
  providersAvailable: string[];
  grounded: boolean;
  retrievedSources: string[];
  diffTruncated: boolean;
  injectionSuspected: boolean;
  selfCheckRetried: boolean;
  hallucinatedFiles: string[];
}

export interface PRReviewResult {
  review: PRReview;
  meta: PRReviewMeta;
}

export interface GenerateOptions {
  /** false = the "before" baseline used for iteration evidence. */
  strictGrounding?: boolean;
  /** Run the grounding self-check + one corrective retry. */
  selfCheck?: boolean;
  /** Tag written into the local JSONL trace file. */
  traceFile?: string;
}

function formatDocs(docs: Document[]): string {
  return docs
    .map((d) => {
      const src = d.metadata?.source ?? "unknown";
      const cat = d.metadata?.category ?? "doc";
      return `[${cat}: ${src}]\n${d.pageContent}`;
    })
    .join("\n\n---\n\n");
}

function buildRetrievalQuery(ticket: string, changedFiles: string[]): string {
  return `${ticket}\nChanged files: ${changedFiles.join(", ")}`;
}

/** The reusable LCEL chain: prompt -> structured model (+ fallback). */
async function createReviewChain(strictGrounding: boolean): Promise<Runnable<Record<string, unknown>, PRReview>> {
  const prompt = buildPrompt({ strictGrounding });
  const model = await createStructuredModel<PRReview>(prReviewSchema);
  return prompt.pipe(model);
}

/** End-to-end: validate -> sanitize -> retrieve -> generate -> self-check. */
export async function generatePRReview(
  retriever: ParentDocumentRetriever,
  input: PRInput,
  options: GenerateOptions = {},
): Promise<PRReviewResult> {
  const { strictGrounding = true, selfCheck = true, traceFile } = options;

  validateInputs(input);

  // --- input hardening ---
  const capped = capDiff(input.diff);
  const diff = sanitizeUntrusted(capped.text, "diff");
  const ticket = sanitizeUntrusted(input.ticket, "ticket");
  const changedFiles = extractChangedFiles(input.diff);

  // --- retrieval (with zero-results fallback) ---
  const docs = await retriever.invoke(buildRetrievalQuery(ticket.text, changedFiles));
  const grounded = docs.length > 0;
  const context = grounded ? formatDocs(docs) : NO_STANDARDS_MESSAGE;
  if (!grounded) logger.warn("retrieval returned 0 documents — answering ungrounded.");

  const vars = {
    ticket: ticket.text,
    diff: diff.text,
    context,
    changed_files: changedFiles.join(", ") || "(none detected)",
  };

  // --- generation ---
  const chain = await createReviewChain(strictGrounding);
  let review = await chain.invoke(vars);

  // --- grounding self-check + one corrective retry ---
  let hallucinated = strictGrounding ? findHallucinatedFiles(review, input.diff) : [];
  let retried = false;
  if (selfCheck && strictGrounding && hallucinated.length > 0) {
    logger.warn(`grounding self-check: retrying (hallucinated: ${hallucinated.join(", ")})`);
    retried = true;
    const corrected = {
      ...vars,
      context:
        `${context}\n\n[CORRECTION] A previous attempt referenced files not in the diff. ` +
        `Only reference these files: ${changedFiles.join(", ") || "(none)"}.`,
    };
    review = await chain.invoke(corrected);
    hallucinated = findHallucinatedFiles(review, input.diff);
  }

  const meta: PRReviewMeta = {
    providersAvailable: providerChain(),
    grounded,
    retrievedSources: docs.map((d) => String(d.metadata?.source ?? "unknown")),
    diffTruncated: capped.truncated,
    injectionSuspected: diff.injectionSuspected || ticket.injectionSuspected,
    selfCheckRetried: retried,
    hallucinatedFiles: hallucinated,
  };

  if (traceFile) {
    await recordTrace(traceFile, {
      event: "pr_review",
      strictGrounding,
      selfCheck,
      langsmith: langsmithEnabled(),
      meta,
      title: review.title,
      groundingNote: review.groundingNote,
    });
  }

  return { review, meta };
}
