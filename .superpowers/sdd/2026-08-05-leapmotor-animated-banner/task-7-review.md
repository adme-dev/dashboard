# Task 7 independent review — God Mode terminal finalization

Reviewed commit `8b566fa9` and report commit `adcbcb70`. Governance commit `6ba509f5` was considered only for integration/build evidence. No deployment, production mutation, or live migration was performed.

## Verdict

**NOT SAFE TO DEPLOY.** The original long-transaction and terminal-identity defects are closed, but one stale-lease interleaving can delete the shared deterministic R2 object after ownership has transferred. This can leave the single committed `banner_assets` row pointing at a missing object. Fix the Critical finding and add the missing adversarial regression before deploying the application or applying migration 349.

## Critical findings

### 1. A superseded uploader can delete the new claim owner's shared R2 object

Evidence: `server/utils/banner/godModeAssetUpload.ts:248-253`, `:558-583`, and `:391-395`.

The coordinator correctly preserves the object when terminal finalization discovers `CLAIM_OWNERSHIP_LOST`: it clears `current.newR2Key` before surfacing recovery. That protection is too late for an error from the active R2/result path. `executeGodModeBannerAssetUpload()` sets the durable deterministic key as `current.newR2Key`, performs the R2 operation, and on **any** upload/result error immediately calls `compensateNewObject()` without rechecking claim ownership.

A concrete interleaving is:

1. Request A durably reserves `(assetId, r2Key)` and starts an R2 operation.
2. Its two-minute ledger lease becomes stale while A is still alive.
3. Request B reclaims the dispatched lease and correctly reuses the same `(assetId, r2Key)`.
4. B writes the shared key (and may finalize the asset).
5. A's `put`/`head` or result validation throws; A unconditionally deletes that shared key before its later terminal path can notice ownership loss.

The request digest makes both uploads the same logical content and deterministic identity, but it does not make deletion safe. The outcome can be one database asset with no R2 object, violating the required one-asset/one-object crash invariant. Existing tests cover stale dispatched takeover and ownership loss during terminal persistence, but not an old uploader throwing after takeover.

Recommended closure: for coordinated uploads, do not compensate inside the execution catch after the durable `dispatched` reservation. Preserve the key and let failed terminal finalization first atomically prove current correlation ownership and mark the ledger failed; only then delete. If ownership was transferred, the existing `CLAIM_OWNERSHIP_LOST` branch must preserve the object. Add a deterministic test that pauses A, reclaims with B, lets B put/finalize, then rejects A and asserts A never deletes the shared key.

## Important findings

### 2. Diagnostic `errorClass` accepts arbitrary error names and does not meet the stated no-secret contract

Evidence: `server/plugins/godModeAudit.ts:31-41` and `test/server/plugins/godModeAudit.test.ts:247-272`.

Messages, query text, parameters, response bodies, and invalid SQLSTATEs are excluded correctly. However, any non-empty `error.name` up to 64 characters is logged verbatim. A thrown SDK/custom error can set `name` to a token fragment, SQL text fragment, or control-bearing value and bypass the intended bounded diagnostic policy. The test uses the safe built-in name `Error`, so it does not exercise this boundary.

Map error classes to a small allowlist/category set (for example `Error`, `TypeError`, known database/coordination classes, otherwise `unknown`) rather than logging an arbitrary property. Add hostile custom-name cases, including a secret-like value and control characters.

### 3. Ordinary upload compensation still cannot distinguish an autocommit success with a lost response

Evidence: `server/utils/banner/godModeAssetUpload.ts:527-538` and `server/api/agency/banner-studio/assets/upload.post.ts:135-152`.

This is inherited ordinary-user behavior rather than a regression in the God Mode claim protocol: the non-coordinated path calls the auto-commit `queryOne()` insert and deletes R2 for every rejection. If Postgres commits the asset row but the response is lost, ordinary compensation deletes the object and leaves the committed row broken. The focused ordinary test covers only a definite mocked insert rejection.

This does not weaken the conclusion that ordinary project creation remains behaviorally unaffected, but the stated ordinary/owner compensation invariant is not fully met. Either classify this explicitly as accepted legacy risk or give ordinary uploads a durable identity/reconciliation boundary too.

## Minor findings

### 4. The live-drift regression proves the final guard, but does not simulate replacing a permissive live function

Migration 349 is a forward, transactional, re-runnable `CREATE OR REPLACE FUNCTION`; it restores the exact migration-347 checks without changing tables, constraints, or data. The database suite verifies all bounded identity dimensions under the resulting function. It applies current migrations 345/346/347/349 in sequence, though, and current migration 347 already contains the strict definition. A stronger drift test would install the known permissive live definition immediately before applying 349, apply 349 twice, and then prove an entity mismatch is rejected.

## Confirmed closures and verification

