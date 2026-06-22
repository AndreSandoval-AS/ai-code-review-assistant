# Security Guidelines

## Input Validation

Every external input — request bodies, query strings, path parameters, headers — must be validated and sanitized **before** use. Use `zod` schemas as the authoritative validation layer. Never trust client-supplied data, including `Content-Type` headers.

Reject unexpected fields using `zod`'s `.strict()` to prevent mass-assignment attacks.

```typescript
const updateProductSchema = z.object({
  name: z.string().min(1).max(200),
  priceCents: z.number().int().positive(),
}).strict(); // rejects extra keys
```

## Authentication & JWT Handling

- JWTs must be verified with a strong algorithm (HS256 minimum; RS256 preferred for multi-service setups).
- **Always** check the `exp` (expiry) claim explicitly — do not rely on library defaults alone.
- Store the JWT secret in environment variables (`JWT_SECRET`). Never hard-code it.
- Set short token lifetimes (15 minutes for access tokens). Use refresh tokens for session longevity.
- On token verification failure, return `401` with no detail beyond "Unauthorized". Do not reveal whether the token is expired, malformed, or had an invalid signature.

## No Secrets in Code

The following must **never** appear in source code or committed files:

- Passwords, API keys, JWT secrets
- Database connection strings
- Private keys or certificates

Use `.env` files locally (never committed) and environment-variable injection in CI/CD. All sensitive configuration keys must be documented in `.env.example` with placeholder values.

## Parameterized Queries

Never construct SQL via string concatenation or template literals with user input.

```typescript
// BAD — SQL injection vulnerability
const result = await db.query(`SELECT * FROM products WHERE id = '${id}'`);

// GOOD — parameterized
const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
```

All database access must go through the shared `db.ts` query helper, which enforces parameterized queries.

## Rate Limiting

All public-facing endpoints must be protected by rate limiting (use `express-rate-limit`):

- Auth endpoints (`/auth/*`): 10 requests / 15 min per IP.
- General API: 200 requests / 15 min per authenticated user.

Return `429 Too Many Requests` with a `Retry-After` header when limits are exceeded.
