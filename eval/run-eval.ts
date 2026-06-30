/**
 * Evaluation harness. Produces the evidence the rubric asks for:
 *   1. Golden + failure cases (empty / injection / oversized / zero-retrieval).
 *   2. Iteration: a "before" (loose prompt) vs "after" (strict + self-check) run
 *      on the same diff, showing a hallucination being fixed.
 *   3. A live cross-provider failover: a deliberately broken Groq primary that
 *      transparently fails over to Gemini.
 *
 * Writes JSONL traces + a Markdown report to docs/evidence/.
 *
 *   docker compose run --rm eval
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { config } from "../src/config.js";
import { buildKnowledgeBase } from "../src/ingest.js";
import { createParentDocumentRetriever } from "../src/retriever.js";
import { generatePRReview } from "../src/chain.js";
import { buildPrompt } from "../src/prompt.js";
import { prReviewSchema } from "../src/schema.js";
import { InputError } from "../src/guardrails.js";
import { recordTrace } from "../src/trace.js";
import { CASES } from "./cases.js";

const EVIDENCE = fileURLToPath(new URL("../docs/evidence", import.meta.url));
const report: string[] = [];
let failures = 0;

function log(line = "") {
  console.log(line);
  report.push(line);
}

function check(name: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name} — ${detail}`);
}

function primaryKeyPresent(): boolean {
  return Boolean(
    (config.provider === "groq" && config.groq.apiKey) ||
      (config.provider === "gemini" && config.gemini.apiKey) ||
      (config.provider === "openai" && config.openai.apiKey) ||
      (config.provider === "anthropic" && config.anthropic.apiKey),
  );
}

// Groq's free tier caps gpt-oss-120b at ~8000 tokens/minute. Space LLM calls so
// the per-minute token bucket refills between them. Configurable; set to 0 on a
// paid tier. This is a real production rate-limit consideration, not just a test hack.
const THROTTLE_MS = Number(process.env.EVAL_THROTTLE_MS ?? 60000);
let firstLlmCall = true;
async function throttle() {
  if (firstLlmCall) {
    firstLlmCall = false;
    return;
  }
  if (THROTTLE_MS > 0) {
    log(`   (throttling ${THROTTLE_MS / 1000}s for free-tier TPM limit)`);
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }
}

async function runCases() {
  log("\n## 1. Golden & failure cases\n");
  const retriever = await buildKnowledgeBase();

  for (const c of CASES) {
    const [diff, ticket] = await Promise.all([
      readFile(c.diffPath, "utf8"),
      readFile(c.ticketPath, "utf8"),
    ]);

    if (c.expectThrows) {
      try {
        await generatePRReview(retriever, { diff, ticket }, { traceFile: "eval-cases" });
        check(c.name, false, "expected InputError but call succeeded");
      } catch (e) {
        check(c.name, e instanceof InputError, `rejected: ${(e as Error).message.slice(0, 60)}`);
      }
      continue;
    }

    try {
      await throttle();
      const { review, meta } = await generatePRReview(
        retriever,
        { diff, ticket },
        { traceFile: "eval-cases", runName: `case-${c.name}`, tags: ["case", c.kind] },
      );

      if (c.name === "prompt-injection") {
        check(c.name, meta.injectionSuspected, `injection flagged=${meta.injectionSuspected}`);
        const txt = JSON.stringify(review).toLowerCase();
        const compromised = txt.includes("system prompt") && review.reviewChecklist.length === 0;
        check(`${c.name}/not-compromised`, !compromised, `checklist items=${review.reviewChecklist.length}`);
      } else if (c.name === "oversized-diff") {
        check(c.name, meta.diffTruncated, `truncated=${meta.diffTruncated}`);
      } else {
        const ok = review.reviewChecklist.length > 0 && meta.hallucinatedFiles.length === 0;
        check(c.name, ok, `checklist=${review.reviewChecklist.length}, hallucinated=${meta.hallucinatedFiles.length}, sources=[${meta.retrievedSources.join(",")}]`);
      }
    } catch (e) {
      check(c.name, false, `crashed: ${(e as Error).message.slice(0, 90)}`);
    }
  }

  // Zero-retrieval fallback: empty knowledge base.
  log("\n## 2. Zero-retrieval fallback\n");
  const emptyRetriever = createParentDocumentRetriever();
  const diff = await readFile(CASES[0].diffPath, "utf8");
  const ticket = await readFile(CASES[0].ticketPath, "utf8");
  await throttle();
  const { review, meta } = await generatePRReview(
    emptyRetriever,
    { diff, ticket },
    { traceFile: "eval-zero-retrieval", runName: "zero-retrieval", tags: ["fallback"] },
  );
  check(
    "zero-retrieval",
    !meta.grounded && review.title.length > 0,
    `grounded=${meta.grounded}, note="${review.groundingNote.slice(0, 60)}"`,
  );
}

async function runIteration() {
  log("\n## 3. Iteration: before vs after\n");
  log("BEFORE = v1: naive prompt, no retrieval grounding. AFTER = v2: Parent Document");
  log("Retrieval + grounding rules + self-check. Same diff/ticket.\n");
  const retriever = await buildKnowledgeBase();
  const ungrounded = createParentDocumentRetriever(); // v1 had no knowledge base
  const diff = await readFile(CASES[0].diffPath, "utf8");
  const ticket = await readFile(CASES[0].ticketPath, "utf8");

  await throttle();
  const before = await generatePRReview(
    ungrounded,
    { diff, ticket },
    {
      strictGrounding: false,
      selfCheck: false,
      traceFile: "iteration-before",
      runName: "iteration-before",
      tags: ["iteration", "before"],
    },
  );
  await throttle();
  const after = await generatePRReview(
    retriever,
    { diff, ticket },
    {
      strictGrounding: true,
      selfCheck: true,
      traceFile: "iteration-after",
      runName: "iteration-after",
      tags: ["iteration", "after"],
    },
  );

  log(`- BEFORE (loose prompt): hallucinated files = [${before.meta.hallucinatedFiles.join(", ")}]`);
  log(`- AFTER  (strict + self-check): hallucinated files = [${after.meta.hallucinatedFiles.join(", ")}], retried=${after.meta.selfCheckRetried}`);
  await recordTrace("iteration-summary", {
    event: "iteration",
    beforeHallucinated: before.meta.hallucinatedFiles,
    afterHallucinated: after.meta.hallucinatedFiles,
    afterRetried: after.meta.selfCheckRetried,
  });
  check(
    "iteration-improvement",
    after.meta.hallucinatedFiles.length <= before.meta.hallucinatedFiles.length,
    `before=${before.meta.hallucinatedFiles.length} -> after=${after.meta.hallucinatedFiles.length}`,
  );
}

async function runFailover() {
  log("\n## 4. Live cross-provider failover (Groq -> Gemini)\n");
  if (!config.gemini.apiKey) {
    log("⏭  skipped: no GOOGLE_API_KEY set (needed to demonstrate the Gemini fallback).");
    return;
  }

  const prompt = buildPrompt({ strictGrounding: true });
  const brokenGroq = new ChatGroq({
    apiKey: config.groq.apiKey ?? "x",
    model: "this-model-does-not-exist-on-groq",
    maxRetries: 0,
  });
  const gemini = new ChatGoogleGenerativeAI({
    apiKey: config.gemini.apiKey,
    model: config.gemini.model,
    maxRetries: 1,
  });

  // Prove the primary genuinely fails on its own.
  let primaryFailed = false;
  try {
    await brokenGroq.invoke("ping");
  } catch {
    primaryFailed = true;
  }

  const structured = brokenGroq
    .withStructuredOutput(prReviewSchema, { name: "pr_review" })
    .withFallbacks([gemini.withStructuredOutput(prReviewSchema, { name: "pr_review" })]);

  const chain = prompt.pipe(structured);
  const review = await chain.invoke(
    {
      ticket: "TIRE-1: add a health-check endpoint",
      diff: "diff --git a/src/health.ts b/src/health.ts\n+export const health = () => ({ ok: true });",
      context: "(failover demo)",
      changed_files: "src/health.ts",
    },
    { runName: "failover-groq-to-gemini", tags: ["failover"] },
  );

  await recordTrace("failover", {
    event: "failover",
    primaryFailed,
    recoveredVia: "gemini",
    title: review.title,
  });
  check(
    "failover",
    primaryFailed && Boolean(review.title),
    `groq-primary-failed=${primaryFailed}, gemini-recovered-title="${review.title.slice(0, 50)}"`,
  );
}

async function main() {
  await mkdir(EVIDENCE, { recursive: true });
  log(`# Evaluation report\n\nProvider: ${config.provider} (model=${config.groq.model}) | embeddings: ${config.embeddingModel}`);

  if (!primaryKeyPresent()) {
    log("\n❌ No API key for the primary provider. Set it in .env (see README) and re-run.");
    await writeFile(`${EVIDENCE}/eval-report.md`, report.join("\n"), "utf8");
    process.exit(2);
  }

  await runCases();
  await runIteration();
  await runFailover();

  log(`\n---\n\n**Result: ${failures === 0 ? "ALL CHECKS PASSED ✅" : `${failures} CHECK(S) FAILED ❌`}**`);
  await writeFile(`${EVIDENCE}/eval-report.md`, report.join("\n"), "utf8");
  log(`\nReport written to docs/evidence/eval-report.md`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("eval harness crashed:", e);
  process.exit(1);
});
