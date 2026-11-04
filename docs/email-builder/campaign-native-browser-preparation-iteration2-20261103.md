# Campaign runtime build preparation — iteration2, 3 November2026

**Preparation complete; actual artifact build and runtime acceptance remain PENDING.** This iteration supplies an isolated parent-run build recipe and extends the campaign fixture to same-template successor publication and exact migration499 admission. Fresh results: **17 campaign preparation checks passed /1 actual-runtime case skipped**, plus **8 build-shape/config/syntax/admission checks passed**, zero scoped lint/type diagnostics and successful Node fixture compilation. No private Worker/renderer/Pages artifact, native package, browser screenshot or database runtime was produced here.

This addendum supersedes only the current source-readiness status in the [first preparation report](campaign-native-browser-preparation-20261103.md). The prior raw32-entry preparation manifest/report and all24/400/94/123 historical evidence remain unchanged.

## Current blockers: reviewed499 replacement and coherent re-freeze

**The original499 pin is WITHDRAWN, not accepted.** The coordinator reported an independent P1 in SHA `31cad088418962141d990368cc2fb460fd030ee2eb2cb9530078d16f49f06453`: compound schema0 downgrade, published demotion and projection rewrite. The coordinator confirms it is **not configured-applied** and has assigned a fix/refreeze. This worker did not reproduce the DB counterexample or change migration/source files.

The old hash is retained as historical evidence only. Both build and actual runtime admission are now closed:

- `APPROVED_SQL499 = null` in the build recipe; actual `admitBuild` rejects even matching historical source/approval labels before Git archive/output creation.
- `CAMPAIGN_499_APPROVED_SHA256 = null`; actual campaign receipt admission refuses the withdrawn version before any PostgreSQL connection or artifact execution.
- Separate pure **shape** validators exercise protocol/hash/source/owner rules without granting build/runtime/migration approval. Their positive synthetic cases are not artifact readiness.

An explicit reviewed replacement hash and final source map are required to update these approved pins. Changing an approval label or silently accepting arbitrary future SQL cannot unlock execution.

The supplied initial UI freeze `.verification/campaign-ui-handoff-20261103/hashes.json` covers28 owned files; the successor freeze `.verification/template-successor-20261103/final-freeze.json` covers the five assigned source/tests plus report. Their source/dependency maps produce a deduplicated39-entry expectation in the build recipe. A read-only check found five later worktree mismatches: `designHandoffs.ts`, content roundtrip route, `useEdmDesignRoundtrip.ts`, and two associated tests. [Exact expected/observed hashes](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/source-freeze-observation.json) are retained. The coordinator confirmed active review fixes under a separate owner; this is expected drift, **not permission to use dirty bytes**. The original map is retained and future preflight rejects it until the parent explicitly supplies the final reviewed re-freeze/commit.

Native-only6c7f source remains a required ancestor, not a coherent campaign freeze. There is still no final matching40/9/8 CI/package receipt or calibrated campaign/native controls. Published32/9/8 package bytes remain inadmissible.

## Delivered isolated build recipe

All files are under the new ignored [.verification/campaign-runtime-build-20261103/](../../.verification/campaign-runtime-build-20261103/README.md); no product worker config/handler, package, pin, workflow or source was edited.

| File | Purpose |
|---|---|
| `build.mjs` | Explicit future commit/parent receipt/fresh owned output preflight; archive/hash source; sanitized child compilation; retain receipts/failures |
| `runner.mjs` | Existing private Worker build, canonical renderer bundle, standalone actual Pages PATCH bundle; never called in this task |
| `pages-config.mjs` | Narrow local Nitro cloudflare_module config with one real Pages PATCH handler and existing database plugin |
| `pages-admission.mjs` | Local staging/origin/content-only transport guard; unchanged body bytes go to the actual Pages handler |
| `expected-source-hashes.json` | Original39-entry supplied source map; explicitly marked pending re-freeze/withdrawn499 |
| `approval-pending.json` | Deliberately invalid pending parent input with null source; cannot authorize execution |
| `build-admission.test.mjs` | Eight pure shape, refusal, config identity and script syntax checks |
| `README.md` | Exact missing inputs, invocation, outputs, runtime limits and withdrawal status |

