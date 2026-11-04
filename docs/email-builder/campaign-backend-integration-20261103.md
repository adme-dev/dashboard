# Campaign backend integration — 3 November 2026

Task `task_01d19cba38af`, dispatch `ctx_981993d5d53e`; coordinator-provided base `bc8a3ba961c117b4a27efc61cd486af237339bac`. This implements the remaining slice 3 library adapters, slice 4 backend and independent-review O-1. No flags, existing campaign rows or configured database were changed. This is source and disposable-fixture verification, not deployment, opt-in activation, slice 5 or native acceptance.

## Implemented boundaries

- `designModules`, `designHistory` and `designTemplates` resolve campaign draft owners through the persisted-owner projection adapter. Campaign mutations append a successor with the inherited base-template pin, HTML hash, current metadata, projection and existing receipt in one transaction. Frozen campaigns retain historical reads and committed receipt replay. Campaign publication creates a new template owner with canonical kind `template`; it does not promote or modify the campaign or its original template.
- The existing `replace-published-image` command accepts fresh content authority for ordinary staff, verifies the ID through the existing registered-asset owner, and retains policy, original URL grant, locks, lineage and provenance. The designer-only historical alt exception remains designer-only. All other structure and publication grants retain their existing owners. Generic campaign content saves refuse URL/dark-source changes and direct callers to registered-image replacement.
- `createCampaignFromTemplateRevision` reads an exact authorized template UUID revision and immutable dependency closure, verifies registered assets, and clones the complete canonical envelope into an independent campaign document. Existing `createCampaign`, baseline, structured revision, exact base pin, projection and receipt share the caller transaction. The actor/operation lock and receipt lookup precede any campaign insertion; a lost committed reply resolves the original campaign. No hidden template, draft store, sender or renderer was added.
- New exact `POST /api/email/design/campaigns` accepts `{version:1,command:'create-from-template',operationId,templateId,revisionId,clientId,campaign}`. Allowed campaign fields are `name`, `subject`, `preview_text`, `from_name`, `from_email`, `reply_to`, `filter_rules`. HTML, canonical JSON, actor, scope and policy replacement are rejected. The existing scoped session/access and origin protections apply; authorized selection does not require structural designer/publisher rights. Transport and private-worker registration add exactly this named POST.
- Existing legacy campaign POST still uses its original adapter. The common create owner refuses mutable-by-ID selection of a canonical template with `design_revision_required`; callers must use exact revision selection. Legacy templates/campaigns remain on their existing paths.
- Canonical content/subject/preheader updates in `updateCampaign`, REST PATCH and MCP `updateDraft` use the staff revision writer with stable operation and exact UUID head. REST fields are `operation_id` and `expected_design_revision_id`; the MCP UUID field is `expectedDesignRevisionId`, separate from its existing draft SHA. Non-content-only updates do not render. Mixed content/non-content updates commit or roll back together; changed mixed replay conflicts and committed replay never reapplies later metadata. A changed template ID requires a separately authorized template-update flow.
- MCP discovery includes canonical head UUIDs. Exact create uses paired `templateRevisionId` and `operationId`, inside the existing proposal/execution-ledger transaction. The ledger, draft SHA, scoped department authority, audience and sender owners are preserved. A committed-lost-reply ledger execution returns its original campaign, without a second design or campaign row.
- `preparedCampaignHtml` and `prepareCampaignHtmlForSend` validate canonical pointer/head/projection, dependencies, registered source assets and media referenced by the saved compiled HTML. They return the exact saved output before any mirroring, URL fetch or upload; unsupported assets yield actionable 409 `canonical_campaign_asset_correction_required`. Frozen output is never recompiled. Legacy mirroring remains unchanged. M06 review submission uses this readiness path both in preparation and under its existing transaction, including direct service callers, and cannot perform an HTML-only canonical write. Known 498 conflicts map to readable 409 responses without database details.
- `initializeCampaignOwnedDraft` is an internal, unrouted helper for the future first-Open caller. It snapshots the campaign's own current legacy row, verifies exact legacy drift, converts supported blocks and commits conversion plus receipt in that same caller transaction. It does not infer a historical template revision, so an unknown base pin remains null. No UI/handoff route activates this helper yet.

