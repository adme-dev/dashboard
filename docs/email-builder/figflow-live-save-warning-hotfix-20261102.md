# FigFlow live save warning hotfix — 2 November 2026

## Source and ownership

- Repository: `adme-dev/dashboard`.
- Isolated branch: `adme-dev/figflow-live-save-warning-20261102`, initially clean, with no upstream configured.
- Freshly fetched base: `70a0dc300a54dbf48ac5123f67f7f43f825cefce`. This includes the coordinator's earlier `ed7a92f28` snapshot and its subsequent MotorStack date fix; no reset to the older snapshot occurred.
- A second fetch before final verification still resolved `origin/main` to the same base.
- The parent authoring checkout's component-only working diff was read as a reference. Its component was not copied: this patch was written against main's composer and its unchanged production composable.
- The coordinator owns PR creation, current-main integration, release, live verification, and reconciliation into the parent authoring branch. This worker does not push, merge, or deploy.

## Cause and correction

`useEdmDesignRoundtrip.mutate()` sets `hasPending` before the request and retains it until exact revision readback succeeds. The composer previously treated every pending operation as an unknown result, including normal in-flight opens, structured saves, metadata saves, and their readbacks.

The red composer recovery alert now waits until both `designFlow.busy` and `saving` are false. Idle unknown outcomes still show recovery; retries still replay the original operation and require exact revision readback. The composable, duplicate-write protection, revision contracts, and receipt retention are unchanged.

The existing `figflowTemplateCapability()` helper identifies HTML-only or otherwise unsupported new source before native draft creation/open. The composer now provides a Nuxt UI information alert, disables the native entry/create controls for unsupported source, and guards direct calls before a write. Staff can continue saving that HTML in the composer.

Existing open/proposed handoffs can still reopen for editing/review. Pending operations remain reconcilable even if local source becomes unsupported. Existing structured drafts use their stored `source.policy.editableFields`; local blocks cannot infer a replacement policy. Current main has no `designerAuthoring` field, and this patch introduces no authoring capability, HTML conversion, API, feature flag, renderer, SQL, or send behavior.

## Verification

Runtime: Node `v24.18.0`. Dependencies were linked from the parent checkout without installation. Missing local generated TypeScript/ESLint configuration was copied into ignored `.nuxt/` from the parent's existing generated files; no Nuxt preparation or build was run and no parent configuration was edited.

The tests mount the actual composer toolbar/recovery markup, execute its actual save/open/recovery functions, and use the production `useEdmDesignRoundtrip()` composable. Nuxt UI controls are lightweight render adapters and network/navigation calls are isolated. This is bounded happy-dom coverage, not full Nuxt application or hosted browser acceptance.

Before the source change, the new regressions failed as expected: seven failures across the toolbar/recovery suite and draft-dialog suite, including false warnings during open/save/reconcile, missing HTML guidance, ignored stored empty policy, and a create button that remained enabled after source became unsupported. The pre-existing dialog cases continued passing with supported structured fixture content.

Final focused command (with Node 24.18.0 on `PATH`):

```sh
node node_modules/vitest/vitest.mjs run --cache=false \
  test/components/figflowLiveSaveWarning.test.ts \
  test/components/figflowDraftDialog.test.ts \
  test/components/figflowTemplateBrowser.test.ts \
  test/app/edmDesignRoundtrip.test.ts \
  test/unit/edmFigflowLibrary.test.ts
```

Result: **38 tests passed in five files**. Coverage includes successful open/readback; successful structured content and metadata saves; transport/readback failures; exact retained-operation recovery; rejected additional saves while pending; definite authorization rejection; unsupported-source copy/open prevention; continued composer saving; existing handoff reopen; and stored policy preservation.

Scoped ESLint passed for the composer and both changed test files. Vue SFC parse, script compilation, and template compilation passed for the complete composer. `git diff --check` passed. Every changed file was reviewed end to end, including import aliases, reactive controls, duplicate UI, stored-policy admission, and recovery ordering.

The existing Vite configuration emits its forward-looking `configLoader: native` / `__dirname` advisory. No full repository suite, full Nuxt/native build, deployment, configured database/provider access, real browser action, or email send was performed. No public feature page update is needed for this incident-only correction to existing behavior.

## Coordinator follow-through

Fetch main again before integration and preserve any later advancement. Release only this narrow commit after the coordinator's release checks. Verify normal save progress, idle recovery, and the HTML-only Geely composer guidance on the released artifact; local tests do not establish that live result. Reconcile these component guards into the authoring branch using that branch's separate capability contract, retaining its unreleased designer/library/native changes for their own release.
