# Editable artwork implementation log

27 October engine continuation: [ENGINE-JOBS.md](ENGINE-JOBS.md) records authenticated durable preview jobs, the reviewed Pages boundary and current local proof. [COMPLETION-AUDIT.md](COMPLETION-AUDIT.md) is Kimi’s independent broader audit. Nothing is deployed.

Earlier 27 October continuation: [COMPANION-WORDING.md](COMPANION-WORDING.md) records the actual editor/native round trip, 273-test regression and exact evidence. Earlier authority links below are historical stage checkpoints.

Current authority: [PRD v2 implementation checkpoint](V2-IMPLEMENTATION.md). G1/G2 local implementation and Nuxt fixture proofs are now present. Earlier dated sections below preserve Stage 0/1 and documentation history; they must not be read as current feature absence.

26 October 2026. Worktree `banner-editable-artwork`, source `adme-dev/dashboard`.

- Initial clean HEAD 931d131ca; fetched origin/main 1f8dd64a7fc37a2334ae648342851e574eea5b99 (one newer commit), rebased documentation to ef9f1f072a6d19c6f6ae2226da14962707f8402e without conflicts. Parent checkout untouched. No branch upstream configured; origin is source authority.
- All 23 reference manifest SHA-256 hashes verified. Selected fixture: current local-lifestyle LETTER BACK, never coastal variants.
- Hosted `/agency/banner-studio` redirects to `/auth` in available Chrome session. Dissector and Qwen live success cannot be claimed. No `.env` exists in this worktree; catalogue assignments, database persistence and provider account readiness unverified. Dependencies installed locally from frozen lockfile.
- Source confirms Dissector source-background fallback and Qwen staggered import remain. Stage 1 uses a separate validated native reconstruction package, preserving these existing paths.
- Existing text inspector accepts stale responses against a new selection; existing endpoint fabricates string variations on provider failure. Stage 1 extends that inspector/catalogue route with scoped proposal, protected copy and explicit failure.
- Ruling: supplied exact copy overrides generated artwork typography/copy errors. Fonts are approximate and need review. This is a curated reconstruction fixture, not automatic extraction.
- Ruling: use a local saved native project package and real Chromium evidence if an authenticated database session remains unavailable. This proves local editor/persistence contracts, not a production database write.
- Background repair: built-in image_gen edit of lifestyle-back original; removed all logo/text/map/voucher graphics, retained leafy masthead/curved white transition. Saved `output/editable-artwork-pilot/clean-background.png`. Provider model/version/request ID/billed cost not exposed; not evidence of deployed application provider capability. Visually inspected: clean sky and blank letter field, no coastal setting.
- UI direction: extend existing compact copy inspector with labelled rewrite instruction, alternatives, native type preview, explicit Apply and stale warning. Reuse semantic Nuxt UI colours and existing typography; no new editor or catalogue.

## Work checklist

- [x] Refresh/reconcile source, verify references, record live access limits.
- [x] Approved-copy fixture, semantic layers, reconstruction metadata validation.
- [x] Native A4 reconstruction with separate clean plate/logo/map geometry.
- [x] Selected copy scope/protection, preview/apply/undo tests.
- [x] Save/reopen and real-browser/export evidence.
- [x] Review changes, record limits and update Orca card.

## Implemented slice and observed fixes

