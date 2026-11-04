# Template-successor P1 and metadata compatibility repair — 3 November 2026

Task `task_3e968f84aeea`, dispatch `ctx_a02667dde747`. **Repaired source candidate, awaiting independent re-review; migration 499 remains NOT configured-applied.** Only the assigned local disposable cluster was used. No application UI, handoff, native, pins, workflow, configured database, provider/email, Git, install, build, CI or release action occurred.

## Findings and bounded correction

Read the full independent report `.verification/template-successor-independent-review-20261103.md` and verified SHA-256 `60367baa702a1d861be6ec0dd2bb17ba7f893e9c6385426db551159afbf3d777`. Its P1 is valid: the frozen 499 early return trusted the newly current schema-0 head, and the deferred guard trusted final kind. Four genuine R1/R2 compound transactions committed in the new red tests. Immutable R1 bytes were not altered; the published owner invariant was lost. This is a database defensive gap under a role permitted these DML statements, not evidence of an HTTP authorization exploit.

The original blanket downgrade/demotion protection claim in `template-successor-publication-20261103.md` was too broad. That historical report and its manifests/logs are preserved unchanged; this report supersedes that claim **only with the bounded new proof below**, not with a global acceptance assertion. All six originally frozen files were SHA-verified before changes and copied under `.verification/template-successor-review-fixes-20261103/before/`; `before.json` records their original hashes plus the original metadata service. Old evidence hashes and the independent report are preserved. No 491–498 migration was modified.

`499_email_template_successor_projection.sql:35` now checks `OLD.template_kind` plus the owner's immutable schema-1 revision history **before** any schema-0 early return. A published structured owner cannot change kind/client or evade the check by changing its current head. Deferred owner events also retain the old published identity instead of accepting a final draft owner; genuine working draft histories are not inferred to be published. Legacy root/missing-head exceptions require absence of structured history where relevant, while 491's immediate-successor head guard remains unchanged.

A further source review found that two schema-0 descendants could mimic the NULL-pointer R1 bootstrap without demoting the owner. New real-PG tests reproduced this from R1 in both 497 modes (`red-bootstrap-history.log`); the hashed R2 controls already refused. The bootstrap exception at 499 line 117 now explicitly requires schema 1, retaining only the real initial publication. Genuine schema-0 legacy editing, normal draft saves, legitimate same-T/R2/R3, head/hash/projection atomicity, immutable revisions and campaign guards remain exercised by the final suites. No new registry or state flag was added.

## Existing metadata owner retained

The approved compatibility decision permits ordinary library rename/re-folder without republishing canonical content. 499 removes only `name`/`folder_name` from the protected content comparison; kind, scope, body source/HTML, subject/preheader, pointer/head and compiled hash checks remain. Label-plus-content or label-plus-pointer changes still refuse. The former raw-name refusal test is intentionally replaced by positive metadata-owner preservation tests.

Actual `server/utils/email-marketing/templates.ts:updateTemplate` always rendered before its generic update, even for pure labels. Its new narrow branch (`:123–144`) requires a persisted canonical schema-1 **published** owner and a patch containing only `name`/`folder_name`. It updates only explicitly supplied labels and timestamp, preserving folder trimming/clearing and the existing `client_id IS NOT DISTINCT FROM` CAS. It never renders or writes source, saved HTML, subject/preheader, kind, scope, head, revision or receipt. Scope/content/kind/mixed/unknown-key patches retain the previous path; draft and legacy owners retain their rendering behavior. Existing HTTP write/client-scope owners were read and left unchanged; this is not a new metadata engine or grant.

Real-PG cases call this actual service, redirecting only its query transport into the run-owned schema. They exercise bootstrap R1 and hashed R2 in both 497 modes with a renderer that throws if called, then verify exact owner content/HTML, complete revision rows, heads, receipts, campaigns and base pins are unchanged. Explicit label update and folder clear succeed; stale scope returns null; mixed subject/client and raw content/pointer tampering refuse without effects. Service-unit cases separately prove SQL field exclusion/CAS, no write on stale authority, write-time CAS miss, and exclusion of mixed/draft/legacy inputs. Synthetic boundary callbacks do not prove real sessions or production database transport.

## Red → green and regression evidence

All new evidence is under `.verification/template-successor-review-fixes-20261103/`; old logs/manifests were not rewritten. Existing Node 24.18.0 and dependencies were used read-only. Exact commands are in `commands.txt`.