Foundation API need was recorded before altering it and approved by the coordinator: mixed canonical content/non-content updates must bind the entire strict campaign patch to the existing canonical revision receipt. `CampaignDesignWriteOptions.requestContext` is a server-only digest extension supplied by the strict patch adapter; the digest includes it only when present, preserving every old recipe when absent. It reuses the same transaction, receipt namespace, authority and renderer. A real-PG regression seeds the previous digest recipe and proves its receipt still replays without rendering.

## Verification and evidence

All commands used the existing Node `24.18.0`, existing read-only dependencies and local synthetic fixtures. No installs, Git mutations, application build, CI, browser, native packaging, provider requests, real sending or deployment were performed. Database work used only Unix socket `/private/tmp/figflow-postgres-20261102-recovered`, port `55483`, user `figflow_test`, database `figflow_design_test`, with unique owned schemas. The backend fixture executes actual migrations 491–498 twice, including 497; no migration source changed here.

Meaningful regressions captured before fixes:

- `.verification/campaign-backend-red.log`: canonical preparation with an unresolved pointer entered the legacy external-mirroring path instead of refusing before side effects.
- `.verification/campaign-backend-html-asset-red.log`: real-PG preparation accepted an external media reference present only in saved compiled output. Registered source inspection alone did not catch it; the bounded saved-output asset check now does.
- `.verification/campaign-backend-legacy-campaign-regressions.log`: four old REST schedule tests exposed an explicit-import incompatibility with the repository's Nuxt-global fixtures. Restoring the existing auto-import convention and legacy invocation shapes fixed all 37 legacy campaign cases, retained in the final matrix.

Final checks:

| Check | Result | Evidence |
|---|---|---|
| Backend real PG, foundation, template revisions, library/history, M06 | 142 tests in 5 files, zero failures/skips | `.verification/campaign-backend-pg-final-zero-skips.log` |
| Design/template unit suites, O-1, REST/MCP regressions, exact inventories/proxy, legacy campaign suites | 532 tests in 51 files, zero failures/skips | `.verification/campaign-backend-unit-final.log` |
| ESLint, all 21 owned TypeScript files | Exit 0, no diagnostics | `.verification/campaign-backend-lint-final.log` |
| Scoped TypeScript, repository `strict:false` convention | Zero owned diagnostics; 89 transitive diagnostics retained separately | `.verification/campaign-backend-types.json`, `.verification/campaign-backend-types.cjs`, `.verification/campaign-backend-ambient.d.ts` |
| Disposable-schema cleanup and server identity | No remaining owned suite schemas | `.verification/campaign-backend-cleanup.json` |
| Final source identity | SHA-256 for every owned source/test file and unchanged 497/498 | `.verification/campaign-backend-hashes.json` |

The TypeScript check is deliberately scoped, not a full Nuxt typecheck. Its tiny ambient file provides the original REST route's Nuxt h3 auto-import signatures; all unrelated transitive diagnostics remain in the JSON evidence. Existing Vite native-config warnings are retained in test logs. The preliminary final PG repeat accidentally omitted the separate M06 opt-in (`112 passed, 30 skipped` in `campaign-backend-pg-final.log`); it is not the acceptance run. The zero-skip log uses both explicit local opt-ins below.

New backend database cases prove A/B independence and exact R1 pins after both template R2 and module-head advancement; old R1 remains explicitly selectable; concurrent/lost-reply creation yields one campaign; rendering/receipt failures roll back creation and mixed updates; scope/strict-body/locked-policy refusals; original and extended digest replay; CAS; freeze/history/module/publication behavior; fresh authority revocation; registered staff image replacement; REST and MCP adapters/ledger; first conversion atomicity; canonical M06 submit and materialize/schedule refusal before external work. The fixture uses real PostgreSQL, real migration guards and synthetic renderer/storage assets. Authentication and role callbacks are mocked at their boundary, so these tests do not claim live session/R2/provider acceptance.

Exact route inventories include the new POST, with no new exclusions or classifier changes: isolation inventory 2,340 APIs / 1,279 mutations, with design additions 21 / mutations 15; gate inventory 1,729 sites / 302 ordinary-user-behavior entries. The one named fresh department read addition produces digest `32f9ebab4bc8d326fd8bd41618e27d5150f70164c2f9003fb9ab53c3765aef11`; removing only that exact named row reconstructs original digest `9f8c344829d51230c1147d080d246f5e054632a19461cea1988602fc7356487f`.

Commands (from repository root):