- Frozen-lockfile dependency install completed; Nuxt preparation reports existing duplicate-auto-import warnings.
- `shared/bannerReconstruction.ts` validates curated manifests, explicit review, distinct clean-background hash, stable IDs/roles and exact required copy. It preserves the existing Layer schema and custom A4 key, adding physical/provenance metadata per artboard. It is **not** the Stage 2 untrusted upload/ownership boundary.
- `scripts/banner-studio/build-editable-letter.ts` builds the current back into 124 native layers: 31 text, 91 rectangles (including supplied route line segments), 2 images (clean plate and original logo). Stored at `output/editable-artwork-pilot/project.json`, plus manifest/inventory. All supplied copy is verbatim; superscript is a native text run. Map is geographically derived from supplied coordinates with attribution.
- Existing text inspector now accepts a rewrite instruction, previews using the native text renderer, and applies one scoped undo action. Selection/document changes, including away-and-back and undo, invalidate proposals. Commercial/merge-bearing text and explicitly approved blocks are protected.
- Existing `banner_copy_suggest` catalogue route checks saved selected text and client scope, rejects unsupported assignments, filters unsafe alternatives, and reports provider/model/fallback. Provider failure no longer produces fabricated variations.
- Browser tests first caught two undersized line boxes (sale period and phone); corrected geometry and reran fit assertions.
- Browser hide/undo test exposed pre-existing `updateLayer` undo retaining newly introduced `hidden`/`textRuns` fields. Added a failing regression and fixed snapshot restoration to delete absent fields before assignment. Re-run passes.
- Chromium saved/reopened project, all 31 text blocks exact, all text boxes fit, client/server HTML identical. Heading rewrite/undo leaves other records unchanged. Undo HTML is identical; Chromium anti-aliasing differs by at most one colour level on a few pixels, so the proof records measured pixel tolerance instead of falsely claiming byte-identical PNGs.
- Ruling: the initial UI/end-to-end proof uses an explicitly local file-backed API adapter and deterministic copy response because no authorised live session/provider credentials are available. Do not count it as hosted database persistence, live AI inference or full A01–A08 acceptance.
- Marketing update is limited to the implemented selected-heading preview/undo/protection behavior on the existing AI Creative Assistant entry. No automatic reconstruction promise or new menu category is added.

## Independent review

Fresh reviewer found no Critical issues. Important findings addressed:

1. Incomplete generic legal/merge screening: nine failing examples now covered (private buyers, eligibility, weekday, moustache/template merge fields, free-service claims, spelled-out amount and street wording). Explicit `copyLocked` remains authoritative for all approved fixture blocks. Public copy now describes **detected** facts, not universal semantic protection. Human wording review remains required.
2. Existing catalogue resolver tests needed the new write/scope setup; updated without replacing resolver assertions. Broad banner regression returned 298 passing tests, two opt-in browser tests skipped, before the added review tests.
3. Text-bound feed previews could mask proposed text: both inspector and endpoint now reject creative copy proposals for text feed bindings, covered by red→green tests.

Reviewer minor on HTTP 409 was resolved with a save-required message and regression test. Persistence-proof weakness was treated as important: changed heading must be present in the actual PATCH payload and survive reload, rather than saving only the original state after undo.

Typecheck attempt using direct vue-tsc without configured heap exhausted its default 4 GB. The repository's `pnpm typecheck` with its configured 16 GB ceiling completed after roughly 15 minutes with exit 2: 952 diagnostics, all outside the changed/new files (paths compared against git diff and untracked files). Examples include activity click-handler types, Page Studio union narrowing, storage Buffer/BlobPart and QR module declarations. No clean-main baseline typecheck was run, so this establishes the location of reported errors rather than proving every error predated this change. Full output is preserved at `output/editable-artwork-pilot/typecheck.log`. Global typecheck is not passing.

## Final source reconciliation

Fetched again during validation. Main advanced to `d4df8643c230b758765d9b56e396a0e1394cedbe` via #705 (only three obsolete `wrangler.toml` binding lines removed). Rebased this worktree with autostash; tracked edits reapplied cleanly and untracked fixture/tool files remained present. Current documentation HEAD is `0bb6b8caf9fd61dc522f432e177232a855c5247c`. No merge, push, deploy or parent-checkout mutation.

## Recorded validation

- Broad banner, catalogue-routing and editor regression: **311 passed, 2 opt-in browser tests skipped** across 47 files (`/tmp/banner-regression-final.log`).
- Explicit real Chromium lifestyle test: **1 passed**, native save/reload, changed-heading persistence, exact copy, text fit, scope/undo and clean headline/offer measurements (`/tmp/banner-browser8.log`). Both tested reveal regions have zero residual text pixels.
- Existing native effects real-browser case passed; a concurrent combined run hit a browser-close hook timeout, then the lifestyle case passed independently with a bounded 30-second close hook.
- New/changed pilot TypeScript utilities and tests pass targeted ESLint. Legacy inspector/composable-wide style debt is not represented as globally lint-clean.
- Full local Banner Studio UI exercised instruction, native-font preview, apply, undo/redo, changed-heading PATCH and reload. One initial unrelated effects-presets test stub returned the wrong shape; corrected the local fixture to the existing `{ presets: [] }` contract. No product effects implementation change.

