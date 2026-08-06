# Task 7 — God Mode terminal finalization report

Implementation commit: `8b566fa9 fix: finalize God Mode banner mutations durably`

## Outcome

God Mode banner asset uploads no longer hold a Neon/Hyperdrive transaction open across native R2 work. The coordinator now commits a short durable claim and storage identity before upload, performs R2 work without a checked-out database connection, and uses a separate short transaction to insert the asset, capture the ledger result, and append the immutable terminal audit.

Project creation and asset upload terminals preserve the exact identity of their immutable attempt. Created entity linkage is stored in `god_mode_execution_ledger.result_reference`; terminal audit rows no longer rewrite `entity_type` or `entity_id`.

The audit plugin now emits bounded terminal-persistence diagnostics containing only correlation ID, route, fixed stage, bounded error class, and validated five-character SQLSTATE. Error messages, SQL, parameters, tokens, and response bodies are never logged.

## Root cause and durable upload protocol

The previous asset coordinator kept its transaction connection alive while calling R2 `put`/`head`. Production could lose that connection after R2 succeeded, rolling the database transaction back while leaving an object side effect. The same coordinator and the project coordinator also changed terminal entity identity after entity creation, which conflicts with migration 347's exact attempt/terminal identity contract.

The replacement protocol is:

1. Atomically claim the actor/application/idempotency key.
2. Reserve deterministic `assetId` and `r2Key` in ledger metadata and commit the short transaction.
3. Upload through the request-owned R2 binding with no database connection held.
4. In a fresh short transaction, insert the asset, set the ledger result, and append the unchanged terminal.
5. Compensate R2 only after a definite rollback. For ambiguous COMMIT responses, reconcile the ledger, terminal, and asset through fresh reads before deciding whether the object is authoritative or removable.

Same-key concurrent requests wait for the durable result and replay it. A two-minute stale lease can be reclaimed only for the exact actor, route, digest, and valid claimed/dispatched phase. A dispatched takeover preserves the already-persisted storage identity, closes the superseded attempt with an exact-identity `claim_lease_expired` terminal, and prevents the old request from deleting the shared object.

Ambiguous asset lookup now guards UUID conversion with a regex/`CASE` expression instead of casting untrusted reconciliation text directly.

## Migration 349

`349_god_mode_audit_identity_guard_reconciliation.sql` is a forward, idempotent reconciliation of `guard_god_mode_audit_event_insert()`. It restores migration 347's exact attempt/terminal identity checks and changes no data, table, or constraint.

Required production order:

1. Deploy application commit `8b566fa9` (or a descendant containing it).
2. Verify the deployed SHA/health and the focused God Mode banner tests.
3. Only then apply the migration:

   ```bash
   export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/349_god_mode_audit_identity_guard_reconciliation.sql
   ```

4. Verify the installed function definition and run a bounded exact-identity terminal smoke test.

The migration was **not** applied to the live/default schema during this task. It was exercised only in a generated isolated Neon test schema, together with migrations 345, 346, and 347; that schema was dropped afterward.

## RED/GREEN evidence

Initial regressions failed for the production defects: connection loss across external I/O, asset/project terminal identity rewriting, unsafe UUID reconciliation, missing bounded diagnostics, and the missing forward migration. Follow-up RED cases covered concurrent same-key execution, stale claim takeover, post-dispatch retry identity reuse, and a lost stale-reclaim COMMIT response.

After implementation:

- Owned source/test slice: 5 files passed, 62 tests passed, 10 database tests skipped without the opt-in database URL.
- Expanded God Mode guard slice: 5 files passed, 101 tests passed.
- Earlier combined God Mode/banner slice: 10 files passed, 137 tests passed, 10 opt-in database tests skipped.
- Isolated Neon migration regression: 1 file passed, 14 tests passed; temporary schema dropped.
- Worker postbuild compaction: 12/12 passed, including preservation of internal names for an unlisted route.
- Fresh production-artifact Workerd/Miniflare boundary: 3/3 passed, including the authenticated multipart upload route and request-owned R2 behavior.
- Focused Node 24 ESLint passed for the modified production modules, focused tests, and compactor. The inventory file's three existing double-quote style findings predate the two-number route-count update and were not broadened into unrelated formatting work.
- `git diff --check` and the staged diff check passed.
- `pnpm deploy:check` passed for immutable target `agency-dashboard / main`.
- Full typecheck still reports the repository's known broad backlog; its filtered output contained no error for the changed implementation files.

## Worker release budget and audit drift

No size limit or path-wide name-removal rule changed. Source simplification reduced the initial misses, but the fresh worker was still over the immutable 24,750,000-byte budget:

- 24,757,134 bytes (7,134 over)
- 24,755,639 bytes (5,639 over)
- 24,752,030 bytes (2,030 over after final source simplification)

The already-reviewed `NAME_DROPPING_MODULE_AUDIT` mechanism was extended only with the next-largest measured, default-only production route paths. The final audit contains 112 exact paths with 14,379 recorded bytes of `keepNames` delta. The fresh artifact check found zero missing and zero duplicate audited paths; unlisted routes still preserve names.

The final Node 24 build started after the concurrent governance-page edits, prerendered 161 routes, and passed at **24,747,777 / 24,750,000 bytes**, leaving **2,223 bytes**. The exact upload route then passed through the fresh compacted artifact under Workerd.

The recorded deltas remain corpus-specific audit evidence rather than a content-hash gate. Any future generated-route drift must be remeasured before adding or changing an entry; path-wide matching remains prohibited.

## Production safety

No production deploy, live asset upload, ad-platform publish, Cloudflare configuration change, email, or production database mutation was performed. In particular, migration 349 remains unapplied outside the isolated test schema and must follow the deploy-first sequence above.