```sh
export PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH
FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-20261102-recovered \
EMAIL_REVIEW_PG_URL='postgresql:///figflow_design_test?host=/private/tmp/figflow-postgres-20261102-recovered&port=55483&user=figflow_test' \
node node_modules/vitest/vitest.mjs run \
  test/integration/emailCampaignBackend.database.test.ts \
  test/integration/emailCampaignDesign.database.test.ts \
  test/integration/emailDesignRevisions.database.test.ts \
  test/integration/emailDesignLibraryHistory.database.test.ts \
  test/unit/emailReviewWorkflowPostgres.test.ts --testTimeout=25000 --cache=false

node node_modules/vitest/vitest.mjs run test/unit/emailDesign*.test.ts \
  test/unit/emailCampaignCanonicalPreparation.test.ts test/unit/emailReviewWorkflow.test.ts \
  test/server/api/emailReviewRoutes.test.ts test/ai/departmentEmailInboxOperations.test.ts \
  test/ai/departmentEmailInboxTools.test.ts test/config/godModeIsolationInventory.test.ts \
  test/config/godModeGateInventory.test.ts test/server/api/emailCampaignPatchSchedule.test.ts \
  test/utils/emailCampaignSchedule.test.ts test/utils/emailCampaignDispatchSnapshot.test.ts \
  test/server/api/emailCampaignTargetScope.test.ts test/server/api/emailCampaignTestSendPreflight.test.ts \
  test/ai/tools/emailCampaigns.test.ts test/utils/emailCampaignFormat.test.ts --testTimeout=25000 --cache=false

node .verification/campaign-backend-types.cjs
# ESLint used node_modules/eslint/bin/eslint.js and every exact path in:
# .verification/campaign-backend-files.json
```

## Review and remaining integration

Reviewed the 21 owned source/test files and this report, including persisted ownership, actor/operation → owner → document locking, exact CAS, authority after async work, provenance, registered assets, replay after freeze, transaction reuse, server import aliases and narrow route admission. No shared policy, UI/builder/Handoff/native/relay/pins, 08a acceptance helper, other worker PG/helper, sendability/sender engine or 497/498 migration was changed. The original legacy campaign POST adapter is unchanged; its canonical guard is centralized in `createCampaign`.

Slice 5 still owns trusted campaign availability, campaign UI/native kind admission, owner-bound handoff Apply/recovery, and atomic first-Open handoff wiring. The internal conversion helper must stay inside that caller's existing transaction; do not snapshot then convert in separate commits. Explicit update-from-template/conflict UI is later work. Parent release owners still own private-worker packaging/admission/size proof, hosted sessions/assets, actual native runtime, public feature sync when exposure ships, inbox/employee acceptance and eventual deployment. Frozen 956/9f runtime/native artifacts were untouched. No opt-in, feature activation or full 08b completion is claimed.

## Final source hashes

The following table is generated from the final reviewed files; the machine-readable manifest additionally hashes this report and verification logs.