- Root cause: the asset upload no longer holds a Neon/Hyperdrive transaction or checked-out client across native R2. Claim/reservation and final insert/ledger/audit work use separate bounded transactions; R2 uses the request-owned Cloudflare binding.
- Identity: asset and project terminals retain the immutable attempt's actor, correlation, session, channel, route, tenant/client, entity, controls, and emergency identity. Created entity linkage is stored in `god_mode_execution_ledger.result_reference`.
- Scoping: ledger admission is actor + application channel + idempotency key, with exact route and validated upload digest checks. The handler compares that digest to canonical validated filename/MIME/content identity before R2.
- Wait/takeover: same-key polling is bounded to 40 polls with 25 ms delay; only stale `claimed`, or stale `dispatched` rows with a valid durable UUID/key identity, are reclaimable. The superseded attempt is closed with its original audit identity.
- Recovery: stale dispatched takeover reuses persisted `assetId`/`r2Key`; ambiguous final COMMIT reconciliation requires matching ledger state, terminal, asset ID, R2 key, and actor. Ambiguous/unavailable reads preserve R2. The asset query guards the UUID cast with regex/`CASE`.
- Compatibility: transaction helpers use dedicated connections for Hyperdrive/Neon and classify post-COMMIT failures as ambiguous. Project creation contains no R2 boundary and ordinary project creation remains on its existing transaction path.
- Migration ordering: application code must be deployed and verified before migration 349. Do not apply the stricter global trigger while older entity-enriching application code can still write terminals. Migration 349 remains unapplied by this review.
- Compactor: the explicit exact-path audit contains **112** entries, **14,379** recorded bytes of delta, and no duplicate paths. The implementation retains names for audited modules that expose named exports and for every unlisted route. The reported fresh artifact was **24,747,777 / 24,750,000 bytes**, a **2,223-byte** margin; no full build was repeated in this review.
- Focused review run: `bannerAssetGodModeMutation`, `bannerProjectGodModeMutation`, `godModeAudit`, and `godModeAuditMigration` passed **52 tests**, with **10 opt-in database tests skipped** because this review had no disposable database URL. The implementation report separately records an isolated Neon run of the migration file with **14/14 passing**; that external run was not repeated here.

## Deployment gate

1. Fix Critical finding 1 and add the exact stale-takeover/old-uploader-error test.
2. Harden diagnostic class mapping and add hostile-name coverage.
3. Re-run the focused unit suite and isolated Neon migration suite.
4. Rebuild and remeasure the worker because the current 2,223-byte margin is corpus-specific.
5. Deploy and verify the application SHA first; only then apply migration 349 and verify the installed function definition/exact-identity smoke test.

## Fix round 1 resolution ledger

Implementation commit: `eb6811d5 fix: preserve reclaimed banner upload objects`

- **Critical 1 — CLOSED.** Coordinated upload/result errors retain the cleanup key until failed-terminal persistence atomically locks the ledger and proves the same correlation still owns the dispatched claim. The exact A-pauses/B-reclaims-and-finalizes/A-throws regression proves the superseded request never deletes the shared object.
- **Important 2 — CLOSED.** `errorClass` is mapped by built-in error type to a fixed category or `unknown`; arbitrary `error.name` is never read into diagnostics. Secret-like and control-bearing adversarial names are covered.
- **Important 3 — CLOSED.** Ordinary inserts use the preallocated asset ID and fresh exact reconciliation after rejection. Exact commit evidence returns success; null/unavailable/mismatch cannot fence absence, so all preserve and fail with bounded recovery.
- **Minor 4 — CLOSED.** The database harness installs a known permissive correlation-only live guard immediately before migration 349, applies 349 twice, and proves an entity mismatch is rejected.

Verification at this checkpoint:

- RED: seven intended ownership/reconciliation/diagnostic failures.
- GREEN: ownership + diagnostics 46/46; full non-DB focused slice 68 passed with 11 opt-in DB cases skipped.
- Isolated Neon: 15/15 passed in a generated schema; schema dropped; migration 349 not applied to the live/default schema.
- Owned Node 24 lint and diff checks passed.
- Final combined guard/build/size/Workerd verification remains pending the concurrently active client-portal commit so the measured artifact includes both workstreams.

Deployment remains blocked until that final combined verification is recorded. No deploy or live migration occurred in this fix round.

## Follow-up re-review resolution ledger

Implementation commit: `d553698b fix: fence banner upload compensation`

- **Pre-lock definite rollback ownership gap — CLOSED.** The fallback failed-terminal transaction now locks the ledger row and proves the same in-progress correlation before committing failure and authorizing cleanup. A successor-owned or successor-finalized row returns no ownership proof, clears the superseded request's cleanup key, preserves R2, and surfaces bounded recovery.
- **Unfenced ordinary null — CLOSED.** One immediate fresh null after an autocommit response loss is never treated as conclusive absence. Null, mismatch, and unavailable reconciliation preserve the object; an exact durable row alone returns success.

TDD evidence: both new adversarial cases failed against `eb6811d5` and passed against `d553698b`; the focused suite then passed 69 tests with 11 opt-in DB cases skipped. Owned Node 24 lint and diff checks passed. Final combined guard/build/size/Workerd verification remains the deployment gate. No deploy or live migration occurred.
