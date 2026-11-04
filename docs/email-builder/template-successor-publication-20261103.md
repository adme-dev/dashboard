# Same-template successor publication — backend source freeze, 3 November 2026

Task `task_441b66c2f091`, dispatch `ctx_2ad92472d2a7`; coordinator-provided base `6c7f60c5586f9d199f2192e25cf76811fd151532`. This is the bounded backend 08c slice against the original design's stable template identity and immutable revision requirement (spec lines 61–101, 125, 155–164), approved bridge plan and queue 08c. No Git action or independent verification of branch freshness was authorized here. Concurrent UI/native work is excluded from this freeze.

## Contract and ownership

Existing template-library endpoint accepts a new strict command through its existing version/session/gate/publisher/read owner:

```ts
{
  version: 1, command: 'revise-template', operationId,
  draftId, expectedRevisionId, templateId, expectedTemplateRevisionId,
  name, category, includedOverridePaths
}
```

`draftId` is an exact saved working-template or campaign document; `templateId` must already own a published canonical template. Scope cannot change. No canonical JSON, HTML, actor, policy, subject or scope payload is accepted. Saved source metadata is authoritative. Source and target each require fresh read and publisher rights, independently before and after compilation/registered-byte awaits and before the receipt. Designer-only rights do not publish. Generic template CRUD/staff draft writers remain unable to edit or promote published owners. No endpoint/admission/UI file changed.

`shared/emailRendering/designTemplates.ts:9` defines the additive contract. `server/utils/email-marketing/designTemplates.ts:101` locks persisted source/target owners in deterministic table/UUID order, then both documents in UUID order. The existing actor/operation advisory lock and namespace run first (`:197`). The successor path (`:126`) verifies the original confirmed receipt digest before new readiness work; matching replay returns the original R2 after later source/target heads or source freeze, with fresh source/target authority. Changed payload/cross-command/asset-operation namespace reuse conflicts. There is no nested transaction or automatic retry after an unknown commit.

For a new operation, both exact heads must match. The canonical saved source must be current and mutable; it is cloned server-side with kind `template`, preserving complete blocks, policy/locks, asset descriptors, lineage, dependency closure, module pins and metadata. Reviewed local-override paths must match exactly. Registered descriptors and bytes, immutable dependency scope and compiled HTML media are checked through existing owners; unsupported native artifacts fail closed. Asset locks are acquired in sorted ID order while saved canonical order is retained. Existing renderer/client is reused. Same target document receives immutable R2, head, current projection/subject/preheader, explicit name/category and receipt in one transaction; source and campaign pins are untouched. Receipt writes and deferred constraint failures roll everything back.

Old publish/copy parser fields, digest recipes and result shapes remain unchanged. New results use the same `{documentId, revisionId, templateId, published:true}` receipt, with the existing destination owner/document. The dedicated unit test pins both previous digest values, and existing library/history/backend regressions passed.

## Migration 499: required, configured application pending

`server/database/migrations/499_email_template_successor_projection.sql` adds nullable immutable `template_rendered_html_sha256` to the existing revision row. 498's `rendered_html_sha256` is explicitly campaign-only, so reusing it for template successors would violate that frozen guard. This adds no registry, owner, mutable head store or renderer. Revisions remain protected by the existing immutable-row guard.

499 replaces 492's projection function through the new migration only. A published successor requires an advanced exact current pointer/head, immediate same-document schema-1 parent matching the old projection/metadata, same published kind/scope, source blocks/metadata matching the new head and an exact compiled HTML hash. Deferred constraints require head/projection to commit together. Raw same-head rewrites, pointer tampering, head-only advances, rewind, cross-owner pointer, kind promotion/demotion, forged HTML and structured-to-legacy downgrade refuse with the existing readable `email_design_revision_required` constraint. Draft behavior and schema-0 legacy editing are preserved. Existing initial publication's NULL-pointer R1 remains allowed only when it matches the immutable schema-0 creation snapshot; the next publication sets the real pointer. No backfill or flag activation is included.

Actual 491–496/498/499 migrations ran twice in each fresh test schema, once without 497 and once with 497. No public extension mutation was needed. 491–498 source was not edited; protected hashes are recorded separately. **Configured database migration is PENDING**, intentionally owned by the coordinator after independent review; this disposable exercise does not satisfy that release step.

## Verification

Evidence directory: `.verification/template-successor-20261103/`. Existing Node 24.18.0 and dependencies were used read-only; no install/build/native/browser/provider/email/CI/deploy/configured DB action occurred.

