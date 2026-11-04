# T07 — Storyboard workbench and editor adoption

Date: 5 November 2026. Local implementation based on `19e798a68b7b8b443e7a02e78168294d83be7235`; no push, merge, deployment, database change, live planning call or provider operation. T01–T07 are implemented locally. R1 release acceptance and T08–T14 remain pending.

## Workbench

Produce now switches between the existing producer controls and a focused, bounded storyboard surface. Existing library selection supplies canonical references. Nuxt UI v4 forms cover recipe, format, integer-frame shots, exact copy, role assignments, usage evidence, visual ranges, audio/overlay/caption bindings and reviewed timing. Keyboard buttons and Alt+ArrowUp/Down reorder shots. Copy editing creates a local draft; candidate acceptance creates a new server revision and optional explicit human copy approval. Saved approved copy is never edited in place. Missing media and readiness findings block application.

The single owned neutral editorial example is versioned, labelled sample/draft, and contains no client media, approval or performance evidence. Preview precedes explicit local prefill. Prefill makes no planning, save, production or approval request. Cross-client/injected-media/stale-evaluation examples fail validation. Fresh planning and review are required afterward. This is not an evaluated dealer/brand example collection.

The new `videoStoryboardEnabled` public flag mirrors the existing server flag and defaults off; the server remains the authority. Saved plans and application recovery remain readable when disabled. Marketing copy says in development, disabled by default and not released. No unsupported storyboard production actions are exposed.

## Editor ownership and recovery

Application synchronously freezes mutations, cancels scheduled autosave, awaits the existing serial queue and flushes the current edit before capturing its revision token and before-state. The original operation ID, replacement confirmation, revision token and before-state survive an ambiguous response in project-scoped session storage. Cache shape, canonical timeline and project identity are validated before restoring a lock. Malformed or cross-project cache is discarded. Recovery waits for both editor initialization and any storyboard GET; a slow GET cannot drop the recovery attempt.

A confirmed server receipt is adopted once, updates the revision token, adds one undo entry and does not autosave the same commit again. Source refresh failure cannot repeat adoption. Undo/redo return through normal revision-checked saves. Definite conflict preserves local state; an unknown result retains the lock and original request for receipt lookup or identical retry. Browser storage failure preserves current-tab recovery but cannot guarantee recovery after reload.

Recovery never overwrites a dirty or newer current edit. The root storyboard read now includes the latest project-authorized application receipt; its after-state restores the divergence baseline after an ordinary refresh. Subsequent manual edits show divergence without back-propagating into the storyboard. A restored older checkpoint is conservatively divergent from the latest application. Refreshing a stale storyboard base preserves the local draft and requires a new candidate review.

## Verification

- Final storyboard/API/editor/timeline/source-registry and required component regressions: **228/228 across 32 files**, including existing local decode fixtures. Log: `.verification/video-t07/regression-final.log`.
- Independent review: no remaining Critical/Important findings; reviewer independently ran **58 tests across 7 suites**. The refresh race was fixed with actual reactive coordination and editor regression tests, including slow storyboard GET/fast editor initialization, before-load freeze, dirty matching-token recovery, and ordinary-refresh divergence.
- New core modules, both components, and scoped server/tests pass ESLint. After formatting, 53/53 tests across the eight UI/editor suites pass and the integrated page script/template compiles with the Vue SFC compiler. Existing editor/page files contain legacy style diagnostics; changed logic was reviewed without claiming a clean whole-repository lint run.
- Standalone strict TypeScript retains **66 existing** dependency/auto-import diagnostics and no new module diagnostics: `.verification/video-t07/typecheck-final.txt`. The component worker also ran the generated application Vue typecheck; it remains non-green elsewhere, with no new component diagnostics. No full Nuxt build is claimed.
- Real Nuxt UI 4.9.0 local fixture in Chrome/Playwright: **390, 768 and 1440px × light/dark**, keyboard reorder, explicit full-cut replacement modal, bounded inner scrolling, no viewport overflow, no browser page errors. Expanded audio/caption/overlay forms were checked. Evidence and rerunnable harness: `.verification/video-t07/README.md`, `browser-results.json`, `browser.mjs`, viewport and cue screenshots.

Browser evidence uses actual components and Nuxt UI with synthetic local content, not a signed-in integrated application or real network lifecycle. The focused Produce integration is source-reviewed; hosted/authenticated behavior remains unverified. Unit/integration tests exercise editor/application state ownership separately. No provider delivery, rendered output, hosted media measurement or full A1–A8/A13 acceptance is inferred.

## Remaining gates

T08 owns direct-save/render obligations, adjusted-edit review and final output verification. T09 and later release gates remain separate. Minor UI limitations retained after review: reference labels expose canonical IDs rather than friendly titles, the candidate summary is not a comprehensive before/after diff of every lane binding, and the catalogue is one neutral draft fixture. These do not authorize production activation. All new actions stay disabled by default.
