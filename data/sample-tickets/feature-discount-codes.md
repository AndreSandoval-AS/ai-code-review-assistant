**Ticket:** TIRE-412
**Type:** Story
**Priority:** Medium
**Reporter:** sarah.chen@tireeasy.com
**Assignee:** dev-team
**Sprint:** Sprint 24
**Labels:** backend, orders, promotions

---

**Summary:** Add discount code support to the order creation flow

---

**Description:**

Marketing needs the ability to create promotional discount codes that customers can apply at checkout. When a customer submits an order with a valid discount code, the total should be reduced accordingly. Codes can be either a flat dollar amount off or a percentage off the order subtotal.

The `discount_codes` table has already been created by the DBA team and seeded with sample codes for testing. The schema is:

```sql
CREATE TABLE discount_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('percentage', 'fixed_cents')),
  value       INTEGER NOT NULL,
  max_uses    INTEGER NOT NULL DEFAULT 100,
  used_count  INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `orders` table needs two new columns: `discount_cents INTEGER NOT NULL DEFAULT 0` and `discount_code_id UUID REFERENCES discount_codes(id)`.

The order creation endpoint (`POST /orders`) should accept an optional `discountCode` field in the request body. If provided:

1. Look up the code (case-insensitive).
2. Validate it has not expired and has remaining uses.
3. Calculate the discount amount (never reduce order total below $0).
4. Increment `used_count` atomically within the same transaction that creates the order.
5. Store `discount_cents` and `discount_code_id` on the order record.

If the code is invalid, expired, or exhausted, return a `400` error with a clear `code` in the error envelope.

---

**Acceptance Criteria:**

- [ ] `POST /orders` accepts an optional `discountCode` string field.
- [ ] A valid percentage code (e.g., `SUMMER10` = 10% off) is applied correctly and total is rounded to the nearest cent.
- [ ] A valid fixed-amount code (e.g., `FLAT500` = $5.00 off) is applied correctly.
- [ ] Applying a code that does not exist returns `400` with code `DISCOUNT_CODE_NOT_FOUND`.
- [ ] Applying an expired code returns `400` with code `DISCOUNT_CODE_EXPIRED`.
- [ ] Applying a fully-used code returns `400` with code `DISCOUNT_CODE_EXHAUSTED`.
- [ ] `used_count` is incremented exactly once per successful order, atomically with order creation.
- [ ] The order response includes `discountCents` and `discountCodeId` fields.
- [ ] Unit tests cover: valid percentage, valid fixed, expired, exhausted, not-found, no code provided.
- [ ] No discount code reduces the charged total below 0.
