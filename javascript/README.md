# AI PR / Code Review Assistant

An LLM feature that turns a **git diff + a Jira ticket** into a structured **PR description, reviewer checklist, and risk flags** — grounded in your team's coding standards via retrieval. Built with **LangChain.js (TypeScript)** and runnable with **Docker only** (no local Node required).

> Course deliverable for *GenAI & LangChain for JS Developers* (AssureSoft Digital Academy). See [`docs/PLAN.md`](docs/PLAN.md) for the build plan and [`docs/TDD.pdf`](docs/) for the technical design document.

---

## What it does

```
diff + ticket
  → extract changed files + build a retrieval query
  → local embeddings (Transformers.js, no API key)
  → Parent Document Retrieval over coding standards + related code
  → structured prompt (anti-injection framing)
  → LLM: Groq (gpt-oss-120b)  ──with fallback──▶  Google Gemini
  → Zod-validated structured output
  → grounding self-check → one corrective retry if a file was hallucinated
```

**Why this is more than an API call:**
- **Parent Document Retrieval** — embeds small precise chunks but feeds the LLM the full parent doc/section (the right fit for code).
- **Provider-agnostic** — the chain is written once; Groq → Gemini failover is a real, live `.withFallbacks()`, and switching vendors is one env var.
- **Production guardrails** — empty-input rejection, oversized-diff truncation, prompt-injection defense, zero-retrieval fallback, and a hallucination self-check.

---

## Prerequisites

- **Docker** (Docker 20+ / Compose v2+). Nothing else — no Node, no Python.
- A free **Groq API key** → https://console.groq.com
- A free **Google Gemini API key** (for the failover) → https://ai.google.dev

## Setup

```bash
cd javascript
cp example.env .env
# edit .env and paste your GROQ_API_KEY and GOOGLE_API_KEY
docker compose build      # builds the image and bakes the embedding model in
```

## Run

Generate a PR review for one of the sample changes:

```bash
docker compose run --rm app \
  data/sample-diffs/feature-discount-codes.diff \
  data/sample-tickets/feature-discount-codes.md
```

Add `--json` for machine-readable output. To review your own change:

```bash
git diff main... > my.diff           # on your host
# put a short ticket in my-ticket.md, then:
docker compose run --rm app my.diff my-ticket.md
```

## Evaluate

Runs the golden + failure cases, the before/after iteration demo, and the live Groq→Gemini failover, then writes `docs/evidence/eval-report.md`:

```bash
docker compose run --rm eval
```

---

## Edge cases handled

| Input | Behavior |
|---|---|
| Empty / whitespace diff or ticket | Rejected with a clear message, **no LLM call** |
| Diff larger than `MAX_DIFF_TOKENS` | Truncated on a hunk boundary; noted in output |
| Prompt injection inside diff/ticket | Treated as untrusted data; attempt flagged in trace |
| Retrieval returns 0 documents | Answers ungrounded and says so in `groundingNote` |
| Model references a file not in the diff | Grounding self-check triggers one corrective retry |
| Primary provider (Groq) errors | Transparent failover to Gemini |

## Configuration

All settings are environment variables — see [`example.env`](example.env) for the documented list (provider selection, model IDs, chunk sizes, retrieval `top-k`, token caps, LangSmith tracing, log level).

## Observability

- **LangSmith** (optional): set `LANGSMITH_TRACING=true` + `LANGSMITH_API_KEY` in `.env` to trace every run (provider-agnostic).
- **Local JSONL** (always on): traces are written to `docs/evidence/*.jsonl` so evidence exists without a LangSmith account. Use `LOG_LEVEL=debug` for more detail.

## Project structure

```
src/
  config.ts      provider-swappable model + embeddings factory
  ingest.ts      load + tag the knowledge base
  retriever.ts   Parent Document Retriever
  schema.ts      Zod output contract
  prompt.ts      prompts + anti-injection framing
  sanitize.ts    size caps, injection detection, diff parsing
  guardrails.ts  input validation + grounding self-check
  chain.ts       the LCEL orchestration
  trace.ts       local JSONL + LangSmith toggle
  index.ts       CLI entry point
data/            standards, sample code, sample diffs + tickets
eval/            evaluation harness + cases
docs/            PLAN.md, TDD, architecture diagram, evidence/
```

## Notes & limits (prototype scope)

- The vector store is in-memory and re-ingests on each run — fine for this corpus; production would use a persistent store (pgvector/Chroma) and incremental indexing.
- Token counting is approximate (chars/4); production would use the model's tokenizer.
- See the TDD for the full trade-off analysis and production plan.
