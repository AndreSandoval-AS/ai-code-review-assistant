**Ticket:** TIRE-487
**Type:** Bug
**Priority:** High
**Reporter:** ops-monitoring@tireeasy.com
**Assignee:** dev-team
**Sprint:** Sprint 25
**Labels:** backend, auth, security

---

**Summary:** Expired JWT tokens are not always rejected — authenticated requests succeed after token expiry

---

**Description:**

A monitoring alert flagged that some API calls made with tokens past their expiry time are succeeding instead of returning `401`. This appears to be intermittent and may be related to a version of `jsonwebtoken` that does not enforce the `exp` claim check by default under certain conditions, or tokens that were issued without an `exp` claim at all (possibly by a misconfigured token-generation script used during a load test).

Investigation shows that `authMiddleware.ts` relies solely on `jwt.verify()` to reject expired tokens but does not separately validate the `exp` claim after decoding. If `jwt.verify()` succeeds despite a missing or stale `exp` (a known edge case in some library versions), the request proceeds unauthenticated safety checks bypassed.

---

**Steps to Reproduce:**

1. Generate a JWT with no `exp` claim using the HS256 secret.
2. Make a request to any protected endpoint (`GET /orders`) with `Authorization: Bearer <token>`.
3. Observe: the request succeeds with `200` instead of `401`.

Alternatively:
1. Generate a JWT with `exp` set to a past timestamp.
2. Repeat step 2–3 above.

---

**Expected Behavior:**

Any token missing the `exp` claim, or whose `exp` is in the past, must be rejected with `401 Unauthorized`. The response must not include any detail distinguishing between "expired", "missing exp", or "invalid signature".

---

**Actual Behavior:**

Tokens without an `exp` claim pass through `jwt.verify()` and are treated as valid. The authenticated user's ID and role are set on `req.user`, granting full access to protected resources.

---

**Acceptance Criteria:**

- [ ] Tokens with no `exp` claim return `401` from all protected endpoints.
- [ ] Tokens with an `exp` in the past return `401` from all protected endpoints.
- [ ] Valid tokens (with `exp` in the future) continue to work correctly.
- [ ] The fix includes a unit test for each scenario: no `exp`, expired `exp`, valid `exp`.
- [ ] The rejection reason (expired vs. missing exp) is logged at `warn` level internally but is NOT revealed in the API response.
- [ ] No change to the public `401` response body — it remains `{ "error": { "code": "UNAUTHORIZED", "message": "Unauthorized" } }`.
