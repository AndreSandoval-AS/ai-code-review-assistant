# Git & PR Conventions

## Branch Naming

Branches must follow this pattern:

```
<type>/<ticket-key>-<short-slug>
```

Where `<type>` is one of: `feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `docs`.

Examples:
- `feature/TIRE-412-discount-codes`
- `bugfix/TIRE-487-auth-token-expiry`
- `chore/TIRE-501-upgrade-zod`

Branch names must be lowercase with hyphens only. No underscores, no uppercase.

## Commit Message Format

Follow the Conventional Commits specification:

```
<type>(<scope>): <short summary in imperative mood>

[optional body — wrap at 72 chars]

[optional footer: TIRE-NNN]
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `perf`.

Examples:
```
feat(orders): add discount code validation on order creation

fix(auth): correctly handle expired JWT tokens instead of treating them as invalid signature

Ref: TIRE-487
```

Commits must be atomic: one logical change per commit. Do not mix refactors with feature code in the same commit.

## PR Description Structure

Every PR description must contain these four sections:

### Summary
One paragraph describing **what** changed and **why**. Link the Jira ticket.

### Changes
Bullet list of the notable code changes. Be specific:
- "Added `DiscountCode` model and migration `20240610_add_discount_codes`"
- "Added `validateDiscountCode()` in `orderService.ts`"

### Testing
Describe how the change was tested:
- Unit tests added (list files and key scenarios).
- Manual testing steps if applicable.
- Any edge cases explicitly covered.

### Risks
List any risks, backward-compatibility concerns, or deployment notes:
- "Requires new `DISCOUNT_CODE_MAX_USES` env var (default: 100)."
- "Migration must run before deploying — adds non-nullable column with a backfill."

## Required Reviewers

- All PRs touching `orderService.ts`, `authMiddleware.ts`, or any auth flow require **two** approvals, one of which must be from a senior engineer.
- All PRs modifying database migrations require a DBA sign-off label (`dba-approved`).
- PRs that are purely documentation or test-only changes require **one** approval.
- Do not merge a PR with unresolved review comments.