- Corrected full UI rerun: **PASS, no page errors** (`/tmp/banner-ui-clean.log`, `ui-evidence.json`, `ui-errors.json`). Actual native-font preview, Apply, undo, redo, changed-heading PATCH and reload captured. QR Codes remains present in the rendered navigation. Its destination behavior was not exercised; no release regression claim.
- Evidence hashes are in ignored `output/editable-artwork-pilot/evidence-index.json`; side-by-side review is `review.html`. Large client artwork and generated proofs remain outside git.
- Local output design was inspected with every text/logo hidden: leafy photo with repaired sky, clean white letter field, independent native panels/road/markers. No concealed original lettering.
- The local UI fixture does not implement collaboration WebSockets or notification SSE; their connection warnings are retained in `ui-errors.json`. Its `errors` array records zero uncaught page errors, not a claim that every realtime integration was exercised.
- Orca card updated to **in-review**, with local proof counts and the live-provider gate. Implementation remains uncommitted for review.

## Parallel continuation — existing AI layering repair

Paul explicitly requested agents and practical work on the existing layering failure. Three agents worked on client registration, provider/asset integration, and Dissector extraction integrity. Fetched origin/main again: still `d4df8643c`; HEAD includes it. Earlier pilot edits and the parent checkout were preserved.

Confirmed causes and implemented corrections:

- Qwen emits shared-frame RGBA PNGs, but the old client offset each result by eight pixels, used natural dimensions instead of the source transform, and retained the flattened original below the results. Import now preloads all frames, validates common dimensions/aspect, preserves placement/crop/rotation, hides the source and applies the set in one undo transaction. Project/artboard/document changes invalidate pending work. Aggregate opacity/blending/filters/entry-exit animations are rejected before inference because applying them independently to overlapping PNGs would change the composite. Operators must use full opacity, Normal blend, no visual filter, and entry/exit None.
- The Gradio parser missed wrapped Gallery entries. It now handles current and older gallery shapes, requires every layer, validates RGBA PNG header/chunk structure, and returns real dimensions. Downloads are restricted to the exact Space origin with redirects disabled. Header validation is not pixel-fidelity proof; browser decode remains required.
- The API rejected the signed URLs produced by the normal upload flow. It now verifies the established asset token, checks asset owner/client access, and reads from the existing request-scoped storage adapter. Derived assets retain client scope and use signed delivery/native Pages uploads. Legacy public URLs must match a registered accessible asset. Upload/row failures reject the whole result and attempt cleanup using keys recorded before PUT. Cleanup failure is logged, not falsely guaranteed impossible.
- Dissector invented a generic manifest when providers failed, used the original source for failed layers/background, and labelled the result complete. Those fallbacks are removed. Malformed/provider failures are explicit; unproven cutouts, ambiguous copy bindings, and missing/unclean backgrounds are `review_ready`. No background-repair adapter exists in this legacy path, so omitting a background cannot bypass review. The original remains a source reference only.
- Dissector UI displays reconstruction warnings and blocks import. Detected copy is read-only because its old token edits were never persisted. Raster lettering defaults to image, with no fallback from missing text to a description or placeholder. Import rejects legacy/unverified manifests and unsupported conversions. Read/process/import routes enforce job ownership; write routes require write access; project access preserves the existing client/owner/admin rules. No database migration was required (`status` is an unconstrained VARCHAR).
- Marketing copy now explicitly calls decomposition raster separation and removes the unsupported targeted-extraction/native-editability promise.

Meaningful RED→GREEN coverage includes incomplete downloads/uploads, current signed links with real HMAC verification, client access, stale results, misregistration, malformed analysis, invented copy, missing background and unsupported compositing. Independent review findings on asset URLs, aggregate opacity, cleanup keys, unassigned project ownership and unsafe layer overrides were addressed.

Validation: final combined suite **397 passed, four opt-in browser cases skipped** (52 passing files; `/tmp/banner-layering-regression-final.log`), including the additional project/client access regression. Explicit Chromium run: **three passed** across native lifestyle reconstruction and synthetic cover/crop decomposition (`/tmp/banner-layering-browser.log`). New client/API/adapter/test files and Dissector UI pass scoped ESLint. Existing large Dissector utilities retain prior lint debt, reduced by this work. No new global typecheck claim: the earlier run failed with 952 diagnostics outside then-modified files and was not repeated after this continuation.

