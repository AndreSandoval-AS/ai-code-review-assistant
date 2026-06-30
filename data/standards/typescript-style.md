# TypeScript Style Guide

## Naming Conventions

- **Files:** Use `camelCase` for file names (e.g., `orderService.ts`, `authMiddleware.ts`).
- **Classes & Interfaces:** Use `PascalCase` (e.g., `OrderService`, `ProductRepository`).
- **Variables, functions, and methods:** Use `camelCase` (e.g., `createOrder`, `cartItems`).
- **Constants:** Use `SCREAMING_SNAKE_CASE` for module-level constants (e.g., `MAX_CART_ITEMS`).
- **Interfaces vs Types:** Prefer `interface` for object shapes that may be extended; use `type` for unions, intersections, or aliases.

## No `any`

Never use `any` unless interfacing with a third-party library that provides no types, and even then wrap it immediately.

```typescript
// BAD
function applyDiscount(order: any): any { ... }

// GOOD
function applyDiscount(order: Order): Order { ... }
```

If the shape is truly unknown, use `unknown` and narrow with type guards.

## Async / Await

Always use `async/await` instead of raw Promises or callbacks. Every async function must have explicit error handling via `try/catch` or a shared error-handling wrapper.

```typescript
// BAD
router.get('/products', (req, res) => {
  productService.list().then(data => res.json(data)).catch(next);
});

// GOOD
router.get('/products', async (req, res, next) => {
  try {
    const products = await productService.list();
    res.json(products);
  } catch (err) {
    next(err);
  }
});
```

## Module Conventions

- Use ES module syntax (`import`/`export`), not CommonJS `require()`.
- Each file should have a single responsibility (controller, service, repository, middleware).
- Barrel files (`index.ts`) are allowed only at directory boundaries to re-export public APIs — do not create deep barrel chains.
- Export types alongside their implementation; never import types from implementation details of another module.

## Type Annotations

- Always annotate function return types explicitly for public-facing functions and route handlers.
- Use strict `tsconfig` settings: `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`.
- Avoid non-null assertions (`!`) unless you have verified the value cannot be null/undefined at that point and a comment explains why.
