# Native library bridge — 2 November 2026

**08a source implementation and scoped review fixes complete; native Linux/package and actual-WASM08a acceptance remain pending.** Initial work used coordinator-confirmed `000bc2fa1`; the 3 November follow-up uses coordinator-confirmed `b9eb6939` with prior 08a source intact and merged M06 left untouched. No campaign08b/M06 changes by this worker. Parent owns tracked native patch/pins, Git, Linux/package CI, configured database, release and actual-WASM acceptance. No commit, install, shared dependency change, configured database/provider/email/deploy/CI action, live browser or native/product build was performed.

Design: reuse the email workspace's sans typography and semantic default/elevated/muted/primary palette; the canvas remains the dominant surface, with a bounded library panel and explicit selection, review, save and publication actions. All controls use Nuxt UI/UFormField and container-aware spacing. Read the installed official frontend-design skill at `/Users/paulgiurin/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` (the AGENTS-named Codex path is absent).

Preflight: native selection and library actions share the current handoff/document/head; image insertion/replacement share existing registered bytes, scope, descriptors and receipts. No new library/storage/sending owner. Context is a read hint, not write authority.

Ruling: use the current designer-authorized library boundary for 08a image replacement, without widening ordinary staff roles or historical URL grants. The separately scoped campaign/staff bridge must expose its permitted content replacement path with fresh authority; a working designer picker does not establish that acceptance.

Ruling: execute only bounded Node checks after this bounded implementation; no local native build, Git operations, configured database or live browser. New native test source is prepared for parent-owned Linux execution, not locally verified Rust. Existing accepted actual-WASM3/3 fixtures remain untouched.

## Implemented path

- Native **`edm_designer_context`** returns the exact operation identity/log, actual mapped selected block IDs and optional insertion target; it does not save, publish, reset history or invent a root selection. Bridge checks empty params, instance, document, exact revision and idle editor. Read replies do not consume mutation receipts. The relay exposes only `context` in the bound designer channel/source/origin and rejects tab switches, foreign operation identity, malformed context and generic command payloads.
- `parseNativeLibraryContext` validates hints against the captured canonical operation result. Multi-selection is ordered by **canonical reading order**, including columns, rather than the native BTreeSet's lexical order. Module extraction repeats that ordering server-side; duplicate and ancestor/descendant overlap selections are explicitly refused. Operation logs and original request/receipt payloads are not normalized or rebound.
- Library, Images, Save selected section and Publish template controls sit beside the actual native canvas, with publication buttons limited by trusted publisher discovery. Capture freezes canvas interaction, renders scriptless desktop/mobile canonical review and leaves the iframe/work intact on picker cancellation. Merely opening a picker writes nothing.
- Captured design edits go through the existing durable proposal, rendered review and explicit **Apply and save** before library actions. A no-op is explicitly confirmed and terminalized through propose/cancel without a new draft revision. No `canonicalBlocked` bypass. The existing library panel uses explicit native roots/target (including column zero), immutable version preview, override/update/detach review and registered image picker.
- Existing library receipts/readback precede reopening **the same template owner and document at the exact confirmed revision**, with fresh capabilities and a new handoff. The native history restarts from the saved baseline; users select again in that fresh native document for the next library action. Unknown library/proposal/open replies retain the original payload/baseline and block competing actions; reconciliation uses the original receipt. Publication stays a separate action and does not promote/mutate the source draft.
- Strict **`replace-published-image`** accepts only operation/draft/head/block/asset IDs. The existing server verifies registered ownership, actual bytes/digest/MIME/dimensions and canonical URL, then replaces only the selected standalone Image URL and asset declarations. Block/node/field identity, alt/link/layout/policy and old asset references survive. Pinned instances, inherited locks, protected props, foreign/unpublished/changed assets, stale heads and revoked authority fail closed. Scope/identity/CAS/receipt and private rendering owners are unchanged; no new route, migration or asset store.
- The native library state belongs to the existing `useEdmDesignRoundtrip` owner, with a small `useEdmNativeLibrary` fence. This preserves the extracted hotfix recovery functions' self-contained dependency path; original hotfix and accepted actual-WASM fixtures were not edited.

## Exact changed source / ownership

Tracked product files:

- `app/components/email/builder/EdmFigflowHandoff.client.vue`
- `app/components/email/builder/EdmDesignLibraryPanel.vue`
- `app/components/email/builder/EdmFlyhubBuilder.client.vue`
- `app/composables/useEdmDesignRoundtrip.ts`
- `app/composables/useEdmNativeLibrary.ts` (new)
- `shared/emailRendering/designModules.ts`
- `server/utils/email-marketing/designModules.ts`
- `workers/craft-editors/figflow-edm-relay.mjs`