The future command requires exact40-character committed source, matching reviewed source map/native pins, separately approved receipt and a fresh nonexistent `.verification/frozen-campaign-runtime-<unique>` directory. It refuses HEAD/short/native-only/dirty guesses, wrong source, old counts, arbitrary SQL, existing/partial/empty output, traversal and wrong output ownership. Source preflight reads immutable local Git objects; no Git state mutation, fetch, branch operation or current-worktree copying is used.

After the parent fixes/reviews/refreezes499 and explicitly updates the approved pins, the recipe will:

1. Verify reviewed source hashes and tracked native patch/pins before reserving output. Require existing root package/lock to match the selected source, using installed dependencies only.
2. `git archive` exact regular files in128-path **literal-pathspec** batches, excluding dotenv/dev-vars paths by filename before bytes are emitted. Reject symlink/submodule traversal. Hash all captured files, retain pristine source.tar/per-batch hashes and reverify captured source after compilation. No caller dotenv contents are read or copied.
3. Build the existing frozen private Worker through its existing Nitro config/build.mjs. Bundle the canonical renderer’s actual `src/index.ts` for browser/workerd/worker conditions using esbuild. No renderer implementation is replaced.
4. Build a standalone **LOCAL TEST** Pages artifact importing exact `server/api/email/campaigns/[id].patch.ts`. Actual `auth.ts`/`requireWriteAccess`, client/access, registered-asset, updateCampaign/revision code and database cleanup plugin remain. Only canonical sessionToken verification aliases to the existing private Pages-authority adapter; no writer/sender/permission stub or production private-route addition exists.
5. Emit per-artifact source/SHA/byte receipts, full source inventory/archive receipts, recipe/toolchain fingerprints, renderer input hashes, compiler log and a `runtime-inputs-pending-native.json` with **`native:null`**. Artifacts would remain `compiled-not-runtime-verified`; no matching package or runtime success is fabricated.

The child environment is a fixed minimal object with no inherited/read process.env credentials. Nitro dotenv/rc/global-rc/package configuration loading is disabled. All build tools are existing local dependencies; runner fetch is forbidden. This is not an OS-level network-isolation claim. Actual Miniflare/browser outbound fencing is still separately required at execution. No Wrangler/deploy/full production Pages build occurs.

The local Pages transport admits only staging/app-origin content PATCH and actual snake_case `operation_id`/`expected_design_revision_id` plus body/subject/preheader/from_email. It bounds body bytes, rejects scheduling/audience/workflow/provider/send routes/fields and forwards original bytes unchanged. The real handler owns authentication, normal field parsing, fresh authority, policy, revision/CAS and asset decisions. Receipt metadata requires `senderEnabled:false` and explicit existing local cohost authority. It proves no hosted employee/RBAC behavior merely by compiling.

**Future invocation only — not run here:**

```sh
# Exact repository cwd; Node24.18.0; all three values are missing parent inputs.
node .verification/campaign-runtime-build-20261103/build.mjs \
  --source "$PARENT_FINAL_COMMIT" \
  --output "$FRESH_OWNED_RUNTIME_OUTPUT" \
  --approval "$PARENT_FINAL_APPROVAL_JSON" \
  --execute-build parent-authorized-local-artifacts
```

This command remains blocked by null approved499 pins until the reviewed replacement and re-freeze arrive. No additional product scope or approval is requested; the parent owns that existing fix and final artifact authorization.

## Campaign fixture updates

The prepared real API setup now uses the strict existing-owner command:

```ts
{ version:1, command:'revise-template', operationId,
  draftId, expectedRevisionId, templateId, expectedTemplateRevisionId,
  name, category, includedOverridePaths }
```

After typed A/B selection from published T/R1, the saved mutable source and module head advance through their actual owners. Then `POST /api/email/design/templates` revises **the same T/document** to R2. Prepared assertions require `published:true`, stable template/document IDs, a new revision, exact replay receipt, unchanged immutable R1 row and A/B snapshots/pins, matching R2 head/projection and actual template compiled-HTML hash. No SQL synthetic head advance, published draftPATCH or new-owner surrogate is used.

