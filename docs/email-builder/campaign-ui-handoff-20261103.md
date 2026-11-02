# Campaign UI and owner-bound handoffs — 3 November 2026

Task `task_ae8c02dd94c2`, dispatch `ctx_16d42df69286`. Coordinator-provided application base: `c22a8b2295f4120b6c4bbb39c1fa93c318c420ea`, including reviewed backend fixes `0bd0c9e19`. Read-only HEAD at diff capture was the parent's native-only commit `6c7f60c5586f9d199f2192e25cf76811fd151532`. This report pins the owned dirty source, not a clean or independently released checkout.

Implemented slice 5 application/server source plus the coordinator-approved new-image default correction. No deployment, configured-database access, feature activation, actual-WASM run or hosted acceptance is claimed. The parent owns native40/package integration and the real Pages/private-Worker runtime. The concurrent 08c worker owns template-successor files/migration499; those files were not edited here.

## Implemented behavior

- Roundtrip `start` and `lookup` accept an explicit `owner:{kind:'template'|'campaign',id}`. Legacy `templateId` requests remain accepted, while mixed/unknown owner targets fail strict parsing. `open` retains exact `draftId` and UUID `expectedRevisionId`. Actor, mode, scope and source are resolved through persisted rows and fresh authentication.
- A campaign `DesignHandoff` names its campaign owner and omits `templateId`; template responses retain that compatibility field. Reads join the stored campaign owner, including historical frozen rows, and verify stored canonical kind. Generic draft GET also serves campaigns and keeps template ID compatibility for template owners.
- First Open snapshots the campaign's own current legacy row, performs checked conversion and inserts its handoff in one existing transaction. No current-template substitution, hidden template, second store or new renderer is used. An existing schema-0 campaign can also Open by its exact document baseline. A current structured campaign reopens its own exact saved head. A canonical revision operation cannot be reused for unrelated campaign Open/proposal commands; the deliberate atomic conversion/handoff receipt pair remains supported. Actor/operation locking precedes owner/document locks; the existing handoff transition lock remains in use. Inline transaction callbacks reuse the caller's transaction, with no nested transaction or automatic retry.
- Campaign proposal/Apply uses the common campaign projection and reviewed/staff writers, preserving subject/preheader and inherited base-template pin from the saved revision. Registered source assets/dependencies are verified before native admission and again after asynchronous rendering. A raw unregistered source URL cannot cause native image-byte requests. Scope, policy, locks, lineage, pins and manifests remain server-derived.
- Stale Apply refuses with both versions retained. An exactly committed terminal campaign result can be resumed/reconciled with fresh read access after freeze or creative-role downgrade; new mutations still need fresh creative access and draft status. Session/read revocation still refuses. The read-only exception requires a server-persisted campaign owner, matching original actor/operation/payload/mode/client, a known applied/cancelled state and fresh access to the persisted owner/client. Apply/cancel also require their matching transition receipt; original start/Open requires its exact global receipt. Request owner hints or changed payloads cannot select the exception. Open/proposed replays and every new operation retain creative/draft checks; HTTP release flags remain enforced before dispatch and legacy-template authority is unchanged. Real-PG before-write traps on campaign, document, revision, handoff and both receipt tables prove terminal start/Apply replay has zero row or receipt-trigger effects, including avoiding a conflict-only receipt INSERT. Foreign actor/client, changed owner/payload/mode, revoked read, pending replay and fresh-operation refusals are covered.
- Explicit `save-proposal-as-new-draft` reuses the existing strict action with a user-provided name and returns `recovery:{campaignId,documentId,revisionId}`. It creates one independent draft campaign with the original proposal/pins/policy, using existing campaign/revision/handoff receipts in the same transaction. It copies no recipients, sender, audience, status or approval. The original proposal remains durable. Recovery works within the existing 30-day retention window; expired retention refuses. Changed replay conflicts and a lost reply retains the original operation.
- `useEdmDesignRoundtrip` retains owner, exact payload and receipt readback for campaign saves, native operations, recovery and registered-image replacement. Ordinary canonical campaign body/subject/preheader saves use the actual Pages `PATCH /api/email/campaigns/:id` adapter, with `operation_id` and `expected_design_revision_id`, through `updateCampaign` and its single canonical writer. Non-content fields retain existing owners. No private-Worker campaign PATCH workaround was added.
- The composer loads a campaign's saved canonical source/brand/head and uses trusted server discovery to govern native entry. Pending staff changes save before opening; a clean campaign does not create a redundant save revision. Campaign query identity survives Open, Resume and reconciliation. Apply compares the complete local workspace baseline before and after the remote await and adds exactly one composer Undo for returned blocks. Newer local metadata/content remains intact on conflict. Explicit restart reads the current saved owner/head, while preserving the old proposal and refusing to discard newer local edits.
- New handoff controls are **New campaign name**, **Save as new campaign**, and **Restart from current draft**; existing **Keep current draft** remains explicit cancellation with durable proposal bytes retained. Recovery navigation occurs only after receipt/readback, including reconciliation of an unknown recovery reply.
- Campaign and template surfaces expose **Create from template/Create campaign**, using one Nuxt UI modal and the existing exact `POST /api/email/design/campaigns`. The dialog pins the published revision advertised by the catalog, displays that UUID, independently chooses destination client, and does not substitute a newer head on submit/retry. Unknown outcomes disable dismissal/fields and retain the exact operation, including across a later denied replay. This is not a historical-revision browser or the separate same-published-template successor UI.
- For an explicitly URL-granted canonical campaign Image, **Replace registered image** opens the existing picker in published-only mode. Staff send only `assetId`/block/head through `replace-published-image`; they do not receive structure/publisher controls. Existing registered bytes, grants and locks are rechecked by the original owner. Generic URL editing cannot substitute for this path.