`EdmImageLibraryPicker`, `designAssets`, campaign/template owner files, runtime flags/routes/migrations, inventories and tracked native patch/pins/scripts were not changed. Existing image registration/publication/readback services remain the authority.

**Final ignored native source freeze** under `.verification/figflow-native-source-20261102/work/`:

| File | Final SHA-256 | Expected named test count |
|---|---|---|
| `crates/engine/src/cmd/edm.rs` | `530a33cf1d2b5e7a7c102ec9fa257a720ef18592f54ebe5bd62728c64f2f2d47` | 32 |
| `crates/ui-egui/src/browser_bridge.rs` | `f6c14f7e9442fbac5ac4a82def700fdf3c554c7b96d2e059565dfc3a218d457d` | 9 |

`crates/ui-egui/src/lib.rs` and `apps/figcraft-web/src/bridge_web.rs` remain unchanged; their existing transport/drain supports this bounded read. UI expected count stays **8**. The final engine hash supersedes both `95754d10…` and the independently reviewed `957a97f0…` freezes: the latter had a second designer import into the same Session. The 3 November fix isolates the nested Session and strengthens rejection/read-only assertions; production native context is unchanged. Manifest: `.verification/native-library-native-freeze.json`.

New native test names (prepared source, **not executed locally**):

- `edm_designer_context_maps_selection_without_saving_or_inventing_target` — also checks nested column 0 and omitted root column.
- `edm_designer_context_rejects_unmapped_and_unlogged_selection` — includes a deleted/stale node selection.
- `browser_bridge_designer_context_requires_exact_revision_and_empty_params` — context discovery, revision and parameter denial, no mutation receipt allocation.

## Initial local verification (2 November; latest follow-up below)

Node **24.18.0**, existing dependencies, cache disabled and one Vitest worker. Final combined run: **16 files, 100 passed, 0 failed, 0 skipped**, exit 0; `.verification/native-library-regression.log`. Command:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-20261102-recovered \
pnpm exec vitest run \
  test/unit/emailNativeLibrary.test.ts test/unit/emailNativeImageReplacement.test.ts \
  test/app/edmNativeLibrary.test.ts test/app/edmNativeLibraryRecovery.test.ts \
  test/components/figflowNativeLibrary.test.ts test/components/figflowNativeLibraryPanel.test.ts \
  test/unit/emailDesignModules.test.ts test/unit/emailDesignModulePersistence.test.ts \
  test/unit/emailDesignAssets.test.ts test/components/edmFigflowHandoff.test.ts \
  test/components/emailDesignLibraryHistoryPanels.test.ts \
  test/components/emailDesignLibraryComposerRecovery.test.ts test/app/edmDesignRoundtrip.test.ts \
  test/components/figflowLiveSaveWarning.test.ts test/components/figflowDraftDialog.test.ts \
  test/integration/emailNativeImageReplacement.database.test.ts --cache=false --maxWorkers=1
