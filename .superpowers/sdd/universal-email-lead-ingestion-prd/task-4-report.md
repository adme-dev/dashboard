# Task 4 report — signed email staging and canonical lead bridge

## Outcome

Implemented the private Worker-to-Nitro email-ingestion boundary:

- Exact-body HMAC verification using `v1\n<timestamp>\n<nonce>\n<SHA-256(body)>`, strict five-minute freshness, constant-time digest comparison, and a ten-minute atomic nonce reservation before endpoint lookup.
- Minimal signed policy lookup with no tenant, endpoint, form, or token fields in its response.
- Endpoint-scoped stage reservations keyed by `(endpoint_id, external_id_hash)`, random opaque R2 keys, non-terminal reservation reuse, and terminal duplicate responses.
- Fresh endpoint/token, provider, sender-domain, correlation, external-ID, and Message-ID-hash checks at canonical ingestion.
- Mapping into `InsertLeadInput` with `email:<endpoint-id>:<external-id-hash>` identity, endpoint-owned form/client values, `unknown` consent, truthful-contact quarantine, and relay-field exclusion.
- Canonical `resolveLeadCaptureMode()` + `acceptLead()` use only; no direct `leads` insertion.
- Terminal status writes, bounded leased claims, retry-safe failure updates, and advisory tenant-scoped HMAC duplicate signalling after canonical acceptance.

No migration was needed: migrations 315–319 already provide the required nonce, endpoint, ingestion lifecycle, endpoint-scoped unique identity, and safe-evidence constraints.

## RED → GREEN evidence

Tests were written before the Task 4 production modules. The initial Node 24 run was RED as expected because the new modules did not exist:

```text
Test Files  4 failed
Tests       no tests (module import failures)
```

The missing imports were `server/utils/leads/emailIngestion` and `server/utils/leads/emailDuplicateSignal`; this demonstrated the focused behaviors had no pre-existing implementation.

After implementation, the final Node 24 focused run was GREEN:

```text
Test Files  10 passed (10)
Tests       62 passed | 1 skipped (63)
```

The focused command covered the Task 4 suites plus endpoint, generic, Meta, Podium, canonical lead-capture, and intake regressions. The isolated Google webhook test still fails at module import because its existing DB mock omits `transaction`; that is an established baseline failure and was reproduced unchanged.

## Commands and verification

```text
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run \
  test/server/utils/leads/emailIngestion.test.ts \
  test/server/utils/leads/emailDuplicateSignal.test.ts \
  test/server/api/leads/email-stage.test.ts \
  test/server/api/leads/email-ingest.test.ts \
  test/server/api/leads/webhook-generic-cors.test.ts \
  test/server/api/leads/webhook-generic-measurement.test.ts \
  test/server/api/leads/webhook-podium.test.ts \
  test/server/api/leads/webhook-meta.test.ts \
  test/server/utils/leads/leadCaptureContract.test.ts \
  test/server/utils/leads/intake.test.ts \
  test/server/utils/leads/emailEndpoint.test.ts
```

Result: 10 files passed, 62 tests passed, one optional isolated-Postgres skip.

```text
NODE_OPTIONS='--max-old-space-size=16384' /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/nuxt/bin/nuxt.mjs typecheck
```

Result: no diagnostics matching Task 4 files.

```text
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run
```

Result: `20 failed / 1232 passed / 4 skipped` files; `39 failed / 7033 passed / 7 skipped` tests; `3` unhandled errors. This exactly preserves the required 39-failure/3-error baseline.

`git diff --check` passed.

## Deep review / battle test

Read each modified and new file end-to-end. Confirmed server imports use `~~/`; no UI or SSRF surface was introduced; request schemas remain bounded; raw subject/body/MIME/provider IDs/tokens are neither persisted nor logged; signatures use the exact raw string read by the handlers; nonce insertion precedes endpoint lookup; stage keys are cryptographically random; terminal/retry updates satisfy the migration lifecycle contract; and duplicate signalling uses only existing HMAC identity keys scoped to the accepted lead's client.

During review, corrected the duplicate-signal CASE expression so a phone-only match cannot be mislabeled as `email_hmac` merely because an email was also present in the new lead.

## Remaining concerns

- The focused suite has mock-driven stage coverage. Migration 315 already includes optional real-Postgres lifecycle coverage, but this worktree has no `EMAIL_INGESTION_TEST_DATABASE_URL`, so a live concurrent claim/reservation test could not be run here.
- The scheduled R2 recovery/replay path is explicitly Task 9 scope and was not implemented or changed.

## Fix round 1

### Corrections

- Extended the signed stage contract with bounded, normalized
  `envelopeSenderDomain` and `headerFromDomain` evidence. Stage now compares
  both values with the freshly locked endpoint sender allowlist before
  creating or returning a reservation.
- Replaced the extraction-field denylist with an explicit customer/contact
  allowlist. Provider IDs, Message-ID fields, subjects, raw body/HTML/MIME
  fields, relay addresses, and token fields cannot enter canonical
  `field_data`; the separately bounded, sanitised `message` field remains the
  intentional customer-message mapping.
- Changed max-attempt claiming so attempt five atomically becomes terminal
  `failed` with `next_attempt_at = NULL`. Canonical acceptance is not invoked,
  and no non-terminal row with `attempt_count = 5` can violate migration 315's
  lifecycle constraint.
- Added both SQL-level `candidate_lead.client_id = $1` enforcement and a
  result-boundary client check for advisory duplicate evidence.