Synthetic browser evidence lives in `output/editable-artwork-pilot/decomposition/{cover,crop}-evidence.json` and associated PNGs. It verifies pixel registration, actual image renderer/export parity, hide/reveal, one undo, file-backed save/reload and rejection of half-opacity sources before inference. It is not live Qwen output or hosted persistence. Available Chrome remains at `https://agency-dashboard.pages.dev/auth`. No live image uploads, subscription purchases, merges, commits or deployments were performed in this continuation.

## Historical PRD v2 documentation-only checkpoint (superseded by implementation below)

Captured creation-first generation, reusable style recipes, selected-lettering native reconstruction versus raster redraw, retained wording/reference metadata, Claude Design interaction reference and expanded model R&D. Added LETTERING-WORKFLOW.md and requirements R18–R24 / gates A09–A12; aligned brief, README, technical design, implementation plan and handoff. At that checkpoint, the new features remained proposed; the prior local implementation evidence was unchanged. Documentation links and whitespace checked; no application tests rerun for prose-only changes. No commit or deployment.


## G1/G2 application implementation and G3 attempt — final local checkpoint

Creation/style recipes and selected lettering native/raster proposals are implemented through existing Banner Studio surfaces and catalogue. Exact routes/default models, signed owned-asset boundaries, revision/CAS saves, protected source wording, synchronous dispatch limits and remaining gates are documented in [V2-IMPLEMENTATION.md](V2-IMPLEMENTATION.md). No deployment, commit or migration was performed.

Actual Nuxt fixture proof at `output/editable-artwork-v2/ui-evidence.json` passes native preview/apply/undo/redo/reload, first-use raster right-click preview/apply/undo/reload, original raster-reference retention, concept review/import/save and custom-style reopen. Provider responses are explicit fixtures and persistence is file-backed. Four saves, one generation and two lettering calls; uncaught page errors empty. Recorded SSE/WebSocket fixture connection errors do not establish realtime acceptance.

Latest bounded suite: **457 passed, 5 skipped; 59 files passed, 4 skipped**. Native renderer rerun: one passed. Earlier combined four browser cases passed their cases but encountered cleanup timeout; no completely clean combined-run claim. Focused backend/catalogue/runner suites: 30 passed across six files, with targeted lint passing. Global typecheck remains unproven; prior failed runs are preserved above.

The benchmark runner defaults to dry-run. A subsequent real Qwen `--run` at 07:10:28 UTC failed after about 10.1 seconds: `output/banner-provider-benchmarks/2026-10-26T07-10-28-456Z-b496bdc49cb9/evidence.json`. Source A4 JPEG SHA-256 `b496bdc49cb9207bb6dd8a997e2d56b86df8e6f7f483eb14d9814fbee03cf256`; four layers/50 steps requested; no valid layers/composite returned. Space error is not a quality benchmark. Cost/request ID unknown. Seedream and LayerD did not run; no OpenAI credentials/live inference.

Full automatic clean-plate repair, durable jobs, other reference sides, 20-case/provider comparison, Quiver and print gates remain open. Applied concept recipes persist in canvas metadata; discarded concepts have owned assets but no durable proposal recipe. Native-to-raster without an owned separated raster reference is explicitly unavailable. Rate/size/one-call bounds do not implement the proposed absolute USD ceilings.

Current global app `vue-tsc` attempt was stopped after approximately nine minutes at 7.3 GB RSS as free disk fell to about 259 MB. It emitted no diagnostics before interruption and is **incomplete**, not clean. The historical 952-diagnostic result above is a different run. Isolated native-renderer browser rerun passed one test in 16.93 seconds.

Final creation-flow review found no blocking issues. Realtime limitation remains explicit: layer-add events broadcast the flattened layer, while `artworkCreation` provenance/styles become visible to collaborators after refresh. CAS prevents stale document overwrite but does not provide a shared atomic metadata transaction.

### Final source and local review checkpoint

Reconciled with autostash onto `origin/main` `21b162c19eb1956c80dc2ab2ab4731ead7968bfd`; resulting documentation HEAD `4111fb9b42b1463b42411a2ba5e4a1acaaf8a197`, with implementation still uncommitted. The last upstream changes are the Pages binding-budget test and marketing/measurement guard; neither changes Banner Studio runtime. Ancestor and whitespace checks pass. Seven updated upstream configuration tests pass, alongside final15 revision/access tests and scoped ESLint. Independent cross-review found no new blocking findings. Owned3137 dev server stopped after actual Nuxt proof. Hook minimal-PATH verification passed all four current commands without further configuration changes. See V2-IMPLEMENTATION.md for remaining product/provider gates and the local review index.

