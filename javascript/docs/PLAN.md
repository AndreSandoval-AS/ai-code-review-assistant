# Plan: AI PR / Code Review Assistant (LangChain.js course deliverable)

## Context

Course deliverable for **GenAI & LangChain for JS Developers** (AssureSoft Digital Academy).
Two PDFs (`Strategic Blueprint…` and `Practical Project Assignment…`) describe the same
assignment: design, build, and **defend** a production-minded LLM feature for the software
development lifecycle. Grading favors reasoning over code (35% Problem & Logic, 20%
Architecture, 20% Implementation, 15% Iteration, 10% Production-readiness).

**Chosen feature:** an **AI PR / Code Review Assistant**. Input = a git **diff** + a **Jira-style
ticket**; output = a structured **PR description + reviewer checklist + risk flags**, grounded in a
retrieved knowledge base of the team's coding standards and related existing code. It targets a
real, painful bottleneck (slow, inconsistent PR authoring/review) with a clear ROI story.

**Locked decisions (from user):**
- Language: **TypeScript + Node**, LangChain.js.
- Chat model: **Groq free tier** (`ChatGroq`, **`openai/gpt-oss-120b`** primary, `openai/gpt-oss-20b`
  fast fallback) — open-weight GPT-OSS, fast, $0. (Note: Groq's Llama-3.x IDs deprecate 2026-08-16,
  so GPT-OSS is the current choice.) Sharpens the "why open-weight on Groq vs hosted gpt-4o-mini/
  Claude" trade-off defense.
- **Cross-provider fallback (real):** Groq primary → **Google Gemini free tier** fallback via
  `.withFallbacks([...])` — a genuine multi-provider demo of LangChain's provider-agnostic value.
  Needs a free `GOOGLE_API_KEY`. The model factory is provider-swappable by env var
  (groq/gemini/openai/anthropic), so the chain is written once and the vendor is a config detail.
- Embeddings: **local Transformers.js** (`all-MiniLM-L6-v2`) — Groq has no embeddings API, so
  this keeps cost at $0 and needs no key. Strengthens the cost/trade-off narrative.
- Scope: **everything** — code repo + README + 5–8 page TDD PDF (with diagram) + evaluation
  evidence (iteration before/after logs + screenshots).
- **Runtime: Docker only, zero local dependencies.** Multi-stage `Dockerfile` + `docker-compose.yml`;
  the user only needs Docker installed (confirmed: Docker 29 + Compose v5 present). Embedding model
  weights are **baked into the image at build time** so runtime is reproducible and offline-capable.
- **Config: 100% via env.** A committed **`example.env`** (comments + placeholders for *every* setting)
  and a gitignored **`.env`** (real values). Compose loads it via `env_file`.

**Environment facts:** working dir `~/Git/LongChain-dev-course` is an empty git repo (no commits).
**Node.js/npm are NOT installed** (only Python 3.14) — install Node first.

---

## Execution conventions (user-mandated)
- **Auto mode:** proceed autonomously through all tiers without pausing for approval.
- **Everything under `./javascript/`:** the entire project tree (code, data, docs, Docker files,
  `example.env`, README, TDD) lives inside `javascript/`. Paths in "Repo structure" below are
  relative to `javascript/`.
- **Commit after every tier:** run the **git-commit skill** after each implementation tier (steps
  0–8) completes and its gate passes (~9 commits). Branch is `master` (no commits yet).
- **Plan saved in repo:** copy this plan to `javascript/docs/PLAN.md` as part of tier 0.

---

## Architecture (orchestration = LCEL, with a self-correction loop)

Required data flow `User -> Embedding -> Vector Store -> LLM -> Output Parser` maps to:

```
diff + ticket
  -> build retrieval query (key symbols/paths from the diff + ticket text)
  -> local embeddings (Transformers.js)
  -> Vector Store retrieve (Parent Document Retriever: precise child match, return full parent)
  -> [fallback if 0 results: proceed ungrounded + flag "no standards matched"]
  -> structured prompt (with injection guardrails + retrieved context)
  -> LLM: ChatGroq(gpt-oss-120b) .withFallbacks([ChatGoogleGenerativeAI(gemini)])  [real cross-provider failover]
  -> Zod structured output parser  -> { title, description, reviewChecklist[], riskFlags[] }
  -> grounding check -> if it cites a file not in the diff, one corrective retry
```

**Advanced technique (required ≥1): Parent Document Retrieval.** Index small child chunks of
standards/code for precise matching, but feed the LLM the full parent document for context — the
right fit for code, where a one-line match needs its surrounding function/section. Self-Querying
and Contextual Compression are documented in the TDD as "considered alternatives."

---

## Repo structure (TypeScript, ESM) — all under `./javascript/`