- Expanded behavior coverage for policy privacy, active/previous/unavailable
  endpoint resolution, sender-policy drift, disabled-stage races,
  endpoint-scoped/rotated/provider/fingerprint idempotency, random object keys,
  valid-UUID unknown and mismatched claims, terminal and concurrent claims,
  max-attempt exhaustion, canonical full-CRM acceptance, advisory-similarity
  failure, HMAC rejection paths, forbidden persistence families, and
  email/phone/both/conflict/window/same-lead/cross-client duplicate cases.

### RED evidence

The new tests were run before production changes:

```text
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node \
  node_modules/vitest/vitest.mjs run \
  test/server/utils/leads/emailIngestion.test.ts \
  test/server/utils/leads/emailDuplicateSignal.test.ts \
  test/server/api/leads/email-stage.test.ts \
  test/server/api/leads/email-ingest.test.ts
```

Result:

```text
Test Files  4 failed (4)
Tests       11 failed | 27 passed | 1 skipped (39)
```

The failures directly demonstrated all four review defects: stage sender
fields were rejected and could not be enforced, forbidden raw/identity keys
were copied, a fifth claim reached canonical acceptance, and a cross-client
candidate was returned.

### GREEN and regression evidence

Final Task 4 focused run:

```text
Test Files  5 passed (5)
Tests       52 passed | 1 skipped (53)
```

Expanded parser/provider/endpoint/generic/Meta/Podium/intake/CRM regression
run:

```text
Test Files  14 passed (14)
Tests       127 passed | 1 skipped (128)
```

The isolated Google webhook regression still reproduces its established
baseline import failure because that test's DB mock does not export
`transaction`.

Node 24 Nuxt typecheck ran with
`NODE_OPTIONS='--max-old-space-size=16384'`; no diagnostic matched the changed
contract, ingestion, duplicate-signal, policy, stage, or ingest files.

Complete Node 24 Vitest result:

```text
Test Files  20 failed | 1233 passed | 4 skipped (1257)
Tests       39 failed | 7060 passed | 7 skipped (7106)
Errors      3 errors
```

The required `39` failure / `3` error baseline is unchanged.

### Deep review

Re-read every changed file end-to-end and rechecked server aliases, strict
schema bounds, token/provider/raw-content privacy, endpoint authority, sender
domain normalization, stage idempotency, claim lifecycle/concurrency,
terminal-state invariants, tenant-scoped identity evidence, canonical
acceptance, and absence of URL fetching/SSRF surfaces. No migration was
required. `git diff --check` passed.

## Fix round 2

### Correction

- Corrected the retry boundary so canonical handoff attempts 1 through 5 are
  all invoked. Attempts 1 through 4 retain the existing non-terminal lease.
- The fifth claim now atomically transitions, under the existing row lock, to
  `attempt_count = 5`, terminal `failed`, `next_attempt_at = NULL`, and the
  internal `final_attempt_claimed` marker before invoking the canonical
  boundary. This satisfies the unchanged database constraint while ensuring
  a concurrent or later caller observes a terminal row and cannot start a
  sixth handoff.
- A successful fifth handoff may promote only that specifically marked claim
  to `accepted` (or another canonical terminal outcome) and clears the marker.
  A failed fifth handoff replaces the marker with the real error class and
  remains terminally `failed`.

### RED evidence

The handler behavior test was changed before production code and run with:

```text
pnpm exec vitest run test/server/api/leads/email-ingest.test.ts
```

Result:

```text
Test Files  1 failed (1)
Tests       4 failed | 12 passed (16)
Exit        1
```

The attempt-five cases returned `quarantined` without calling canonical
acceptance. Three failures directly covered fifth-attempt handoff, success,
and failure; the fourth was the deliberately unconsumed fifth-attempt
rejection reaching the following test because the handoff was skipped.

### GREEN and regression evidence

Final handler run:

```text
Test Files  1 passed (1)
Tests       16 passed (16)
Exit        0
```

Focused ingestion/stage/policy/duplicate suite:

```text
Test Files  5 passed (5)
Tests       59 passed | 1 skipped (60)
Exit        0
```

Expanded endpoint/generic/Podium/intake/CRM regression suite:

```text
Test Files  15 passed | 1 skipped (16)
Tests       115 passed | 2 skipped (117)
Exit        0
```

The optional real-Postgres test remains skipped because
`EMAIL_INGESTION_TEST_DATABASE_URL` is not configured.

Node 24 Nuxt typecheck completed with its established unrelated diagnostics;
none matched `emailIngestion.ts` or `email-ingest.test.ts` (`Exit 1`).

Complete Node 24 Vitest result:

```text
Test Files  20 failed | 1233 passed | 4 skipped (1257)
Tests       39 failed | 7071 passed | 7 skipped (7117)
Errors      3 errors
Exit        1
```

The baseline remains exactly 39 failed tests and 3 unhandled errors. Passing
tests increased by 11 due to the new retry-boundary cases.

### Deep review

Re-read the complete ingestion implementation, handler tests, and lifecycle
constraints in migrations 315–317. Verified the fifth-claim transition is
constraint-valid at commit time, terminal-state promotion is restricted to
the internal final-claim marker, failure finalization cannot reopen attempt
five, the row lock serializes claims, and every later claim exits before
canonical acceptance. The database constraint was not weakened and no
migration was required. Server imports remain `~~/`; this change introduces
no UI, URL-fetching, SSRF, raw-content, or token-persistence surface.
`git diff --check` passed.
