/**
 * Observability. Two layers:
 *  - LangSmith: enabled purely by env (LANGSMITH_TRACING=true + key). The
 *    LangChain runtime instruments every Runnable automatically — provider
 *    agnostic, so Groq and Gemini traces both show up. No code needed here.
 *  - Local JSONL: a zero-dependency fallback so we always have evidence
 *    artifacts (for the report) even without a LangSmith account.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const EVIDENCE_DIR = fileURLToPath(new URL("../docs/evidence", import.meta.url));

export interface TraceRecord {
  event: string;
  [key: string]: unknown;
}

/** Append one JSON line to docs/evidence/<file>.jsonl. */
export async function recordTrace(file: string, record: TraceRecord): Promise<void> {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n";
  await appendFile(`${EVIDENCE_DIR}/${file}.jsonl`, line, "utf8");
}

export function langsmithEnabled(): boolean {
  return (
    (process.env.LANGSMITH_TRACING || process.env.LANGCHAIN_TRACING_V2 || "false").toLowerCase() ===
    "true"
  );
}