```
package.json, tsconfig.json, .gitignore, README.md
docs/PLAN.md            # this plan, saved into the repo (tier 0)
Dockerfile              # multi-stage: deps -> build (tsc) -> slim runtime; pre-downloads embed model
docker-compose.yml      # `app` (CLI) + `eval` services; env_file: .env; mounts ./docs/evidence out
.dockerignore
example.env             # COMMITTED: every config var documented w/ comments + placeholders
.env                    # gitignored: real keys/values (copied from example.env)
src/
  config.ts        # env loading; provider-swappable model + embeddings factory
  ingest.ts        # load standards + sample code, chunk, build Parent Document Retriever
  retriever.ts     # ParentDocumentRetriever (MemoryVectorStore + InMemoryStore docstore)
  schema.ts        # Zod schema for structured PR output
  prompt.ts        # ChatPromptTemplate(s) + system grounding/anti-injection instructions
  sanitize.ts      # input size caps + prompt-injection neutralization for diff/ticket text
  guardrails.ts    # empty-input handling, 0-results fallback, grounding self-check
  chain.ts         # LCEL chain wiring retrieve -> prompt -> LLM -> structured parse
  trace.ts         # local JSONL trace logger + optional LangSmith toggle
  index.ts         # CLI entry: read diff+ticket files/args, run chain, pretty-print result
data/
  standards/       # synthetic coding standards / style guide (the knowledge base)
  sample-code/     # a few existing source files for "related code" retrieval
  sample-diffs/    # synthetic git diffs (incl. edge cases)
  sample-tickets/  # synthetic Jira tickets
eval/
  cases.ts         # golden + failure cases (empty diff, injection, 0-results, oversized diff)
  run-eval.ts      # runs cases, writes traces/logs for evidence
docs/
  TDD.md / TDD.html / TDD.pdf      # 5–8 page technical design document
  architecture.mmd / architecture.png
  evidence/        # screenshots + before/after iteration logs
```

Core LangChain.js packages (**verified, v1.x line**, pinned in package.json):
- `@langchain/groq` → `ChatGroq` (peer: `@langchain/core ^1.x`). `.withStructuredOutput(zodSchema)` supported.
- `@langchain/google-genai` → `ChatGoogleGenerativeAI` (Gemini fallback; free model id e.g.
  `gemini-2.0-flash` — verify current free-tier id at ai.google.dev; env `GOOGLE_API_KEY`).
- `@langchain/community/embeddings/huggingface_transformers` → `HuggingFaceTransformersEmbeddings`
  (model `Xenova/all-MiniLM-L6-v2`; install peer `@huggingface/transformers ^3.8.1`).
- `@langchain/classic/retrievers/parent_document` → `ParentDocumentRetriever`, and
  `@langchain/classic/vectorstores/memory` → `MemoryVectorStore` (these moved out of `langchain`
  in v1); `InMemoryStore` from `@langchain/core/stores` for the parent docstore.
- `@langchain/core/prompts` → `ChatPromptTemplate`; plus `zod`, `dotenv`, `tsx`, `typescript`.
- LangSmith tracing is provider-agnostic (env-gated): `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`,
  `LANGSMITH_PROJECT` (legacy `LANGCHAIN_*` aliases also work).
- Embedding model weights (~90 MB) are pre-downloaded during `docker build` (offline at runtime).

### `example.env` — every setting documented (comments + placeholders)
```
# --- LLM provider selection ---
LLM_PROVIDER=groq                 # groq | gemini | openai | anthropic (chain is written once)
# --- Groq (primary) --- get a free key at https://console.groq.com
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b    # fast fallback: openai/gpt-oss-20b
# --- Google Gemini (cross-provider fallback) --- free key at https://ai.google.dev
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
# --- Retrieval / RAG tuning ---
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
CHILD_CHUNK_SIZE=400
PARENT_CHUNK_SIZE=2000
RETRIEVER_TOP_K=4
MAX_DIFF_TOKENS=6000              # oversized-diff truncation budget
# --- Observability (optional) --- https://smith.langchain.com
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=pr-review-assistant
# --- Runtime ---
LOG_LEVEL=info                    # info | debug ; debug writes JSONL traces to docs/evidence
```

---

## Edge cases (Implementation, 20%)
- **Empty/whitespace diff or ticket** → friendly validation error, no LLM call.
- **Vector store returns 0 results** → run ungrounded, label output "⚠ no matching standards".
- **Oversized diff** → truncate to a token budget + note truncation in output.
- **Prompt injection** in diff/ticket (e.g. "ignore previous instructions") → sanitized + system
  prompt instructs the model to treat retrieved/user content as untrusted data, not instructions.
- **Malformed model output** → Zod parse retry; surface a clear error after N attempts.

## Iteration evidence (15%)
Seed a deliberate flaw, then fix it, and capture before/after:
- Likely flaw: model **hallucinates a file path** or references code absent from the diff.
- Fix: tighten the system prompt to "only reference files present in the provided diff" + add the
  grounding self-check corrective retry. Capture before/after JSONL traces + screenshots into
  `docs/evidence/`. Wire **LangSmith** (optional, env-gated) so traces are screenshot-able; local
  JSONL logger guarantees evidence even without a LangSmith account.