| File | SHA-256 |
|---|---|
| `server/utils/email-marketing/designCampaigns.ts` | `d412fe277e60a81b23ce096905094b961d0bcf8b62f0112f01f515581da486ed` |
| `server/utils/email-marketing/designAssets.ts` | `a373e8175abf8de1ca02fb1ddb4f5734c9cf00265d92ed6e83d3b39ed79d950e` |
| `server/utils/email-marketing/designModules.ts` | `e246d425a331c587573c747886b72428784825d45128355fbb381be5a7abab24` |
| `server/utils/email-marketing/designHistory.ts` | `eeba3440bf9050ed8b8af335cef6d3496b8291ebec914322f06ef093a05f8ce0` |
| `server/utils/email-marketing/designTemplates.ts` | `8bb956ea4808eb967c92fe9047294ab1c3f20f5dc72dd96fabc8e465fc1045c7` |
| `server/utils/email-marketing/designConflict.ts` | `35106f2ef07d5f2e025b6cc8b88a73b107922807822497c2172966cd62ecbae2` |
| `server/utils/email-marketing/campaigns.ts` | `9d768b1f4280d157c60a96e65217bd848fbd42fdd33ae59b2aeee61df7440a4e` |
| `server/utils/email-marketing/review.ts` | `980ecda70db98c712672af2bed85ffdd940af27d03d9a7ed40ca64dc56c0138f` |
| `server/utils/email-marketing/designLibraryHttp.ts` | `54d062431c96f9f98cbb25601f65e1caa75f71a664e2e7f011aba7a9b650b9a6` |
| `server/utils/email-marketing/designRevisions.ts` | `d5b0eba80cdecc8e619f8307db4f4bd8c9a57a9dee96ad8cc9a241b0f3ff3d6a` |
| `server/utils/email-marketing/designTransport.ts` | `dfff1a6a7d02479d0334bbca1ca258c9cec8bf8988c36d4a78dd12c18afb8bd8` |
| `server/api/email/design/campaigns.post.ts` | `6b06916d3081cf531636c06357376ce608f9708217697bb01ddb129d82df9791` |
| `server/api/email/campaigns/[id].patch.ts` | `30ff414b66a00077da74bcd0ea7737de6c09babd57c35746b20ccc7971396de5` |
| `server/utils/ai/marketing/departmentEmailSchemas.ts` | `01ab8029fdaaa4b79adaffcfb4b704f2c9be63ad510180c2f4c713efef5ae2f7` |
| `server/utils/ai/marketing/departmentEmailOperations.ts` | `a10ac3a13d59dc1e6f9de9836020bd77db739cae4dd69495d1d4da6157c3fd38` |
| `workers/email-design/nitro.config.ts` | `e44a3e86a03f945b3dc5ab216df937a880414860c697ddb222ca43f3cdc39c94` |
| `test/integration/emailCampaignBackend.database.test.ts` | `e5d9df02d93d738eb5a7763965e792ca78a78f60990cde1a5665bd8da4e7db0c` |
| `test/unit/emailCampaignCanonicalPreparation.test.ts` | `a156b9eec63177260f2e21da30545e0f8d226d2df7d4c13bd41ce2abfc0548e4` |
| `test/unit/emailDesignProxy.test.ts` | `0ecfe650ec4f6f6ebf393ba3257b276794ca875f53261b27c5a60c7c937401f1` |
| `test/config/godModeIsolationInventory.test.ts` | `bb2b0dd4f842e6c32a94bf05bd88ccb39b07b049a0992eebfc3b83a261bd2791` |
| `test/config/godModeGateInventory.test.ts` | `c303f97013bda8dd891791d76ee5b520183b63150c25c900e51a8e0ffa7c7bac` |

Unchanged migration 497: `d5832157b84b475ba6f7ec546e35f8204d151c65788d7d6d834f8c5133f9ef4d`; unchanged migration 498: `e8fdd367968efe31eba4efb9af8bc4ecb381e16769efdbe12f88fedaca08e1fb`.


## Final follow-up: independent-review fixes (3 November 2026)

Task `task_c8dc42e4b451`, dispatch `ctx_f55f830b26aa`; coordinator-confirmed root HEAD `9f09d3f87` with the prior dirty backend freeze intact. Read the full `.verification/campaign-backend-independent-review-20261103.md` and verified findings against source before editing. This section supersedes the affected initial behavior and initial hashes above; initial evidence, original manifests/logs, migrations 497/498 and frozen 956/9f/24-400-94 runtime/native evidence remain unchanged. The new backend is still dirty and unreleased; the configured additive 498 migration does not establish that these new MCP branches are live. No Git/configured database/CI/build/package/browser/provider/email/install/deploy action was taken.

### Corrected boundaries

