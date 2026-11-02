# Composer save warning and source admission — 2 November 2026

The composer now distinguishes a save/open request that is still running from an
action whose outcome remains unconfirmed after the request ends. Imported HTML
with no supported editable content receives composer-only guidance before an
open attempt can save or create an independent design draft.

## Evidence and ownership

- Coordinator-provided live read-only evidence: Geely template
  `b18c0164-65d7-4e1e-ba2c-5e997fdafc90` contains an `EmailLayout`, imported
  `Html`, and the `xeroflow-footer`, with no canonical document, revision,
  receipt, or handoff; the live rejection was `NO_EDITABLE_CONTENT`.
  This worker did not repeat the live browser or database inspection.
- Current source explains the transient red banner: `useEdmDesignRoundtrip`
  sets `hasPending` before awaiting a mutation and keeps it through exact
  revision readback. That flag protects operation identity and duplicate writes;
  it is not by itself evidence of an uncertain outcome.
- The composer alert previously checked `hasPending` without checking the
  existing active-work flags. The component now requires both
  `designFlow.busy === false` and `saving === false` before showing its error /
  unconfirmed-action alert. Completed uncertain actions retain the original
  reconciliation control.

## Changed source

- `app/components/email/builder/EdmFlyhubBuilder.client.vue:15` imports the
  existing `figflowTemplateCapability` owner.
- Lines 817–824 derive source admission: use the stored policy for structured
  designs, the existing capability helper for unversioned/legacy composer
  blocks, and bypass the no-content check for discovered server-authorized
  `designerAuthoring.available`. This does not grant server permissions.
- Line 832 stops direct / automatic `beginFigflow` before saving or copying;
  lines 955–956 stop the draft-copy dialog entry for unsupported sources.
  Pending-action reconciliation stays ahead of the new admission check.
- Line 1577 disables a new unsupported open while preserving access to an
  existing open/proposed handoff for review.
- Lines 1634–1640 show a Nuxt UI informational alert explaining imported HTML,
  continued composer editing/saving, and structured starters for native editing.
  Line 1642 keeps normal in-flight work out of the red recovery banner.
- `test/components/emailComposerSaveWarning.test.ts` renders the actual scoped
  component controls and executes its entry functions with the real roundtrip
  composable. Coverage includes deferred mutation/readback, uncertain recovery,
  identical retry URL/method/payload, direct-save lock, eligible structured
  content, HTML admission before writes/copies, stored zero-field policy,
  server-authorized designer bypass, and historical handoff review.
- `test/components/figflowDraftDialog.test.ts:48` supplies the new eligibility
  dependency as `ref(false)` to the existing isolated dialog harness; existing
  dialog behavior assertions are preserved.

The composable, operation IDs/payload retention, reconciliation implementation,
duplicate-write lock, policy, server endpoints, and renderer are unchanged.
No automatic conversion, flattening, or export was added.

## Validation

The new regression suite was written and run before implementation: four
expected failures reproduced in-flight red warnings and absent source admission,
with three positive cases already passing. After implementation and the existing
dialog harness dependency update, the focused run passed **47 tests / 6 files**:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH node node_modules/vitest/vitest.mjs run test/components/emailComposerSaveWarning.test.ts test/components/figflowDraftDialog.test.ts test/components/emailDesignLibraryComposerRecovery.test.ts test/app/edmDesignRoundtrip.test.ts test/unit/edmFigflowLibrary.test.ts test/components/edmFigflowHandoff.test.ts --cache=false --maxWorkers=1
```

Focused ESLint passed for the composer and both touched test files.
`git diff --check` passed. Vitest emitted its existing configuration warning
about `__dirname` and future native config loading; there were no Vue warnings
in the final run. No full build/suite, native execution, browser, database,
provider, deployment, or dependency-install commands were run.

## Parent-owned verification and integration

This is local scoped component evidence, not live Safari or native-WASM
acceptance. Parent must verify the Geely draft's informational guidance before
opening, continued composer save, a supported structured/native draft opening,
normal in-flight progress, and recovery after an actually uncertain action in
the deployed candidate. The source helper cannot create native editability for
HTML; fresh server authorization and canonical admission remain authoritative.

The worker made no staging, commit, reset, merge, fetch, or release changes.
The pre-existing staged composer diff remained byte-identical (SHA-256
`5c56b4b80cf1172ae3c961e814f8a8065004dae0537b6604cec42df657e5d27b`).
At inspection, branch `adme-dev/figflow-authoring-20261102` was at
`f6148340322de2ce7d067f22cba121e07a3cfa31`; locally recorded `origin/main` was
`ed7a92f28741af6de370131fa688d7ee4e17dd12` (14 ahead / 2 behind).
These are local ref observations, not freshly fetched release evidence; parent
owns current-main reconciliation and release integrity.
