# Campaign handoff review fixes — 3 November 2026

Task `task_a3c48fda040c`, dispatch `ctx_c3a4412c5275`. This is the bounded followup to `.verification/campaign-ui-handoff-independent-review-20261103.md` and the coordinator's decisions on its three P2 findings. It changes three implementation files and two existing test files, listed with final hashes below. It does not claim full feature, actual-WASM, hosted or release acceptance.

The previous freeze remains historical evidence: manifest `ed253fd6b2edc37de67c960f0093054155fc8b3a822cc9a631d6ed9e46f950d3`, report `068e29b4dcd7a19546b73c244d2df5bfcc33c080ef3f3a608286bb5557275e48`, and 174 PG / 613 regression tests. All 90 prior evidence/report files were hashed before this followup and remain byte-identical. The five current source/test paths intentionally supersede their previous source hashes; the old manifest was not rewritten. New evidence lives only in `.verification/campaign-ui-review-fixes-20261103/`.

## P2-1: enforce trusted campaign release policy

The existing content HTTP route still requires `FIGFLOW_EDM_DRAFT_SAVES_ENABLED`. It now also supplies its server-owned campaign release assertion, requiring the existing `FIGFLOW_EDM_DESIGNER_ENABLED` value. The transaction invokes that assertion for parsed campaign starts and for campaign ownership resolved from stored documents or handoffs, before conversion, initialization, proposal or other write effects. Confirmed recovery reads also enforce this assertion. Browser owner hints cannot relabel a stored campaign document/handoff.

No flag was added. Legacy template content mode retains its original draft-save gate. Campaign lookup remains readable while the designer flag is off, with trusted availability false. The designer route and emergency draft-save/replay gates were not loosened.

The new PG cases invoke the actual content HTTP adapter and actual business transaction. Off/on controls cover campaign start, an existing schema-0 document Open, a persisted handoff proposal/resume, new recovery and exact recovery replay. Off-state start leaves no document or projection pointer; off-state Open leaves the legacy baseline unchanged. A legacy template start still works under its original gate. Session, body transport and authority are synthetic fixture I/O; these are not deployed HTTP or employee-session proofs.

## P2-2: recovery is idempotent per original operation

One complete named-copy operation has one committed destination. Retrying its original operation and complete payload returns that same destination; changing its name, client, proposal, revision, mode or command under the same operation conflicts. A deliberately new operation with an explicit new name may create another independent draft from the same durable proposal. No proposal uniqueness registry, constraint or deduplication store was added.

The real-PG policy case now creates C, replays C, explicitly creates a differently named D with a new operation, replays D and verifies the original campaign's head is unchanged. The existing composable retains its exact original request after unknown replies or failed readback; reconciliation never silently invents an operation. Pending and busy UI behavior was not redesigned.

## P2-3: confirmed recovery is an immutable receipt read

After acquiring the existing actor/operation advisory lock and matching the complete global request text, recovery resolves both the global handoff receipt and canonical revision receipt before entering ordinary `readHandoff`, creative, retention, asset/dependency readiness or rendering paths. A dedicated joined read resolves the real source campaign/document/proposal and real destination campaign/document/recorded revision, including matching current owner/client identity and the original opening mode.

The read binds original actor, operation, full command/action payload, mode, scope/client, proposal ID/revision, distinct destination campaign, document and recorded revision. It verifies the recorded canonical payload, source metadata/pin and original canonical request digest using the existing exported `digestDesignRequest` owner. No foundation or template-publication helper was changed. Missing, mismatched, canonical-only or cross-command receipts fail closed; a known global receipt never falls through to create another copy.

Fresh READ is required on both persisted source and destination clients before and after digest verification. A confirmed result does not request creative authority, current asset/dependency readiness, retention eligibility or draft status; it returns the original recorded C/document/revision even when C has a newer head or is frozen. It executes no mutation, receipt insert or renderer/storage call. Recovery responses omit the redundant post-transaction designer preview; a newly created copy already renders through its canonical transaction.

New recovery operations retain designer authority, source-owner/document locking and draft status, proposal state, retention and registered-asset checks. Existing checks run again after asynchronous rendering before commit. Creation, baseline, canonical revision/projection and both receipts still share the same existing caller transaction. No nested transaction, automatic retry, sender or second storage owner was introduced.

The composable's recovery readback now verifies the fresh persisted destination owner/document without requiring that C remain at its old receipt head. It does not adopt, rewind or save C's newer content. Wrong owner/document or read failure retains the original pending request; a later successful reconciliation still sends that identical payload.

## Verification and failures

Node `24.18.0`, existing read-only dependencies and cache-disabled Vitest. Final results apply to the frozen source hashes below:

| Check | Result | Evidence |
|---|---|---|
| Real PG: campaign handoff, backend/foundation, template revisions, library/history, designer and M06 | **178 passed, 7 files, zero skips** | `pg-final.log`, `run-pg.sh` |
| Unit/app/component/REST/MCP/template/image and exact gate/isolation inventories | **616 passed, 64 files, zero skips** | `unit-final.log`, `run-unit.sh` |
| Five changed source/test files: ESLint and pre-followup delta | **0 errors/warnings; 0 retained baseline diagnostics** | `lint-final.log`, `lint-delta.json`, `lint_delta.py` |
| Scoped TS, including all changed TS paths and prior TS regression scope | **0 owned diagnostics; 21 transitive diagnostics** | `types-final.log`, `types.json`, `types.cjs`, `ambient.d.ts` |
| Read-only dependency snapshots | **8 unchanged before/after** | `dependencies-before.json`, `dependencies-after.json` |
| Previous evidence/report preservation | **90 files unchanged** | `previous-freeze-before.json`, final manifest |
| Disposable PG cleanup | **0 remaining suite schemas** | `cleanup.json` |