The frontend-design skill was read before form changes. New fields use Nuxt UI v4 and `UFormField`, full-width controls, semantic colors and bounded scrolling. Existing dashboard typography/spacing were retained. Campaign brand/condition-management tools were not newly exposed; existing persisted metadata is preserved. Matching native runtime admission remains the parent's release requirement before exposure.

## Approved registered-image correction

The coordinator explicitly extended this task to the approved slice 2/PRD default: newly inserted registered Image blocks receive a URL replacement grant plus stable URL-field lineage (`imgu_<operationId>`), retaining the old alt-field identity. This affects newly created outputs only; no saved policy or historical receipt is rewritten.

A meaningful real-PG red proved the coupling before changing that default: generic template staff save accepted arbitrary HTTPS source changes on a manifest-backed, URL-granted saved Image. The coordinator then approved the minimal `designRevisions.ts` guard. Against the locked persisted schema-1 source, staff-only writes with an existing registered manifest refuse Image/Avatar `url` and applicable `darkSrc` changes through generic save. Existing `EDIT_FORBIDDEN` mapping is retained; there are no browser asset/URL-shape authority claims or bypass flags. Receipt replay stays ahead of this validation. Designer paths, schema-0 conversion and assetless legacy content retain their behavior.

Only after the raw-write guard went green was the new insertion grant enabled. Real-PG cases prove fresh ordinary-staff typed replacement, unchanged policy/lineage, raw/foreign/locked/revoked refusals with unchanged head/projection/receipt, and assetless legacy editing/replay. Existing alt-only provenance tests explicitly model historical immutable insertion outputs, so that original fallback remains tested separately from the new default.

## Verification

Node `24.18.0`, existing dependencies, cache-disabled Vitest and synthetic data only. Final evidence lives under `.verification/campaign-ui-handoff-20261103/`:

| Check | Result | Evidence |
|---|---|---|
| Real PostgreSQL: campaign handoff (17), backend, foundation, template revisions, library/history, designer and M06 | **174 passed, 7 files, zero skips** | `pg-final-authoritative.log`, `run-pg.sh` |
| Unit/app/component/REST/MCP/template/image and exact route inventories | **613 passed, 64 files, zero skips** | `unit-final-authoritative.log`, `run-unit.sh` |
| Owned TypeScript scope | **0 owned diagnostics**, 21 retained transitive diagnostics | `types.json`, `types.cjs`, `ambient.d.ts`, `types-final-authoritative.log` |
| Vue/TypeScript using existing Nuxt declarations | **0 owned diagnostics**; tool exits 2 for 70 unowned diagnostics | `vue-types-final-authoritative.log`, `vue-types-summary-final.json`, `vue-tsconfig.json` |
| ESLint across all 28 owned source/test files | **0 new errors/warnings**; 120 existing diagnostics matched only on unchanged HEAD lines | `lint-final-authoritative.log`, `lint-delta.json`, `lint_delta.py` |
| Unique-schema cleanup | **No remaining suite schemas** | `cleanup.json` |
| Protected parent files | Original two dirty harness files and isolated native candidate unchanged | `protected.json`, final hash manifest |

The TypeScript ambient file supplies normal Nuxt `$fetch`/h3 globals and a Vue-module declaration for the plain TS test checker. Actual SFC checking is separate. These are scoped checks, not a clean full-repository typecheck or a production build. ESLint is run on every owned file without a new rule/glob exclusion; retained baseline diagnostics are matched by exact rule/message/column on unchanged source lines. Exact gate/isolation inventory tests pass without adding a route exclusion or bypass registration.