| Check | Raw result | Evidence |
|---|---|---|
| Original compound transaction, both heads × both 497 modes; reversed order controls | 4 failed (unexpected commit), 4 passed; 40 deliberately filtered skips | `red-compound.log` |
| Metadata and head controls before repair | 8 failed / 8 passed; 46 filtered skips | `red-labels-history.log` |
| Two-legacy-descendant bootstrap mimic | 2 failed (R1 commit), 2 passed (R2 refusal); 52 filtered skips | `red-bootstrap-history.log` |
| Final successor + existing library/history/campaign PG + contract/label units | **103 passed / 5 files: 90 real PG + 13 unit, 0 skipped** | `final-pg-focused.log` |
| Broad relevant unit regressions including existing template CRUD/client/rendering owners | **158 passed / 20 files, 0 skipped** | `unit-regressions.log` |
| ESLint six owned/frozen TS inputs | Exit 0, no diagnostics | `lint-final.log` |
| Scoped TypeScript, existing `strict:false`/ambient convention | 0 owned diagnostics, 21 retained transitive diagnostics | `types.cjs`, `types.json`, `types.log` |
| Own-schema cleanup, local identity | Dropped and queried absent | `cleanup.json`, `cleanup-verified.json` |

Counts overlap and must not be summed. Filtered red skips are intentional test-name selection, not acceptance. The final new database suite has 56 cases: original 40 minus two obsolete raw-label refusals plus eight compound/reordered cases, four label-owner cases, four bootstrap-history cases and two existing head-guard controls. The 103 combined result includes these 56 plus 34 existing real-PG cases and 13 unit cases. Each 497 mode applied actual migrations 491–496/498/499 twice, plus 497 twice when enabled.

The initial green attempt exposed two test-only mistakes: the existing 491 rewind/null-head refusal has SQLSTATE 55000 and message `Email design head must advance to its successor` without a named constraint, and a bare `name` regex also matched `folder_name`. Expectations were corrected to the traced existing error and a word boundary; no production guard was weakened. Initial lint formatting findings were fixed. The type check is deliberately scoped, not a full Nuxt pass: the 21 transitive diagnostics include Nuxt auto-import globals and db/storage types outside this slice, retained in JSON. Vite's existing native-config warning remains in raw logs. Full integrated CI/size remains parent-owned; no full-repository success claim is made.

The final tests retain real publish T/R1 → independent A/B/R1 → saved edit → same T/document R2 → immutable R1/A/B → module head advance → C/R2; legitimate R3 and lost-ack replay; fresh source/target rights, CAS/namespace conflicts, byte/output readiness, compile/receipt rollback, concurrency and explicit override review. Compound refusals additionally compare complete immutable rows and owner/head/receipt/campaign snapshots after transaction rollback. The metadata suites preserve exact saved HTML and campaign base pins.

PG connections used only `/private/tmp/figflow-postgres-20261102-recovered`, port `55483`, role `figflow_test`, database `figflow_design_test`, with unique run-owned schemas and restricted search paths. Teardown drops only those owned schemas and queries absence; a final read-only namespace/identity receipt confirms cleanup. No public extension mutation or configured/customer content was used.

## Final source freeze for independent re-review

| Changed/new implementation or test | SHA-256 |
|---|---|
| `server/database/migrations/499_email_template_successor_projection.sql` | `94e9c1fe811e532dc3bc1d9602ebdfaafca1acbb2eff378346acb6502094ea93` |
| `server/utils/email-marketing/templates.ts` | `9c37a08adf16f7a8295c7b2b9bb7d805d40fc7080585cc846849df6aeb9348d6` |
| `test/integration/emailTemplateSuccessor.database.test.ts` | `f32c7a41fdd4a6b869a0a69a66f4ba99215abb91d26fef10b914a164f3db073e` |
| `test/unit/emailTemplatePublishedLabels.test.ts` | `7ac0f3e389fef987fc94fd2e2e0b365f03ff7ca73ed11b8e05f87342d7d655da` |

`source-freeze.json` repeats these four hashes; `final-freeze.json` additionally includes this report and the unchanged shared/server publication contracts and original contract unit. `*.diff` contains exact diffs against before-copies. `protected-migrations.json` confirms frozen 491–498 hashes. Original source/report copies and old verification evidence were reread/hash-checked unchanged at close. Recorded `couplings-before.json` and `couplings-after.json` match in this repair window, including the separate handoff input; this is a bounded snapshot, not a whole-workspace freeze.

The candidate is ready for independent source/PG re-review. Parent must independently accept this exact new 499 hash before configured application and its content-preservation receipt; the original `31cad088…` is superseded and must not be applied. Explicit publication target/version/override UI, real session checks, coherent integrated CI/raw+gzip budget, matching native package and actual same-T/R2 WASM/hosted acceptance remain open. No whole-08c, deployed or real-client completion is claimed.
