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

## Review correction evidence (2026-07-29)

The Task 3 review findings were corrected in a forward-only change with
`319_universal_email_endpoint_management_hardening.sql`.

- Routing presets now claim only an exact existing destination or atomically
  insert a preset-keyed destination. The partial unique `(rule_id, preset_key)`
  index prevents concurrent duplicates, and the claim never changes filter,
  delay, enabled state, or sort order.
- Endpoint tokens now use exactly ten lowercase Crockford Base32 characters
  from rejection-sampled cryptographic bytes. The shared recipient schema,
  resolver, generators, fixtures, and address calculations use the same
  authoritative contract.
- Form names are trimmed/non-empty and update the endpoint, metadata, and any
  matching form rule in one transaction. An unused prefix update recomputes the
  full address with its existing token; a used prefix remains immutable and
  duplicate addresses map to a conflict response.
- Rotation rejects disabled endpoints. Creation, updates (including
  enable/disable and retirement), and rotation append same-transaction audit
  rows that contain only allowlisted operational metadata. The dedicated audit
  table fixes `actor_type` to `team_member`, has an actor FK, and rejects token,
  address, sender-domain, and raw-content keys in before/after JSON.
- Detail and history are staff/client-authorized projections. The history API
  validates a bounded page size and advances with stable `(created_at, id)`
  ordering; create/update/rotate responses strip both raw token fields.

### Verification

- Node 24 focused suites: **45 passed, 2 skipped**. The two skips are isolated
  Postgres suites because `EMAIL_INGESTION_TEST_DATABASE_URL` is not configured
  in this workspace; the dedicated test uses a fresh schema, reapplies migration
  319, exercises two concurrent DB sessions, proves one destination survives
  unchanged, and proves the audit JSON safeguard when that test database is
  supplied.
- Migration 319 was applied and then reapplied to the configured database.
  Catalog verification confirmed `lead_email_endpoint_audits`, the partial
  preset index, the fixed actor-type constraint, actor FK, and JSON safeguards.
- Full Node 24 suite: **20 failed / 1229 passed / 4 skipped; 39 failed / 7024
  passed / 7 skipped; 3 errors** — identical 39-failure/3-error baseline with
  new passing coverage.
- Targeted `nuxt typecheck` diagnostics produced no Task 3 file matches;
  `git diff --check` passed.
