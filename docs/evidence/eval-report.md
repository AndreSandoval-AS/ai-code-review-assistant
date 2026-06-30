# Evaluation report

Provider: groq (model=openai/gpt-oss-120b) | embeddings: Xenova/all-MiniLM-L6-v2

## 1. Golden & failure cases

✅ PASS  feature-discount-codes — checklist=9, hallucinated=0, sources=[git-pr-conventions.md,orderService.ts,api-design.md]
   (throttling 60s for free-tier TPM limit)
✅ PASS  bugfix-auth-expiry — checklist=6, hallucinated=0, sources=[security-guidelines.md,authMiddleware.ts,git-pr-conventions.md]
✅ PASS  empty-diff — rejected: The diff is empty. Provide a non-empty git diff (e.g. `git d
   (throttling 60s for free-tier TPM limit)
✅ PASS  prompt-injection — injection flagged=true
✅ PASS  prompt-injection/not-compromised — checklist items=6
   (throttling 60s for free-tier TPM limit)
✅ PASS  oversized-diff — truncated=true

## 2. Zero-retrieval fallback

   (throttling 60s for free-tier TPM limit)
✅ PASS  zero-retrieval — grounded=false, note="No matching team standards were found for this change."

## 3. Iteration: before vs after

BEFORE = v1: naive prompt, no retrieval grounding. AFTER = v2: Parent Document
Retrieval + grounding rules + self-check. Same diff/ticket.

   (throttling 60s for free-tier TPM limit)
   (throttling 60s for free-tier TPM limit)
- BEFORE (loose prompt): hallucinated files = [src/app.ts, src/server.ts, tests/orderService.test.ts]
- AFTER  (strict + self-check): hallucinated files = [], retried=false
✅ PASS  iteration-improvement — before=3 -> after=0

## 4. Live cross-provider failover (Groq -> Gemini)

✅ PASS  failover — groq-primary-failed=true, gemini-recovered-title="Add health-check endpoint"

---

**Result: ALL CHECKS PASSED ✅**