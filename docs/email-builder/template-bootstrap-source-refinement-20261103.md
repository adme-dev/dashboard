# Template bootstrap source refinement — 3 November 2026

Task `task_d8d28aa2313e`, dispatch `ctx_e65561c2ca65`. **SOURCE ONLY — DB NOT RUN.** Independent PG verification remains **FAILED / INCOMPLETE / BLOCKED** and configured migration 499 remains blocked. This refinement does not close P1, authorize migration application or approve a runtime/build pin.

Read the narrowed assessment `.verification/template-successor-independent-rereview-20261103/REPORT.md`, verified SHA-256 `a25b3871e56ec66788932646c64ae68af5bff45ff21e882c2edb4c3a928219e6`, and traced the actual existing publication helpers. Its static concern is valid: candidate `94e9c1fe…` checked schema 1 and a matching schema-0 parent, but did not establish the original root or the first structured revision.

The assessment records that automatic classification blocked the independent database assignment; its underlying classification reason was not supplied. No retry, reconstruction, alternate placement/model, database connection, SQL execution, schema operation, fixture lifecycle or test execution was performed here. Old author 103-test evidence is historical and does not validate this new hash. No new executable regression scenario was added or delegated; the blocked verification remains blocked.

## Narrow predicate change

Only `server/database/migrations/499_email_template_successor_projection.sql:117–133` changed: an explanatory comment and one conjunct in the initial NULL-pointer publication exception. The current schema-1 head must join directly to a same-document schema-0 legacy parent whose parent is NULL, and **no other immutable revision may exist in that document**. All existing scope, blocks, metadata, snapshot HTML, NULL pointer/hash and current-head conditions remain.

This establishes the original root using the existing immutable revision identity and unique-root invariant, rather than mutable owner labels or a new state flag. The only two allowed revision identities in this exception are the root and the current structured head. Any earlier structured revision is distinct from both (the root is schema 0, and the current head has its own immutable UUID), so its presence excludes this exception. A non-root legacy parent also fails the explicit NULL-parent requirement. This is source reasoning, not an executed database result.

The genuine helper sequence is unchanged:

1. `server/utils/email-marketing/designTemplates.ts:312–342` inserts a fresh published owner with server-rendered source/HTML and metadata, initializes its document, and appends the first design in the same caller transaction.
2. `designRevisions.ts:586–604` creates that document and its schema-0 `origin='legacy'` root without a parent, snapshots the freshly inserted owner, and sets that root as head.
3. `designModules.ts:49–61` appends schema-1 R1 directly to that root with saved metadata, then advances the head. For published owners, `designTemplates.ts:343–348` does not perform the draft-only projection update, leaving the initial NULL pointer.

At the deferred source boundary, that fresh helper state contains exactly the original legacy root and its first structured child, so it remains eligible for the exception if the pre-existing projection/scope/metadata checks match. An unchanged legitimate initial R1 later receiving a pure label edit still has that same pair. Genuine schema-0 legacy states use their separate existing branch. Same-T hashed R2/R3 use the ordinary head/pointer/hash path, rather than this initial-publication exception. OLD-published/history protections, draft logic, normal successor validation and the existing metadata owner are byte-identical outside this edit; no 491–498, service, test, UI, handoff, pin or workflow file changed.

## Static evidence and freeze

Evidence directory: `.verification/template-bootstrap-source-refinement-20261103/`.

- `before/server/database/migrations/499_email_template_successor_projection.sql` preserves exact `94e9c1fe811e532dc3bc1d9602ebdfaafca1acbb2eff378346acb6502094ea93` bytes.
- `499-bootstrap.diff` is the exact one-hunk diff; `static-validation.json` records edit confinement, unchanged function delimiter count, whitespace and preserved-file hashes. These are static scope checks, **not** SQL syntax compilation, database tests or runtime acceptance.
- `preserved-before.json` and `protected-migrations.json` record old reports/manifests/logs and unchanged 491–498; those prior files were not overwritten. `source-couplings.json` records the read helper, metadata-owner and unchanged test inputs. `commands.txt` records the source-only actions and explicit exclusions.
- No TypeScript source changed, so no TS test/compilation lifecycle was needed or invoked. No SQL parser/compiler or database runtime was invoked. There is no new pass count or cleanup receipt.

New **UNAPPROVED** migration 499 SHA-256: `422555ef7e790504ab64e8476cdcee1c15759d7d4edf32a2e67eea953625128b`.

`final-freeze.json` records this SQL and report. Parent must retain the independent task's failed/incomplete status and the original P1/configured-application block; this candidate needs the required review and any separately permitted validation before pin acceptance or application. UI, actual-WASM, hosted and real-client acceptance remain unclaimed.