```

The **3 new real PostgreSQL cases** exercise published registered image insertion/replacement, head/projection/receipt atomicity, real committed lost reply, exactly one concurrent same-head winner and revocation during render rollback. A unique run-owned schema on the assigned disposable cluster was dropped and absence checked; `.verification/native-library-pg-cleanup.json` records `dropped:true`. Authority callbacks/storage are synthetic; this is not employee HTTP/RBAC, Neon transport or R2 delivery proof.

The remaining new tests cover context/selection/overlap/canonical order, protected/pinned image denial, strict ID-only contracts, frame source/channel handling, cancelled reads/no iframe replacement/no mutation, explicit review/save, target column 0, no-target insertion refusal, and payload-bound replacement/reopen recovery. Existing module extraction/update/receipt and hotfix recovery tests pass unchanged. An initial run exposed a missing Nuxt `useState` stand-in in the new test and an extracted recovery dependency issue; both were corrected, not hidden by weakening assertions.

- Relay: **21/21 passed**, 0 skipped; `node --test workers/craft-editors/figflow-edm-relay.test.mjs`, `.verification/native-library-relay.log`. `node --check` also passes.
- Scoped ESLint: exit 0, no diagnostics across all 16 owned TS/Vue source/test/helper files; `.verification/native-library-lint.log`.
- Complete script/template compilation for all **3 changed Vue SFCs** passes; `.verification/native-library-sfc.json`.
- Scoped TypeScript: **0 owned diagnostics**, repository non-strict convention with a typed `$fetch` and `.vue` ambient fixture; **10 transitive diagnostics outside owned files**. This is not full Nuxt/vue-tsc; `.verification/native-library-types.json`.
- Vitest retains the existing Vite `__dirname` / future native-config-loader warning; no check failed on it. No full repository build/test/typecheck claim.

## Parent acceptance handoff / remaining gates

`test/helpers/figflowNativeLibraryAcceptance.ts` prepares the visible-control journey for an isolated full-builder page with synthetic Workerd/PG/storage: observe and hash the actual served new WASM, canvas selection → library read/cancel with unchanged draft → selected-section publication with unchanged source → exact-version insertion twice → verified image replacement → same-owner/pins/locks/old-reference readback. It uses pointer/UI operations and read-only fixture readback, with no internal Session/command mutation shortcut. **The driver has not run.** Parent must supply the full current builder/renderer/Worker fixture, calibrated real canvas positions, intercepted matching package and fatal unknown-network/page-error handling; a partial component stand-in or internal API edit cannot establish that acceptance.

1. Regenerate/review tracked native patch/pins from the **final** manifest; run exact **32 engine / 9 bridge / 8 UI** Linux tests and package provenance, then matching-package actual-WASM08a acceptance. Old accepted 3/3 proves its earlier core scope, not this new context/UI.
2. Exercise captured nonempty native edits → compiled review → explicit Apply before library write; current-head conflict/revoked scope/lost reply retain both versions and original action. Check public image delivery and the full existing module update/conflict/cancel/detach path through the same UI, not merely seeded retention. Parent independent review remains required; this worker performed author review only.
3. Ordinary staff permitted image replacement and campaign08b still require their separately owned authority/UI work; no role was widened here. Native-only opaque source, imported HTML conversion/full-template fidelity, hosted employee acceptance, real clients, M06 and release remain separate gates. No feature activation or production-readiness claim is made.


## Independent-review corrections — 3 November 2026

Read `.verification/native-library-independent-review-20261102.md`; both P1 findings were reproduced/confirmed. The original author tests missed these permission cases, so the initial passing suite did not prove the replacement boundary safe.

**P1-1:** the nested-column native fixture now creates a fresh `nested_session`, preserving column zero, selected ID and unchanged snapshot assertions. The page selection asserts `unmapped selection`, the unlogged edit asserts `unsupported native change`, and the deleted selection follows a logged remove of the last `empty-image` block: it asserts the old native node is absent, snapshot still succeeds, context reports `selection missing`, and snapshot remains unchanged. Removing the last block avoids deterministic rebuild ID reuse. Test names/counts remain exactly **32 engine / 9 bridge / 8 UI**, source counts only; no Cargo/native execution occurred. The final engine hash above and `.verification/native-library-native-freeze.json` are the parent patch/pin regeneration inputs; already regenerated parent pins predate this freeze.

**P1-2:** `designDesigner.ts` exports `assertLibraryImageReplaceable`, which calls the existing canonical `assertEditable` / `ownLocked` / inherited `lockedStylePath` rules. The URL exception is limited to the selected proven-library Image; it never applies to ancestors or ordinary designer mutations. All present alt/link fields still require their existing grants. An explicit existing URL grant permits legacy content replacement; an alt grant by itself does not. Unknown data, legal values, protected props, own-locked ancestors, block/URL/mobile/inherited style locks and pinned module subtrees remain forbidden.

The server-only `hasLibraryImageInsertion` proves the alt-only exception using existing immutable metadata, with no new marker/schema/role/grant:

1. Require the exact existing `img_<operation UUID>` block and `imgn_…` / `imgf_…` lineage in the persisted current source.
2. Read an immutable insertion revision joined to its immutable receipt by the same document/operation; require the original exact lineage and scope.
3. Derive the original registered asset, insertion parent, column and index from that immutable result; reconstruct the exact strict `insert-published-image` request with the original parent revision. Its `email-modules-v1` digest must equal the immutable receipt hash. Shape or registered-asset membership alone never proves this.
4. Verify original and current asset descriptors, canonical URLs, bytes and scope through existing `readPublishedEmailAsset`; match descriptors in each canonical design. Only then pass a server-internal boolean to the canonical predicate. The client request remains strict IDs only and cannot set this boolean.

Missing/nonmatching receipt/lineage fails closed; a remapped/copied/detached module image without this same-document insertion proof needs its existing explicit URL content grant. This limitation deliberately avoids guessing authoring permission from appearance or adding competing provenance/storage engines. Publication/readback, private compilation, post-render authority, atomic head/projection/receipt and replay authority remain the existing owners. Old assets, policy, field/block/node IDs and staff URL grants are retained.

**P2:** before any native reopen attempt, `requireReopen()` clears selected IDs/insertion target and marks the library as requiring reopen while retaining its saved owner/revision. The panel and library executor block further writes until the same-document reopen succeeds; Return to design remains the retry. Both definite 409 and unknown transport cases exercise the actual builder reopen/executor functions with the real composable. Unknown replies retain and reconcile the original open operation/payload; no pending recovery state was discarded.

### Latest executed checks

- Node **24.18.0**: the same 16-file command above now passes **119/119**, 0 failed/skipped, exit 0; `.verification/native-library-review-regression.log`.
- Canonical designer/brand regressions: **61/61 across 7 files**, 0 failed/skipped, exit 0: `emailDesignDesigner`, `emailDesignDesignerPersistence`, `emailDesignDesignerRoute`, `emailDesignBrand`, `emailDesignBrandPersistence`, `emailDesignBrandHttp` unit files and `test/app/edmDesignBrand.test.ts`; `.verification/native-library-review-canonical.log`.
- Relay unchanged: **21/21**, 0 skipped, exit 0; `.verification/native-library-review-relay.log`.
- Scoped ESLint: **16 owned files**, exit 0/no diagnostics; `.verification/native-library-review-lint.log`.
- Scoped TypeScript: **0 owned diagnostics, 10 transitive diagnostics outside owned files**, same repository non-strict/typed ambient scope; `.verification/native-library-review-types.json`. Full Nuxt/vue-tsc is not claimed.
- Complete Vue script/template compilation: **3/3**; `.verification/native-library-review-sfc.json`.
- Real PG now **10 cases**, including seven refusal variants: ungranted logo, alt-only nonlibrary logo, legal value, unknown own data, protected ancestor, unknown ancestor data and forged library-shaped lineage with registered assets. Every refusal compares the complete document head, revision IDs, projection source/HTML/revision and all document receipts before/after. Existing committed-lost-reply, concurrent head and renderer-revocation cases still pass. The unique schema was dropped and absence verified; `.verification/native-library-pg-cleanup.json` has `dropped:true`.
- Red evidence: five new unit and five real-PG permission tests all failed against the original bypass, `.verification/native-library-review-red.log` (**10 failures**); the new reopen fence initially failed for missing implementation, `.verification/native-library-reopen-red.log`. A new forged-lineage harness case initially hit `SAVED_DRAFT_REQUIRED` because its synthetic projection was not updated; making that fixture projection consistent reached the intended `EDIT_FORBIDDEN` boundary. No production acceptance assertion or original fixture was weakened.

### Exact follow-up changed files

Only these ten tracked source/test files, this report, ignored native `crates/engine/src/cmd/edm.rs`, the freeze manifest and verification outputs changed in this follow-up. Existing M06 wiring, SQL, configured DB, original acceptance fixtures/inventories, relay, Handoff/panel components, `useEdmDesignRoundtrip`, tracked native patch/pins/CI and Git were not changed.

| Follow-up source/test | SHA-256 |
|---|---|
| `shared/emailRendering/designDesigner.ts` | `93c8ee2eca1852852b391d10b2014feda8b275708f627d3c03700744fbf49746` |
| `shared/emailRendering/designModules.ts` | `14a85ca35311bd166b22cae84ba0220bebdaaf1203dc8adf45994d1f377a0376` |
| `server/utils/email-marketing/designModules.ts` | `76039173b541e0960f8b6b38fbbabe55702a50237745e4a7242dc32644064e06` |
| `app/composables/useEdmNativeLibrary.ts` | `db8942c239dbc4c5158795a1f77f225b8269fc721a4932019a31e73c513d69b5` |
| `app/components/email/builder/EdmFlyhubBuilder.client.vue` | `fa32ffdc604df268470c830f5343d29626b09654983e27fce37248e357ef737f` |
| `test/unit/emailNativeLibrary.test.ts` | `4e41f80549e26eb5e8183cb7a794d8c6b90a58b00cdd2e4beaaf703c3af0455c` |
| `test/unit/emailNativeImageReplacement.test.ts` | `9d0563e4f2aca30766be5aec2307578f6da76ecd2787f012736f805fc6eaf8eb` |
| `test/integration/emailNativeImageReplacement.database.test.ts` | `8755a1a90839fdd53a5e902f52309435411ef519ea5b3227ec738ec748a6eb53` |
| `test/app/edmNativeLibrary.test.ts` | `acc27c95c019784052abd343c6e558143f8419c3b1d259c023590cfb7020bb87` |
| `test/app/edmNativeLibraryRecovery.test.ts` | `d7cc3630cea8e3ed278431a4b9bebcec151614cdb6382fd080080fd53932f91a` |

The source freeze is final for this task. Parent still owns independent rereview, patch/pins regeneration, exact Linux 32/9/8/package proof, then actual-WASM08a visible-control acceptance including nonempty edits/Apply, failed and unknown reopen recovery and public image delivery. This follow-up establishes bounded local correctness, not native runtime, hosted employee, campaign08b, ordinary staff authority or real-client acceptance; no commits/release actions were taken.
