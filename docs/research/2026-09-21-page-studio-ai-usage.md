# Native Page Studio AI usage reservations

## Implemented boundary

`POST /internal/page-studio/ai-usage` requires the existing machine credential
and a verified `x-page-studio-session`. The gateway forwards the editor token
only for the exact POST route. Bodies are bounded to 4,096 observed UTF-8 bytes.

Reserve request:

```json
{"action":"reserve","operationId":"candidate:model:1","fingerprint":"<64 lowercase SHA-256 characters>","kind":"model"}
```

Settlement uses the same operation ID, fingerprint and kind, with
`action: "settle"` and `outcome: "succeeded" | "failed"`. The other kind is
`action-test`. Callers cannot supply amounts, limits, scope or actor identity.
The trusted caller must compute the fingerprint from the canonical actual
provider/runtime request, including its immutable inputs; hashing only the
operation ID is insufficient.

Receipt fields are `operationId`, `fingerprint`, `kind`, `scope`, `state`,
`charged: true`, and `admitted`. Only the first successful reservation returns
`admitted: true`. Every replay returns false and must not trigger execution,
including a still-reserved operation with an unknown provider outcome.

Scope comes from the signed session and bound native environment. Business ID
currently equals client ID, matching native CMS authority. Actor ID and role
are checked against the original reservation. Staging and production are the
only configured reservation environments.

## Transaction and charging rules

1. Lock the exact site `FOR NO KEY UPDATE`.
2. Acquire the tenant/client budget advisory transaction lock, before the
   existing authority helper acquires shared entitlement locks.
3. Recheck current login, session, owner, membership, site and entitlement via
   `assertPageStudioSessionAuthority` for `model:invoke`.
4. Check the durable operation identity; reject conflicting actor, site, kind
   or fingerprint. A replay never grants another execution.
5. For new work, count all reservations in the current UTC month across the
   tenant/client's sites, sessions and environments. Compare with the current
   site's entitlement `monthly_ai_operation_limit`; insert exactly one charge.
6. Recheck authority immediately before returning from the transaction.

The transaction is not automatically retried. Ambiguous responses require a
read-through replay using the same identity, which cannot readmit execution.
Settled success and failure remain charged. Unknown outcomes remain reserved
and charged. Settlement after revocation may fail; this does not release the
charge. No refund endpoint exists.

The primary key excludes the billing month, so old operation IDs cannot run
again after rollover. The original reservation month remains unchanged by
settlement. Usage also survives entitlement replacement because monthly
counting is tenant/client scoped rather than entitlement-row scoped.

## Migration and local verification

Migration: `421_page_studio_ai_usage.sql`.
SHA-256: `e25df50fa9878e015e0b281ad189fe5822ff65a4b5cfb945d8bf9bab1199ec43`.

The migration was applied twice in each isolated test schema on the owned
localhost PostgreSQL cluster at port 55479, database
`studio_ai_usage_20260921`. Test schemas were removed after each test. No live
database migration was performed; release still requires applying migration
421 before enabling the caller integration.

Twelve real PostgreSQL cases cover shared-budget concurrency, concurrent
replay, month rollover, charged success/failure/unknown outcomes, identity
conflicts, revocation while waiting for budget admission, settlement revocation,
strict requests and unsupported environment rejection. Eight HTTP cases and
eleven gateway cases cover authentication, bounds and exact header forwarding.

The initial build exceeded the immutable raw Pages budget. Equivalent bounded
JSON readers and native actor framing in the existing business-content,
history and email handlers were extracted without changing their limits,
messages or authority order. Fourteen helper regressions and the existing
endpoint tests verify those semantics. The size budget and deployment guards
were not changed.

Final verification on 21 September 2026:

- Current-source full suite: 2,086 files and 14,231 tests passed; 31 files and
  844 tests skipped. The 12 PostgreSQL cases passed separately before the owned
  cluster was stopped. The earlier full run with that cluster enabled passed
  2,087 files and 14,243 tests, with 30 files and 832 tests skipped.
- Production build and unchanged size guard passed: raw 25,468,812 of
  25,468,928 bytes (116 bytes remaining); gzip 6,624,713 of 9,750,000 bytes.
  Further native changes must still pass this narrow raw-byte allowance.
- All 14 changed TypeScript files passed scoped ESLint; the gateway typecheck
  and `git diff --check` passed. Server-only TypeScript diagnostics matched the
  pre-refactor report exactly, with no diagnostics in the changed files.
- Full Nuxt typecheck exited 2 with 913 TypeScript diagnostics, matching the
  recorded baseline count. None refer to the 14 changed TypeScript files.
  This is a baseline comparison, not a clean repository-wide typecheck.
- The disposable PostgreSQL cluster was stopped and removed after verification.
  Its shutdown and migration verification logs were retained. Final `dist`
  output was retained; no deployment or live migration occurred.

Local evidence logs:

- `/private/tmp/dashboard-ai-usage-full-tests-final4-20260921.log`
- `/private/tmp/dashboard-ai-usage-full-tests-final-20260921.log` (PostgreSQL enabled)
- `/private/tmp/dashboard-ai-usage-build-final4-20260921.log`
- `/private/tmp/dashboard-ai-usage-typecheck-final-20260921.log` (server only)
- `/private/tmp/dashboard-ai-usage-typecheck-root-20260921.log` (full Nuxt)
- `/private/tmp/studio-ai-usage-pg-20260921.log`
- `/private/tmp/dashboard-ai-usage-verification-20260921.json`

## Remaining integration

This is native budget admission, not an execution grant or accepted feature
head. The Studio caller still owns reserve-before-call, fingerprinting, terminal
settlement and no-replay behavior. Feature generation UI, native feature draft
acceptance, staged CMS schema activation and action effects remain separately
guarded integration work. No deployment or customer execution was enabled here.
