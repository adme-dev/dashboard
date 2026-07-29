# Task 3 report — Endpoint service, routing presets, and authorised APIs

## Outcome

Implemented the Task 3 endpoint-management domain service, routing-preset
service, and staff-only API handlers. The implementation is intentionally
uncommitted until this report, validation evidence, and deep review are
recorded.

## RED → GREEN

The required endpoint and routing-preset suites were created before production
files. Their initial run failed because the endpoint and routing modules did
not exist. After implementation, the focused Task 3 command passed:

```text
Test Files  4 passed (4)
Tests       13 passed (13)
```

The focused coverage includes token shape/entropy, endpoint creation and form
metadata in one transaction, client authorization, analytics-only rejection,
health bounds, safe list projection, rotation-grace protection, soft
retirement, portal rejection, staff role invocation, no-preset behavior,
tenant-user validation, destination idempotency, and preservation of existing
destination filters/delays.

## Full-suite delta

The controller ran the complete Vitest suite with Node 24.18.0:

```text
Test Files  20 failed | 1228 passed | 3 skipped (1251)
Tests       39 failed | 7004 passed | 6 skipped (7049)
Errors      3 errors
```

The failure/error baseline remains exactly 39/3. No Task 3 test failed.

## Type and diff checks

The first two Nuxt typecheck attempts exhausted the default 4 GiB child-process
heap. Re-running with `NODE_OPTIONS=--max-old-space-size=16384` completed and
reported the repository's pre-existing type-error baseline. Filtering the
diagnostics for `emailEndpoint`, `emailRoutingPreset`, and `email-endpoints`
returned no Task 3 diagnostics. `git diff --check` passed.

## Security and transaction boundaries

- API handlers reject portal sessions before staff authorization and call the
  existing `MEDIA_BUYING` permission gate.
- Service queries re-check actor access to the target client before reading or
  mutating endpoint state.
- Endpoint creation, immutable form metadata, and optional routing preset use a
  single database transaction.
- Operator list/history projections omit current and prior address-token
  columns and raw email content.
- Tokens use 192 bits of cryptographic randomness and match the shared
  recipient-token contract.
- Rotation retains the previous token for a 24-hour grace period and prevents
  another rotation while that grace period is active.
- Routing presets reuse the existing lead rules/destinations and do not create
  a second CRM ownership authority.

## Remaining concerns

- The current focused suites are mock-driven. A production-data write was not
  attempted for Task 3; the Task 12 live smoke must exercise endpoint creation,
  update, rotation, retirement, history scope, and rollback against real
  Postgres.
- The repository-wide typecheck remains non-zero because of its existing error
  backlog, although no diagnostic names a Task 3 file.
