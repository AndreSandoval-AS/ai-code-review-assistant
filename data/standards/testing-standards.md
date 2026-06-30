# Testing Standards

## Unit vs Integration Tests

**Unit tests** cover a single module in isolation. All external dependencies (database, HTTP clients, external services) must be mocked. Unit tests live in `src/**/__tests__/` alongside the code they test, using the `.test.ts` suffix.

**Integration tests** exercise a vertical slice: HTTP request → middleware → controller → service → (real or in-memory) DB. They live in `tests/integration/` and use a dedicated test database that is reset between test runs.

## Coverage Expectations

| Layer | Minimum Coverage |
|---|---|
| Services (business logic) | 90% |
| Controllers | 80% |
| Middleware | 90% |
| Utilities / helpers | 85% |

Coverage is enforced in CI. A PR that drops coverage below these thresholds must include a justification in the PR description.

## Test Naming

Use the pattern `describe / it` with descriptive names following this convention:

```
describe('<UnitUnderTest>', () => {
  describe('<methodOrScenario>', () => {
    it('should <expected behavior> when <condition>', () => { ... });
  });
});
```

Example:
```typescript
describe('OrderService', () => {
  describe('createOrder', () => {
    it('should throw ORDER_ITEM_EMPTY when items array is empty', async () => { ... });
    it('should apply discount when a valid discount code is provided', async () => { ... });
  });
});
```

## Mocking External Services

- Use `jest.mock()` or dependency injection to mock the database (`db.ts`) in unit tests.
- Mock at the module boundary, not deep inside the implementation.
- Never make real HTTP calls or database connections in unit tests.
- Prefer factory functions over hardcoded fixtures so tests can vary input data easily.

```typescript
const mockDb = { query: jest.fn() };
jest.mock('../../db', () => ({ db: mockDb }));
```

## Test Data

Use factory helpers (e.g., `createProduct()`, `createOrder()`) that return sensible defaults and accept partial overrides. Do not duplicate large literal objects across tests.

## Running Tests

- `npm test` — runs all unit tests.
- `npm run test:integration` — runs integration tests (requires test DB).
- `npm run test:coverage` — runs unit tests with coverage report.