The campaign PG file now has 21 cases (previously 17), and the campaign composable file has six cases (previously three). New cases have no acceptance skips. Targeted red investigations intentionally filter unrelated cases and are not the final acceptance matrix.

Meaningful red evidence:

- `content-gate-red.log`: actual campaign start/Open resolved and converted while the designer flag was off.
- `recovery-red.log`: a committed recovery could not be read beyond retention; a known global receipt without its canonical effect fell through to creation.
- `recovery-new-frozen-red.log`: a new recovery operation accepted a frozen source; the new source-owner draft check refuses it.
- `recovery-readback-red.log`: the client left the original receipt pending when C's current head advanced.

The final PG recovery case commits a real registered-image copy, simulates a lost reply, advances C through the staff writer and freezes A and C. It then simulates elapsed retention in its disposable fixture by temporarily disabling/re-enabling the handoff identity trigger solely to age that synthetic row; no product migration or configured data is changed. Replay succeeds with an authority that throws on any creative access and renderer/storage adapters that throw on any call. `BEFORE INSERT OR UPDATE OR DELETE` traps on campaigns, documents, revisions, handoffs and both receipt tables prove zero write effects. It also refuses foreign actor, changed payload/client/revision/mode, revoked source read and revoked destination read. Existing terminal start/Apply traps remain, now with terminal cancel replay too.

Iteration failures remain explicit. The first HTTP fixture mocked the renderer constructor used by the local renderer fixture and returned null; `content-gate-fixture-iteration.log` records that setup error, corrected before capturing the meaningful gate red. A full-file run was 18/19 after gate fixes because an older no-hidden-template assertion assumed the entire schema started empty; it now compares before/after template counts, retaining its intended assertion. That premature 19/19 progress claim was corrected to the coordinator; the final completed matrix above is authoritative. Formatting/type cleanup logs are retained. No test or route inventory exclusion was added.

Final log files are byte-identical copies of the completed `*-candidate.log` runs; source was not edited after those passing runs. TS ambient declarations model existing Nuxt globals and the prior Vue module boundary. This is not a clean full-repository Nuxt typecheck, Vue compilation, native build or production build. No SFC/form was changed, so the form-design workflow and actual UI rendering were not reopened.

Reproduce from `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`:

```sh
bash .verification/campaign-ui-review-fixes-20261103/run-pg.sh
bash .verification/campaign-ui-review-fixes-20261103/run-unit.sh
python3 .verification/campaign-ui-review-fixes-20261103/lint_delta.py
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  node .verification/campaign-ui-review-fixes-20261103/types.cjs
```

The PG script pins `/private/tmp/figflow-postgres-20261102-recovered`, port `55483`, user `figflow_test`, database `figflow_design_test`. It never reads `.env` or configured connections. Tests create/drop unique owned schemas; the final audit only reads namespace state and performs no other-owner cleanup.

## Review, limits and next integration

Reviewed changed ownership, operation/payload/mode/client bindings, canonical digest equivalence, lock order and transaction reuse, read authority after awaits, no-readiness receipt recovery, exact pending payloads, current destination identity and all retained refusal/rollback tests. `source.diff` is the bounded delta against exact pre-followup copies under `before/`.

No 08c template/successor source, migration499, native source/patch/pins, workflows, public copy, parent harnesses/ledger, configured DB, provider or deployment configuration was edited. No installs, Git mutations, local Cargo/native/full Pages build, CI, browser, actual send or deployment occurred. Previous migrations and protected parent/native files remain unchanged in the final manifest.

The review's lower notes remain explicit: mixed manifest-backed documents retain their fail-closed generic URL guard; existing granted-image URL fields have no new picker hint; the panel has no retention-deadline display; missing client-side owner errors retain their existing message. These were not expanded into UI redesign.

Independent review of these exact bytes remains next. Matching native40/bridge/UI package, coherent actual Pages campaign PATCH plus private design Worker actual-WASM proof, hosted employee/client acceptance, 08c integration and release/public-page synchronization remain parent-owned gates. This followup does not activate a feature or satisfy those runtime gates.

## Final source identity

The final manifest records these five source/test hashes, this report hash, evidence hashes, unchanged dependencies/protected files and previous freeze preservation.

| Source/test path | SHA-256 |
|---|---|
| `server/utils/email-marketing/designHandoffs.ts` | `8f18ae98e492fc23eab6af4d0d2f695127a4845c934325af41b5d92899111fd0` |
| `server/api/email/design/roundtrip.post.ts` | `8a78551f4d6da04eb539093b9ee74762222f4a7cdc93d678e2700cf81c024717` |
| `test/integration/emailCampaignHandoff.database.test.ts` | `1e9a3b301a78355f2e035d5c3402fe5db1fb48ebcacb5904031172ae256c4931` |
| `app/composables/useEdmDesignRoundtrip.ts` | `a1d42c0e60b27e4e953c32c07459878e062921a4726d546758d0be7084445d08` |
| `test/app/edmCampaignRoundtrip.test.ts` | `df6cb7c71feee56c88851f3f5cf6598c12026414cdf6a6704fe047ff7566412e` |
