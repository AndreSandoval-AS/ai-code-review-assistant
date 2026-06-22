# Error Handling Standards

## Centralized Error Middleware

All unhandled errors in route handlers must propagate to Express's centralized error middleware via `next(err)`. Do **not** write inline `res.status(500).json(...)` responses outside the error middleware.

```typescript
// app.ts — register last, after all routes
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, path: req.path, method: req.method });
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({
    error: {
      code: err instanceof AppError ? err.code : 'INTERNAL_ERROR',
      message: status < 500 ? err.message : 'An unexpected error occurred',
    },
  });
});
```

## Custom `AppError` Class

Throw `AppError` for expected failures (validation, not found, permission). This class carries a `statusCode` and stable `code` string.

```typescript
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Usage
throw new AppError('ORDER_NOT_FOUND', 404, `Order ${orderId} not found`);
```

## Never Swallow Errors

`catch` blocks must either rethrow the error or pass it to `next`. Empty `catch` blocks and silent swallowing are forbidden.

```typescript
// BAD
try {
  await db.query(...);
} catch (_e) {
  // nothing
}

// GOOD
try {
  await db.query(...);
} catch (err) {
  throw new AppError('DB_ERROR', 500, 'Database operation failed');
}
```

## Structured Logging

Use the shared `logger` (Pino) for all log output. Never use `console.log` or `console.error` directly.

Log format must include: `level`, `message`, `err` (serialized), `requestId`, and relevant business identifiers (e.g., `orderId`, `userId`).

## Never Leak Internals

- Do not include stack traces, SQL errors, or filesystem paths in API responses.
- `5xx` responses must use a generic `"An unexpected error occurred"` message.
- `4xx` responses may include a human-friendly message but must not reveal schema details, table names, or library internals.