## Production readiness (10%)
- **Monitoring:** LangSmith tracing (env-gated) + structured local logs.
- **Security:** input sanitization, untrusted-content framing, no secrets in prompts, `.env` only.
- **Cost:** $0 runtime (free Groq + local embeddings); token caps; note caching/batching for scale.
- **Fallbacks:** live cross-provider failover (Groq → Gemini via `.withFallbacks`), demonstrated by
  forcing a Groq error and capturing the Gemini handoff in a LangSmith trace + local log; plus the
  0-results retrieval path and request retries/timeouts. Model factory is provider-swappable by env.

## TDD (the 35%+20% scoring core)
5–8 pages, "why over what": problem & ROI, target user/current workflow/impact, architecture +
diagram, technical decisions (Groq vs OpenAI/Claude, local vs hosted embeddings, Parent Document
Retrieval vs alternatives, LCEL vs agent), trade-offs (latency/cost/accuracy), evaluation results
(iteration before/after), production plan, limitations. Authored in Markdown → styled HTML →
PDF via headless Chromium (puppeteer/md-to-pdf) run in a **`docs` docker service** (Chromium baked
into that stage — still no local deps); Mermaid diagram rendered to PNG via mermaid-cli.
Fallback if rendering fails: open the styled HTML and print-to-PDF from a browser.

---

## Implementation order + model/effort per step

Each step is delegated to a subagent with the model/effort matched to its cognitive load —
cheap/fast models for mechanical work, the strongest models reserved for API-correctness and the
high-scoring reasoning/writing. (Effort: low/medium/high/xhigh.)

| # | Step | Model | Effort | Why |
|---|------|-------|--------|-----|
| 0 | Scaffold `package.json`/tsconfig/deps + **Dockerfile, docker-compose.yml, .dockerignore, example.env** | **haiku** | low | Pure setup/boilerplate; deterministic. All dev/test runs inside the container. |
| 1 | Config + provider-swappable model/embeddings factory; Groq + Gemini fallback wiring; smoke test | **sonnet** | high | Two external APIs + `.withFallbacks` correctness. |
| 2 | Author synthetic `data/` (standards, sample code, diffs, tickets) | **sonnet** | low | Content generation, low technical risk. |
| 3 | Ingest + **Parent Document Retriever** (vectorstore + docstore) | **opus** | high | Most API-fragile part of LangChain.js; correctness-critical. |
| 4 | Zod schema + prompts + **LCEL chain** + structured output + CLI | **opus** | high | Core logic + prompt design; drives Architecture/Implementation score. |
| 5 | Guardrails, sanitization, edge cases (empty/0-results/injection/oversized) | **sonnet** | high | Careful but well-scoped logic; needs thoroughness, not deep design. |
| 6 | Eval harness + seed/fix the hallucination + capture the Groq→Gemini failover demo; evidence | **opus** | high | Reasoning-heavy iteration; the 15% Iteration evidence + live fallback proof. |
| 7a | README + run instructions | **sonnet** | medium | Mechanical doc with known content. |
| 7b | **TDD** (5–8 pp) + architecture diagram + md→pdf render | **opus** | xhigh | The 35% Problem & Logic + 20% Architecture core; defend every decision. |
| 8 | Final pass: clean git history, ZIP for Moodle | **haiku** | low | Mechanical packaging. |

Steps run mostly in sequence (each builds on the last). Step 0→1→3→4 is the critical path; steps
2, 5, 7a can overlap once their inputs exist. The orchestrator (main session) reviews each
subagent's output before proceeding, and re-runs `tsc`/eval as a gate between steps.

## Prerequisites you provide
- **Docker** only (already installed) — no local Node/Python needed.
- Free **`GROQ_API_KEY`** (console.groq.com) — primary inference.
- Free **`GOOGLE_API_KEY`** (ai.google.dev) — Gemini fallback for the live failover demo.
- Optional **`LANGSMITH_API_KEY`** (smith.langchain.com) — nicer trace screenshots; local JSONL
  logger is the no-account fallback for evidence.
Keys go in `.env` (copied from `example.env`); `.env` is gitignored.

## Verification (all via Docker — no local deps)
- `cp example.env .env` + fill keys; `docker compose build` succeeds (incl. baked embed model).
- `docker compose run --rm app <diff> <ticket>` → valid structured PR output.
- `docker compose run --rm eval` → every edge case handled (empty, injection, 0-results, oversized)
  **and** the live Groq→Gemini failover case passes; writes evidence to `docs/evidence/`.
- `docs/evidence/` contains before/after traces proving an iteration improvement + the failover log.
- `docs/TDD.pdf` renders 5–8 pages with the architecture diagram embedded.
- README's Docker run instructions work from a clean clone with only Docker installed.
```