## Managed QR and governed job — 26 October 2026

Created Orca Run `run_666e5ba6039d` in the existing branch/worktree at user request. Confirmed effective GPT-6 Astra/high governing review and GPT-6.1 Sol/high browser/provenance workers. See JOB.md for task/dispatch IDs and the pending retail-invitation edit. Earlier internal subagents completed scoped QR server/UI/AI guard changes; the Orca review found whole-canvas, brand-kit, realtime and save/create/clone/restore bypasses, now covered by shared invariants, HMAC asset attestations and scope/revision checks.

Actual Nuxt QR fixture proof passes insertion, undo/redo, five saves, reload, management link and canonical short-URL decode at 120/240 pixels; all 124 original layers unchanged. Zero AI or live scan requests; no page/console errors. Final bounded regression: 725 passed, 5 skipped; 93 passing/4 skipped files. Shared-helper TypeScript, five Vue SFC compilations and scoped lint pass. Final fetch left origin/main at 21b162c19 and HEAD includes it. No commit, merge, deployment, live QR creation or artwork publication. Updated source map/QR references are hashed in the manifest; originals preserved. Live provider/database/QR and final layout/print gates remain explicit in MANAGED-QR.md and V2-IMPLEMENTATION.md.

## 27 October — scoped retail invitation implemented and proven

Reconciled onto main `3a837b45149b25f561558be65e1a89ca31bf4315`; HEAD `3d28afca8cb768e02b1cca68953b0ea92c4e0b6c`. Existing tracked/untracked edits and parent checkout preserved. Added bounded selected-layer proposals, full persisted-source checks before/after generation, exact-body layout guards, measured script-free preview fit, review/revision checks after asynchronous Apply, and client/server clipping parity. Governing negatives drove fixes for source substitution, erased/clipped/covered text, masks, unreviewed rasters, revoked review, background stacking and cross-format fit.

Broad regression: 803 passed, 5 skipped (96 passing / 4 skipped files). Reviewer independently passed 156 tests across 11 files. Final marker-only Vue DevTools exclusion passes 25 component tests; scoped lint, whitespace and four Vue compilations pass. Actual Nuxt fixture proof passes all preview/apply/undo/redo/save/reopen and preservation assertions, with 31 exact original text blocks, 120 unchanged layer hashes, 10 measured fitting text blocks, and zero page/console/fixture errors. Vue DevTools injected the earlier blocked scripts; excluding these static frames fixed the diagnostic without permitting scripts.

Read RETAIL-IMPLEMENTATION.md, RETAIL-REVIEW.md and ignored output/editable-artwork-v2/retail-invitation/review.html. No real provider/database/scan call, production deployment or flat-source reconstruction claim. Final print size/layout approval, automatic repair and body-shortening acceptance remain open.

## 27 October — persisted reconstruction job continuation

Fresh main `4a68e92367fbcffd08a3f6a6a6e4537c71195937` was reconciled with autostash; HEAD `d4560047ae045e14d337ccf062055dce83692fcb`. Existing changes and dirty parent preserved. Two Sol high workers implemented server/UI controls; Astra high independently reviewed and ran actual SQL in a disposable local PostgreSQL cluster. See JOB-RELIABILITY.md for ownership and full acceptance boundaries.

Implemented durable attempt identity, progress, owner cancellation, three-attempt explicit retry, ten-minute access-time expiry, late-write fences and attempt-scoped output keys. Import locks job/project and atomically records the result-bound receipt; identical replay preserves later project edits. Saved-job controls resume and fence stale responses; imports support one undo. Managed QR and existing project access checks remain enforced. Review found and fixed inherited-format lookup with a meaningful regression.

Final coordinator checks: 845 passed / 5 skipped in broad scope, plus 6 queue/upload tests; reviewer separately passed 82 focused tests and 14 real PostgreSQL cases. Actual Nuxt browser fixture passes close/reopen/reload, cancelled late response, two retries, import, one undo/redo and four saves, with zero page/console/fixture errors or provider calls. Marketing descriptions and docs updated. Source/test scoped lint and diff whitespace check pass; pre-existing shared-file lint and global typecheck limitations remain. No full build or hosted proof claimed.

Full asynchronous R12 remains partial: manual retry waits, inline fallback lacks durable execution, and timeout occurs on access. Provider abort/billing, hosted queue/Neon, cost caps, automatic clean-background repair and four-page quality remain outstanding. Nothing merged, deployed, published or purchased.