The new component tests execute the real composer entry/Apply declarations with isolated I/O and exercise the real selection modal with Nuxt UI rendering stubs. They prove save-before-open, trusted/frozen entry refusal, exact head and route identity, one Undo, metadata drift before/during Apply, exact catalog revision and unknown-create replay. Authentication/role and storage boundaries are synthetic fixture authority, not employee-session or hosted R2 proof.

New campaign PG cases use real migrations 491–496 and 498 twice in a unique schema; the combined backend/M06 fixtures separately exercise 497/498 coexistence. Tests cover atomic conversion/handoff insertion, previously snapshotted Open, structured Apply/staff save/reopen, base pins, stale CAS/recovery, lost start reply, renderer/receipt/handoff refusal rollback, role/read revocation, freeze and historical results, source-asset refusal before byte requests, registered-image guards/defaults, and retention. SQL mocks are not used for these campaign cases.

Meaningful red evidence is retained in `contract-red.log`, `composable-red.log`, `asset-open-red.log`, `registered-image-guard-red.log`, `new-image-default-red.log`, `historical-read-red.log`, `exact-legacy-open-red.log` `namespace-red.log`, `historical-start-red.log` and `historical-zero-effects-red.log`. Targeted `-t` red/green investigations intentionally select individual cases; their filtered skips are not acceptance evidence. The final full matrices above have zero skips. Earlier fixture/compatibility failures remain in iteration logs: published-only source selection needed a real published fixture; a Vue reactive-proxy `structuredClone` in a test double was corrected; generic draft GET mocks were updated to the owner-aware read; the canonical identity read reuses the existing full-document query. No assertion was excluded to obtain the final results.

Reproduce from the actual repository root:

```sh
bash .verification/campaign-ui-handoff-20261103/run-unit.sh
bash .verification/campaign-ui-handoff-20261103/run-pg.sh
python3 .verification/campaign-ui-handoff-20261103/lint_delta.py
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  node .verification/campaign-ui-handoff-20261103/types.cjs
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  node node_modules/vue-tsc/bin/vue-tsc.js --noEmit --pretty false \
  -p .verification/campaign-ui-handoff-20261103/vue-tsconfig.json
```

The scripts pin the explicitly assigned disposable socket `/private/tmp/figflow-postgres-20261102-recovered`, port `55483`, user `figflow_test`, database `figflow_design_test`; they never read `.env` or a configured connection. Each PG suite drops and checks its exact owned schema. The final namespace audit is read-only; no other-owner cleanup occurred.

## Review and remaining gates

Reviewed each owned file's changes and the new helpers/tests, including persisted ownership and kind discrimination, lock order/CAS, transaction reuse, authority after asynchronous work, frozen receipts, asset provenance, original-operation retention, route identity, workspace baseline and Undo, Nuxt UI form rules and server import boundaries. `source.diff` records the complete owned diff; `diff-summary.json` records its read-only base. Existing large-file lint/type baselines remain explicit above.

No native source/patch/pins/gateway/workflow, migration, configured DB, provider/sender, environment configuration, parent ledger/queue, shared repair helper or frozen runtime evidence was edited. No installs, Git mutations, Cargo/native compilation, Pages production build, CI, browser, actual send or deployment was run. The parent's two dirty native-library harness paths are unchanged. New campaign-runtime preparer files are outside this ownership.

Parent gates remain: independent review; a coherent frozen **actual Pages campaign PATCH adapter plus private design Worker** (not synthetic draft PATCH); matching native40/bridge/UI package provenance; real `campaign-draft` content/designer actual-WASM A/B roundtrip, staff CTA/link/registered-image save, reload/reopen, stale Apply/new campaign C and revocation/frozen cases; hosted ordinary-employee/client acceptance; and release/public-page synchronization before activation. The private Worker alone cannot prove the Pages staff-save path. The separate 08c owner is adding same-template revision publication; this report does not claim that API or its UI is complete. Dependency hashes are recorded for review and must be reconsidered if that concurrent source changes.

## Owned source identity

Every changed/new source and test path is listed below. `hashes.json` additionally records the report, final evidence, unchanged migrations/protected files and relevant dependency snapshots.