| Finding | Bounded correction | Acceptance evidence |
|---|---|---|
| P1 — MCP release admission | Existing fresh department/tenant authority remains first. Canonical create requires effective `FIGFLOW_EDM_DRAFT_SAVES_ENABLED` and `FIGFLOW_EDM_LIBRARY_ENABLED`; update requires saves only. Existing request binding → primitive CF cache → local process fallback precedence is reused; explicit string/boolean false wins over true fallbacks. Before ledger replay/claim, updates derive opt-in from the stored scoped campaign via `to_jsonb(c)` (pre-498 safe), never UUID hints; the locked update rechecks it. Off gates return `not_found` and create no campaign, canonical revision, projection or design receipt effect. Existing wrappers/audits are retained, not bypassed to eliminate every DB read. | Actual-flags unit cases and real-PG absent/false/cache-true create/update/replay refusals; saves-on/library-off permits canonical update; legacy MCP create/update/replay remains available with both flags off even when callers supply UUID hints; fresh role revocation remains forbidden. |
| P2-1 — committed selection replay | Advisory lock and operation namespace precede receipt lookup and exact digest comparison. A matched receipt resolves its original campaign without new-source asset/dependency/publication readiness or rendering. `readCampaignTemplateRevisionScope` derives the original source scope from its immutable revision/document; replay freshly checks that source read plus destination/campaign read and write. The MCP ledger replay admission also reauthorizes this original source scope. New insert retains full source/dependency/registered-byte checks. | Lost-reply service and MCP ledger recovery; replay with withdrawn source or unavailable registered bytes; changed replay payload conflicts; independent agency-source read revocation and destination write revocation refuse without duplicate creation. |
| P2-2 — publication eligibility | New selection locks/reads the existing `edm_templates` owner and requires `template_kind='template'`. The exact requested schema-1 revision is read through the existing immutable library owner; no current-head requirement, silent latest substitution, new publication registry or schema. Shared template/draft-copy behavior is unchanged. | Working draft selection refuses; the fixture now publishes actual owners through `executeDesignTemplates`. Existing T/R1 → independent A/B pins/locks/assets and historical R1 selection after published R2 plus module-head advancement still pass. |
| P2-4 — actionable versus transient readiness | Known `ASSET_NOT_READY`, `SCOPE_MISMATCH`, `NOT_FOUND` and pointer/projection mismatches remain actionable correction 409s. `ASSET_STORAGE_UNAVAILABLE` is 503. Unknown DB/R2/transport errors remain unknown/transient rather than telling staff to replace images. | Unit DB/transport identity and storage mapping tests; real registered-image PG fixture covers missing storage 503, unchanged timeout error identity, malformed bytes 409 and no external fetch/upload or HTML rewrite. |
| P2-5 — storage outside review locks | `prepareCanonicalCampaignHtml` reuses the existing storage/context/readiness owner to return a server-derived result before `runReviewCommand` opens its transaction, including direct service calls with no optional `prepareSubmission`. The retained result binds owner/client/document/revision, exact HTML and canonical source digest, plus the DB-derived review digest. Locked submit uses `recheckCanonicalCampaignReadiness` for DB-only pointer/head/body/digest/current-projection comparison and fresh authority. No R2 reads, renderer/mirror/upload/fetch under those review locks; no browser attestation, token or bypass. | Every synthetic storage method asserts outside-transaction execution and preflight reads exist before transaction entry. A real concurrent canonical save between preflight and locked submit yields `review_content_changed`; the new head is preserved and no review state/receipt commits. Existing M06, template and legacy preparation/replay regressions pass. |

Migration 495 **forbids unpublishing/deleting a published registered asset**. The real-PG replay fixture explicitly proves the immutable unpublication refusal, then tests unavailable registered bytes and source withdrawal through an owner-kind transition that existing projection guards permit. It does not disable a trigger or fabricate an impossible mutable publication state. The database-only receipt path no longer examines those readiness conditions; missing/deleted source history remains constrained by the existing RESTRICT/immutable history owners. This is bounded failure/recovery evidence, not an archival product feature.

O-1 remains intact: canonical send/review preparation returns the exact stored HTML and refuses before the legacy mirror/fetch/upload owner. The named 498 raw constraints still map to readable 409s; no HTML-only canonical UPDATE was added. No authority role, publisher/designer grant, MCP ledger, schema, sender or finance engine was widened or replaced. New source eligibility is protected by the existing owner row, while immutable historical R1 remains valid after R2.

### Red → green and final executed checks

Before production changes, `red-unit.log` records **8 failures**: five admission/precedence cases and three readiness classification cases. `red-pg.log` records five intended production failures (working draft selection, withdrawn-source replay, MCP gate/replay and the two review-preflight cases), plus two fixture issues: attempted unpublication was correctly rejected by 495, and publishing a module from the newly published default template correctly refused `TEMPLATE_DRAFT_REQUIRED`. Those fixtures now preserve immutable publication and use the separate working draft owner for module authoring. Initial content-correction fixtures also conflated absent storage with invalid content; they now provide a configured synthetic storage boundary so the 409 and 503 cases are distinct. No original acceptance fixture, role rule, assertion or migration was weakened.

The final runs use Node **24.18.0**, existing read-only dependencies, cache disabled and one Vitest worker. Both PG opt-ins were set explicitly; final raw counts are checked in `checks.json`:

| Final check | Raw result | Evidence under `.verification/campaign-backend-review-fixes/` |
|---|---|---|
| Real PG backend/foundation/revisions/library-history/M06 | **151 passed / 151 total, 5 files, 0 failed, 0 skipped** (prior 142 + 9 new PG cases) | `pg-final.log` |
| Design/template/readiness/REST/MCP/inventory/legacy regressions | **542 passed / 542 total, 52 files, 0 failed, 0 skipped** (prior 532 + 10) | `regression-final.log` |
| Scoped ESLint | **8 files, exit 0, no diagnostics** | `lint-final.log` |
| Scoped TypeScript | **22 owned/backend files, 0 owned diagnostics; 89 existing transitive diagnostics** | `types.cjs`, `types.json`, `types.log` (uses unchanged prior ambient fixture; not a full Nuxt check) |
| Disposable cleanup / server identity | Assigned Unix socket/port/user/database confirmed; **no remaining suite schemas** | `cleanup.json` |
| Exact gate inventory | **1 named lexical row added**, classifier/registrations unchanged; 1,730 total rows, governance class 1,637; every other count unchanged | `inventory.json`, passing inventory tests |

Gate digest is `72c5d301965562d2787ab7b975f610efed91fb48db89270845756898615cc584`. Removing only the exact new MCP release row reconstructs prior digest `32f9ebab4bc8d326fd8bd41618e27d5150f70164c2f9003fb9ab53c3765aef11`; removing that and the already-reviewed agency source-read row reconstructs `9f8c344829d51230c1147d080d246f5e054632a19461cea1988602fc7356487f`. There are no new exclusions or bypass registrations. Existing Vite config warnings remain in logs.

Exact commands are recorded in `commands.sh`; this is an evidence file, not a new CI or runtime script. Each PG suite created/dropped only its own unique schema on `/private/tmp/figflow-postgres-20261102-recovered:55483`, user `figflow_test`, database `figflow_design_test`. The subsequent namespace audit was read-only; no public extension or other-owner cleanup was performed. The earlier frozen logs/manifests remain untouched. No SFC checks apply because this follow-up changes no UI/component file.

### Final source freeze and remaining work

Reread the owned source and focused tests, checking server aliases, stored actor/owner/scope, replay before readiness, immutable publication/pins, lock order, no storage in locked review, exact pending identities and O-1 legacy isolation. Only the following eight source/test/inventory files, this backend report and the new evidence folder changed in this follow-up. `source-freeze.json` records SHA-256 and comparison to the independent review's initial manifest; every other initial manifest file, including 497/498, remains byte-identical.

| File | Final SHA-256 |
|---|---|
| `server/utils/ai/marketing/departmentEmailOperations.ts` | `b5a024ec4ec0ab2fa5fbc16f810231554166da9e028480bf2b13e8b94a7cbd85` |
| `server/utils/email-marketing/designCampaigns.ts` | `8c75d1f02baa546445bb8966a1b2e122dc50ae44a84a58edbdb58acfbf652462` |
| `server/utils/email-marketing/campaigns.ts` | `e20acad627f93a4747407b5e3a92897a9da70cb04963a47a2938b3d7ab019bbb` |
| `server/utils/email-marketing/review.ts` | `10e8720cc68310db2aaec47be6b7735ff0d5229f897dda3fba58839b534ee64b` |
| `test/ai/departmentEmailCanonicalGates.test.ts` | `23c4b592e367aa1c98d80d9a9e9b03bf9c1f1a85b02b751958cafe83303ab9fd` |
| `test/integration/emailCampaignBackend.database.test.ts` | `93f5428a47e0fb267ad34bf0b7dbdd00ed4dde9a06efa954f3ff973a61e2a19c` |
| `test/unit/emailCampaignCanonicalPreparation.test.ts` | `381794b71d5b57f68cac5765eab334d046e7e70d68bc611f8b8b5b4d37aff54b` |
| `test/config/godModeGateInventory.test.ts` | `5e8ab2df4d48561bfe3e176e26e4086a7a22962593f3efd48917c2f8c47cbd4a` |

**This source freeze is final.** Parent still owns independent rereview/integration and P2-3's exact CI bundle-size/guard measurement; no preemptive service offload, parallel engine or limit change was made. Campaign UI, first-Open/Handoff wiring, isolated native admission, pins/package/runtime, hosted/R2/session/employee acceptance, public feature synchronization and release remain separately owned and unproven by these local tests. This report closes the bounded backend review fixes, not whole campaign/native/hosted completion.