## 27 October — asynchronous dissection continuation

Fresh origin/main remained4a68e92367fbcffd08a3f6a6a6e4537c71195937, included in HEADd4560047ae045e14d337ccf062055dce83692fcb; no rebase needed. Preserved all existing edits/parent. See ASYNC-JOBS.md for current ownership, behavior and limitations.

Retry now conditionally reserves one queued generation using the reviewed attempt ID, then uses the shared Dissector dispatcher. Initial upload uses the same dispatcher. It prefers the existing queue and ledger; no-queue work is registered before starting with request lifetime support. Missing capability and ambiguous send do not trigger a blind second executor. Legacy jobs receive a server-owned retry identity. Cancellation, late-delivery fences and atomic result/revision-bound imports remain intact.

Root UI fix was red/green verified: a lost retry response now triggers one saved-state read and clears a cancellation latch only for a proven newer generation. Same-dialog queued progress/cancellation passes actual Nuxt browser proof. Two retries, two cancellations, one import, four fixture saves, single undo/redo/reload; zero page/console/fixture errors or live provider calls.

Final coordinator tests:870 passing/5 skipped plus16 process tests (886 passing total). Independent review:122 focused tests and25 real local PostgreSQL cases, with source hashes and cluster cleanup. Scoped source/UI/test/marketing lint and diff whitespace checks pass; no global clean build/typecheck claim. Hosted queue/provider/Neon acceptance, automatic four-page reconstruction and print gates remain outstanding. Request lifetime is host-bounded, not a durable outbox or process-death recovery guarantee. No deployment, publication, purchase or commit.

## 27 October — interrupted dispatch recovery

Fresh main remains `4a68e92367fbcffd08a3f6a6a6e4537c71195937`, included in HEAD `d4560047ae045e14d337ccf062055dce83692fcb`; no rebase needed. Preserved dirty implementation and parent. Server and independent-review workers ran in the existing Orca Run with disjoint file ownership and inherited configured Codex defaults.

Implemented atomic versioned dispatch intent, database-clock delivery leases, five bounded transport reservations per provider generation, exponential backoff and a mandatory-auth default-off recovery endpoint. Recovery uses the existing queue, never inline inference or an automatic new provider generation. Unstarted generations can recover after lost acknowledgement/process death; running inference is not reclaimed. Producer ledger registration cannot reset an existing row, and each transport lease has its own ledger identity. Three explicit provider attempts, cancellation/deadline fences and atomic imports remain intact. Direct lifetime fallback is now development/test loopback only.

Coordinator review found hosted missing bindings could inherit local environment values; a failing test demonstrated it and the implementation now treats the binding bag as authoritative. Final combined regression passes 914 tests / 5 skipped across 105 passing / 4 skipped files. Server focused tests pass105; independent actual PostgreSQL proof passes43 cases and verifies cluster cleanup. Current source hashes match the proof. Scoped source/test/marketing lint and whitespace checks pass. These overlapping test counts are not added. No new browser UI flow, global build or clean typecheck claim.

See DISPATCH-RECOVERY.md and RECOVERY-REVIEW.md; evidence is in output/editable-artwork-recovery/. No hosted activation, provider call, merge, deployment, publication or purchase. Existing queue consumer same-message ledger observability remains separate from the provider execution fence. Full reconstruction/provider/print acceptance remains open.


## 27 October: animation, alpha/masks and ArtCraft reference

Paul approved right-click Animate/Add Tween, then requested a second PNG alpha and mask check and supplied ArtCraft as an integration reference. See [animation workflow and evidence](ANIMATION-WORKFLOW.md) and [pinned ArtCraft/PhotoCraft source research](ARTCRAFT-RND.md). Changes remain local and uncommitted. Current source includes refreshed origin/main; the dirty parent remains preserved.

The coordinator regression passes 1,074 tests with 61 environment-gated skips across 118 files. Eleven explicitly enabled Chromium cases pass separately. Both actual Nuxt workflows now pass: flyer seven assertion groups with 124 unchanged unselected layers, and alpha/masks six groups covering normal/inverted rectangle and ellipse, undo, save/reload and both exporters. Source hashes match; independent review and worker settlement are recorded in ANIMATION-WORKFLOW.md. No deployment, live provider-quality proof or installed ArtCraft integration is claimed.