| Source/test path | SHA-256 |
|---|---|
| `shared/emailRendering/designRoundtrip.ts` | `e8d5064ec17f4e55fff348704962484cff21c40cbb8bf441233276a1b6097fdf` |
| `shared/emailRendering/designActions.ts` | `e4c24a32f432810e366fee9d0533365ebe20442e1895573bc3a5bfda397c5832` |
| `server/utils/email-marketing/designHandoffs.ts` | `fb0d9ddd23219739fcfcc547d2daa2c9a4e267d55c00d27edcb8dadd75a13c45` |
| `server/utils/email-marketing/designReads.ts` | `6222af032295282d15a0e01457e5053210476569bdba378fdcb4487dedc9c23b` |
| `server/api/email/design/roundtrip.post.ts` | `d4ab195fae4e72cab1c6cba6c10d984dead40a1ae99f9e479c84932e34066c8c` |
| `server/api/email/design/designer.post.ts` | `c994b13b3edad711734ec0e1efce3494fe2ec89e76509c71286bc4a19007f0f2` |
| `server/api/email/design/drafts/[id].get.ts` | `a4221ac6a1722b1beb1f0b3192360d1d7c95947cfe4b464fcc32a9c1dbc21b61` |
| `app/composables/useEdmDesignRoundtrip.ts` | `300584ea0c2bbc9b858e019a46b5667356ee8abe347404273a01872b3375d705` |
| `app/composables/useEdmNativeLibrary.ts` | `1f2b2d30a02f3c996830afd6e6d757d1c91b7e0d45b1b3bba47b255c1da88830` |
| `app/composables/useEdmCampaignTemplateSelection.ts` | `cf5169148bad830f5711c47df9c9be5b5abec07ab32ef863ac0561c8d2f1ea5a` |
| `app/components/email/builder/EdmFlyhubBuilder.client.vue` | `a897ff8119aebb6b1fdc2b4b2035592fd0e1637defee0fecd5cd9f7642df7035` |
| `app/components/email/builder/EdmFigflowHandoff.client.vue` | `61b2b18a99eb97e8f4756d2f33f2ea3c8f007380b5a2c185adce13aa98c9fdeb` |
| `app/components/email/CampaignsPanel.vue` | `64a1a41e94e40c431d328720d02f1a7546176cec99fbb566709afd3b718f9fd0` |
| `app/components/email/TemplatesPanel.vue` | `7b50751b7eb75fa71c0c04d4540b23801838638c199a20b736e1f9828f13a9ed` |
| `app/components/email/CampaignTemplateCreateModal.vue` | `8c1bc30d563b1a6cebf7f3bc02efcbb792d1fb79929e7aa58cc646214eb1c924` |
| `test/unit/emailCampaignHandoffContract.test.ts` | `463abe4f316f0c2467899771d81e7ca36df825652532205aabe2e2c00595610b` |
| `test/app/edmCampaignRoundtrip.test.ts` | `9d2de7b82ea12d181bc637a50a297540fc5d4034a28d73f75514e64b8979812b` |
| `test/integration/emailCampaignHandoff.database.test.ts` | `f0639562b77eaae156b74f20d74cb0264862b33f50227a11970e3470d18471e1` |
| `app/components/email/builder/EdmImageLibraryPicker.vue` | `297e74a94ee9c20f3b783247bb05c94aeaea005062c9cb39c38324302238863d` |
| `test/components/figflowCampaignWorkspace.test.ts` | `19e00f0baec2ddb8c4bd61baf3a00cc7bccd6888d201d5c933f34bc77620da79` |
| `test/components/campaignTemplateSelection.test.ts` | `76b070b54a74b91ccd2fafef7e0a7e5c903f4a8e9c0fff13837c49b55e48dc54` |
| `test/unit/emailCampaignHandoffRoute.test.ts` | `c7774f63f9752e34002f9db201692fbd15a64ed899e04e85faee308a28a31c1e` |
| `server/utils/email-marketing/designRevisions.ts` | `fa94da1a1d7cd3ecc317079041ee74977bc5f6d089144de54a018bf3f904649c` |
| `shared/emailRendering/designModules.ts` | `242c38a0e35187e2fd34ec860a0f978fc8c2d85a5a6516bc89ca409238ee8f1f` |
| `test/unit/emailDesignModules.test.ts` | `d93f67f8015ccf93642df28d876f236dd5310cdbc60a727db0ed525f6c8d6bf5` |
| `test/unit/emailDesignModulePersistence.test.ts` | `103378a0165563d86bc04a1ecf9dc419c2e23ac0439d91bf627a3dd609263a5d` |
| `test/unit/emailNativeImageReplacement.test.ts` | `0cf85cee3d3e0275d6e0dd7c70fa0c357c466976323618828ce281aac8b40f26` |
| `test/unit/emailDesignDraftReadRoute.test.ts` | `5a77c7117f7dd73190f284b4eb11ac6d2dba7b6ad002394365dc92533bdda5c0` |
