# API Design Standards

## REST Conventions

- Resource names must be **plural nouns** in `kebab-case`: `/products`, `/orders`, `/cart-items`.
- Nest sub-resources only one level deep: `/orders/:orderId/items` is fine; deeper nesting is not.
- Use HTTP verbs correctly: `GET` for reads, `POST` for creates, `PUT`/`PATCH` for updates (`PATCH` for partial), `DELETE` for removal.
- Do not use verbs in URL paths: use `DELETE /sessions` instead of `POST /logout`.

## Status Codes

| Scenario | Code |
|---|---|
| Successful read | 200 |
| Resource created | 201 |
| No content (delete) | 204 |
| Bad request / validation failure | 400 |
| Unauthenticated | 401 |
| Forbidden (authenticated, lacks permission) | 403 |
| Not found | 404 |
| Conflict (duplicate) | 409 |
| Server error | 500 |

Never return `200` for an error.

## Request Validation

All incoming bodies and query parameters **must** be validated with a schema library (we use `zod`). Reject invalid input with `400` before it reaches business logic.

```typescript
const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1) })),
});
```

## Pagination

All list endpoints that may return more than 20 items must support cursor-based or offset pagination:

```
GET /products?page=2&limit=20
```

Response envelope:

```json
{
  "data": [...],
  "meta": { "page": 2, "limit": 20, "total": 143 }
}
```

## Error Response Shape

All errors must use a consistent envelope so clients can handle them generically:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [{ "field": "email", "issue": "Invalid format" }]
  }
}
```

`code` must be a stable machine-readable string (not an HTTP status number). `details` is optional and present only for validation errors. Never expose stack traces or internal error messages in `error.message`.
