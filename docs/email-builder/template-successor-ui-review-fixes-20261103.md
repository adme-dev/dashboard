# Template publication review consumption — 3 November 2026

Task `task_847af8d7dd8a`, dispatch `ctx_3d1b5caf21c1`. This fixes the one confirmed P2 in `.verification/template-successor-ui-independent-review-20261103.md`. That review found no P0/P1 in its bounded UI scope; it did not accept backend 499. This followup changes only the existing publication panel and focused component test.

## Fix and boundary

One compiled, confirmed review can now complete one publication. The panel records its submitted review only when its existing builder handler actually starts the serialized flow write synchronously (`busy` and `hasPending`). A silently refused adapter call does not arm later receipt consumption.

The panel waits until that flow is no longer busy or pending and has a new matching published **template** receipt. `lastLibraryReceipt` is assigned by the unchanged flow only after its existing exact immutable receipt readback succeeds. Module receipts, the previous receipt, source-document receipts and nonmatching destination owner/document/revision results cannot consume the submitted review. For a successor, the owner/document must match the displayed destination and the revision must advance beyond the reviewed destination head.

Only then does the originating panel clear its submitted review and confirmation. It also clears the old successor target to the existing no-selection sentinel, without assigning the returned revision as a new expected head. A next successor requires explicit destination reselection and a fresh compiled review/confirmation. A deliberate fresh new-template review can create another publication with a new operation; a second click without that review sends no second POST.

Unknown mutation replies, pending or failed immutable readback and a later denied replay retain the original review, confirmation and existing flow payload/operation. Successful reconciliation consumes the review regardless of whether the originating panel action or the existing global builder reconciliation action initiated it. No receipt, API field, operation registry, composable, builder callback or backend behavior was added. The added state is local to the submitted panel; original operation retention remains entirely with the existing flow.

Incoming module/template receipts without this panel's actual submitted intent do not trigger success consumption. An idle rejected attempt drops only its internal submission marker, preserving the visible review; unrelated later receipts cannot consume it. Existing source/metadata/blocked-state invalidation remains unchanged and separate from successful receipt consumption. Existing in-flight button guards, both publication mount points, source preservation and explicit target pinning remain intact.

## Meaningful red and green

Evidence lives under `.verification/template-successor-ui-review-fixes-20261103/`.

`red-consume-review.log` records **4 failures / 11 passes** against the prior implementation. Ordinary new-template success, ordinary successor success, unknown→403→successful reconciliation and successful reconciliation after a wrong immutable readback all left the submitted review live. These were assertion failures on the actual rendered review remaining present, not setup errors.

The focused suite then passed **15/15, zero skips** (`green-consume-review.log`). The final matrix includes all 15 cases after additional assertions exercise the actual global builder reconciliation handler, exact repeated payloads and deliberate fresh publication/reselection.

The tests mount the real panel and use the real existing flow plus compiled actual builder publication/execution/acceptance/reconciliation declarations. Nuxt UI rendering, composer state and server transport remain bounded fixtures. They prove:

- Ordinary success removes the submitted action; a cached second button click sends no second POST.
- A deliberate fresh review reads a second compiled source preview and creates a distinct operation. A successor first stays unselected across catalog refresh, then uses the explicitly selected R2 head.
- While immutable readback is unresolved, repeat clicks are serialized. A wrong immutable revision retains the original pending review and request; successful exact reconciliation consumes it.
- After a lost reply and later 403, review and original full payload/operation remain available. Successful global reconciliation clears the review, without any new publication operation or source mutation.
- Incoming unrelated module/template receipts, including matching destination identity, do not consume an unsubmitted review. A real flow refusal before dispatch also does not arm consumption of later unrelated receipts.

## Executed final checks

Node `24.18.0`, existing dependencies, cache-disabled Vitest and the explicit actual repository cwd were used. Source hashes were captured before the final checks and matched afterwards.

| Check | Completed result | Evidence |
|---|---|---|
| Publication component and existing component/selection/native panel/reopen/recovery/campaign/template/REST/MCP/gate inventory neighbors | **631 passed, 65 files, zero skips** | `regressions-final.log`, `run-regressions.sh` |
| ESLint of both changed source/test files and exact pre-fix delta | **0 new errors/warnings; 0 baseline diagnostics** | `lint-source.log`, `lint-final.log`, `lint-delta.json`, `lint_delta.py` |
| Scoped Vue/TypeScript using existing Nuxt declarations | **0 owned diagnostics**; tool exits 2 for **70 unowned diagnostics** | `types-final.log`, `types-summary.json`, `vue-tsconfig.json` |
| Protected preservation | **177 paths unchanged** | `protected-before.json`, `protected-after.json` |

The final regression matrix is the prior 627 matrix plus four new cases; the previously existing lost-reply case also gains consumption/global-reconciliation assertions. No new acceptance is skipped. The initial lint log retains one new test formatting error, corrected before final checks. Vite's existing native-config warning remains visible. No full-repository clean typecheck, full Nuxt shell, pixel/browser/native or actual API acceptance is claimed.

Reproduce from `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`:

```sh
bash .verification/template-successor-ui-review-fixes-20261103/run-regressions.sh
python3 .verification/template-successor-ui-review-fixes-20261103/lint_delta.py
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  node node_modules/vue-tsc/bin/vue-tsc.js --noEmit --pretty false \
  -p .verification/template-successor-ui-review-fixes-20261103/vue-tsconfig.json
```

## Preservation and remaining gates

The prior UI report (`2352a7b2dae37ed3e2335a49187d4418d31435087f26b54446e8d977488d5168`), manifest (`39c3fa337dad915876018c06d3c5470d2d3318be0813330b13bce35b26a29872`) and all their evidence remain byte-identical historical records. The before-copies and bounded `source.diff` identify only the two intentionally superseded source/test hashes below. The builder, types-only helper, five campaign P2 files, backend contracts/template service/499, independent review and all prior protected evidence match before/after.

Reviewed the panel's accepted-dispatch marker, serialized receipt/readback ordering, matching owner/document/revision conditions, unknown/denied retention, unrelated receipts, next-target sentinel and both existing shared handlers through the actual adapter harness. Existing form markup, Nuxt UI fields, semantic styles and scroll ownership were not changed.

Backend 499 independent reverification was interrupted and remains blocked as instructed; no SQL or alternate application path was attempted. No Git, actual HTTP/API, database/schema, configured DB, provider/send, browser, native/build, install, deployment, activation, routing, public-copy, harness or ledger action occurred. Tests dispose mounted apps and reset DOM/global fixture state; no external resource cleanup was needed.

These exact bytes are ready for Opus followup review. Backend 499 independent completion/configured application, integrated CI and size budget, matching native package and actual same-T/R2 flow, hosted ordinary employee/client acceptance and release gates remain separate parent work. This fix does not close 08c or claim whole-feature/runtime acceptance.

## Final source hashes

The final manifest records these hashes, report identity, bounded deltas, protected preservation and executed evidence.

| Source/test path | SHA-256 |
|---|---|
| `app/components/email/builder/EdmDesignLibraryPanel.vue` | `820f435adcc099ce945deedcab992c490af2ae1c69cff4b58e2548f6dace5c22` |
| `test/components/templateSuccessorPublication.test.ts` | `3fc766aa367b48704b3b58d6daffc9df34ccaf9e1e46f6de3a0646c6b9a81b79` |