Status of the former same-T gap is now **SOURCE IMPLEMENTED / REVIEW PENDING**, with499 withdrawn pending its P1 fix. These prepared assertions have not executed against a Worker/database. The two new pure parser cases exercise the source-frozen strict shared request schema only; they are not publication evidence.

Required migration inventory is exactly491/492/493/494/495/496/498/**499**. Missing, duplicate or altered499 is refused.498 retains its reviewed exact hash. The original499 hash remains historical; actual migration admission has no approved replacement yet.

New-image fixture assertions match the supplied frozen source: `insertDesignImage` grants `${id}.data.props.url` and stable lineage `fields.url = imgu_<operationId>` only for new insertions. The actual API insertion plus visible typed staff replacement case remains prepared, along with the separate legitimate legacy URL-granted image case. No stored policy migration or generic registered-URL save bypass was introduced. Existing native/staff/native journeys, raw-operation checks, desktop390px review, same-head reload, original-payload recovery, conflict/refusal, exactly-once C recovery, pins/locks/metadata and fresh guard assertions remain.

Future runtime evidence targets the separate `.verification/figflow-campaign-browser-preparation-iteration2-20261103/<unique-schema>/` root. The old raw32-entry preparation root is never an output target. The original campaign helper/test contents were copied into iteration2 `.before` snapshots before edits.

## Executed checks and exact limits

All commands used explicit cwd `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`, existing Node24.18.0/dependencies only.

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/integration/emailCampaignDesignerWorker.database.test.ts --cache=false --maxWorkers=1
# exit0:17 preparation checks passed /1 actual-runtime case skipped
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH node --test .verification/campaign-runtime-build-20261103/build-admission.test.mjs
# exit0:8 pure build-shape/config/syntax/admission checks;0 skipped; no build
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec eslint test/helpers/figflowCampaignBrowser.ts test/integration/emailCampaignDesignerWorker.database.test.ts
# exit0, no diagnostics
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH node .verification/figflow-campaign-browser-preparation-20261103/scoped-types.cjs
# four new+historical owned TS files, ESNext/Bundler/non-strict/noEmit/skipLibCheck; zero diagnostics
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec esbuild test/integration/emailCampaignDesignerWorker.database.test.ts --bundle --platform=node --packages=external --format=esm --outfile=/tmp/figflow-campaign-browser-prepared-iteration2.mjs
# exit0, Node fixture syntax/bundle only; no product SFC/Nitro/Pages/native build
```

[499 red check](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/499-red.log) failed before helper inventory/pin support. [Campaign preparation green](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/preparation-final.log), [build guard/syntax green](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/build-admission-final.log), [lint](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/lint-final.log), [types](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/types-final.json) and [Node compile](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/node-compile.log) are retained. The checks explicitly verify withdrawn499 is rejected by actual build/runtime admission. No passing shape/syntax case grants migration approval. The Vite future-loader `__dirname` warning is unchanged.

No archive/build command from the recipe, native/Cargo build, private Worker/renderer/Pages artifact build, configured/local DB, browser, R2 operation, provider, email/send, Git mutation, CI, install, deployment or activation ran. There is no new schema/proxy/runtime cleanup proof because none was started. Source counts40/9/8 and the supplied UI/backend test reports are separate parent evidence, not native tests or PG suites rerun here.

Final owned helper/test hashes are in [source-hashes.json](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/source-hashes.json). Historical08a helper remains `f85ff53d9c1250edd2801a71ea938f0d917ea550cb1d41c06a8a92ba3eaebf6f`; integration remains `d1c3dbe79e69a5ec1bb0c3b8a9f82122c6c6d1c71cf6997de04582768f677dbb`. [Preservation proof](../../.verification/figflow-campaign-browser-preparation-iteration2-20261103/preservation.json) rehashes all24/400/94/123/32 prior entries and both historical harness files unchanged. No28 UI-owned or5 successor source/test files were edited by this worker.

Parent owns the reviewed499 replacement, active handoff review fixes, final coherent commit/refreeze, exact matching40/9/8 CI/package receipt, actual artifact builds and package/control calibration. Actual campaign native runtime, ordinary hosted employee/RBAC, public signed delivery, real email and full OEM fidelity remain separate unpassed gates.