| Check | Raw result | Evidence |
|---|---|---|
| New strict contract before implementation | 1 failed / 2 passed: absent discriminator | `red-contract.log` |
| Real T/R1 → A/B → saved-source edit → same T/R2 before implementation, both M06 variants | 2 failed: absent discriminator after real existing publication/create | `red-pg.log` |
| Final new focused suites | 40 real PG + 3 unit passed, 0 skipped | `focused.log` |
| PG regression run: successor, existing library/history, campaign backend | 74 passed / 3 files, 0 skipped | `pg-final.log` |
| Focused units: successor plus ten existing template/library/assets/history/conflict/review suites | 86 passed / 11 files, 0 skipped | `regressions.log` |
| ESLint four owned TS files | Exit 0, no diagnostics | `lint.log` |
| Scoped TS (`strict:false`, existing tiny ambient helper) | 0 owned; 21 transitive diagnostics retained | `types.cjs`, `types.json`, `types.log` |

Counts overlap; they are not additive. Initial fixture errors (template content writer does not accept metadata; M06 cannot jump from draft to sent without approval) were corrected to use existing metadata and submit/independent-approve owners, preserving their guards. The type check found three new-test `unknown` row typings, fixed with explicit returned-ID types. It is not a full Nuxt check: remaining diagnostics include missing Nuxt auto-import globals and existing transitive db/storage types, all outside owned files, not silently suppressed. Vite's native-config warning is retained. No claim is made that the full repository typecheck is clean.

The 20 PG cases run in both M06 modes, exercising:

- Real initial publication with pinned module, registered image, locks and metadata; independent A/B pinned to R1; saved-source R2 publication into the **same** template/document; immutable R1 and unchanged A/B; independent module-head advance; new C explicitly selects R2. Working template and edited campaign source stay unchanged, including the campaign base pin.
- Committed lost-reply replay before/after R3/source advance; replay with now-unreadable bytes bypasses new readiness; changed payload/command/namespace and fresh revoked rights refuse. A frozen campaign source permits confirmed replay but refuses new publication.
- Source/target CAS, scope, publisher/read revocation around awaits, independent target publication rights, override review, bad bytes, unregistered output HTML, compile and receipt-write rollback.
- Concurrent distinct operations and two different source owners: one winner and exact `REVISION_CONFLICT` loser, with observed owners-before-documents ordering. Identical operation race returns one receipt/revision.
- Raw projection/head/kind/hash tampering, legacy compatibility and schema-1 downgrade refusal, with unchanged snapshots after failures. This tests database shape/atomicity; synthetic permission/storage callbacks do not prove real session or R2 acceptance.

PG used only assigned socket `/private/tmp/figflow-postgres-20261102-recovered`, port 55483, user `figflow_test`, database `figflow_design_test`, in unique owned schemas. Each new-suite schema was dropped and its absence queried (`cleanup.json`). Other suites own their separate disposable schema cleanup. No configured/customer rows were read or changed.

## Frozen files and limits

| Owned source/test file | SHA-256 |
|---|---|
| `shared/emailRendering/designTemplates.ts` | `edce69a9562666083bd186ff2bb4b6950a52e91831df2637e18262ebc0e66d9f` |
| `server/utils/email-marketing/designTemplates.ts` | `318512947f6f77335367b2df43932ababf96f86bc18552c08978254271c7da56` |
| `server/database/migrations/499_email_template_successor_projection.sql` | `31cad088418962141d990368cc2fb460fd030ee2eb2cb9530078d16f49f06453` |
| `test/unit/emailTemplateSuccessor.test.ts` | `804d4999b18ce2db0a3395c750b0604317d30e69b9d1eeb5578eb2a6d96b16dd` |
| `test/integration/emailTemplateSuccessor.database.test.ts` | `554128c478ddabfe86f39601591e00805dbec1e369373f331572e8bc975d8aab` |

`source-freeze.json` duplicates the five source hashes; `protected-migrations.json` records 491–498. `couplings-before.json`/`couplings-after.json` identify actual concurrent inputs. `designHandoffs.ts` changed under its separate UI owner between snapshots; this slice did not edit/import that handoff and makes no UI/handoff acceptance claim. Other recorded canonical module/revision/metadata/campaign/owner and protected migration inputs were unchanged in that interval. No original acceptance fixtures, inventory, ledger, queue, pins, workflow or marketing page were edited or staged by this worker.

Remaining acceptance is explicit: independent review, parent application of 499 to the configured DB, explicit publication UI with target/version and override review, final integrated CI/size checks, and real same-T/R2 WASM/runtime acceptance. No whole-08c, hosted, deployed or real-client completion is claimed. Source hashing does not replace those gates.
