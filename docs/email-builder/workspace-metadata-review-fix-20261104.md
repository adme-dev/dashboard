# Workspace metadata modal review correction — 4 November 2026

Follow-up to `a939107fe5303e680a86be54f231e4707a029b46`; local candidate for independent re-review, not release acceptance.

## Confirmed defects

The installed Nuxt UI `Modal.vue` defaults `modal` to true and uses Reka DialogContent to block outside interaction. The old metadata lost-response test used a permissive section stub, allowing an impossible click on the header Reconcile button while the modal had no accessible recovery action.

The old snapshot-pending flag was non-reactive and absent from input, dismissal and navigation guards. Back to design could close the dialog during a delayed snapshot, then a late no-op could write metadata and remount the native frame after editing resumed.

## Bounded correction

- An active uncertain metadata operation exposes **Reconcile email details** inside the modal. It calls the same existing reconcile function and preserves the exact retained operation payload and CAS revision. It also handles an uncertain continuation-open without leaving the modal.
- Snapshot pending is reactive. A single metadata lock covers the snapshot, write and uncertain-reply phases. Inputs, Save, Back, close icon, Escape/outside dismissal and navigation are blocked during that interval; the native surface remains inert.
- Modal open updates pass through a guarded handler rather than an unrestricted v-model assignment. Form values and handoff/document/head identity are captured at snapshot request time, then revalidated before a metadata write. Dirty, invalidated or unmounted reads cannot start metadata saving.
- Refusal/failure releases only the read lock, retains the user's entries, and requires a fresh explicit save. Confirmed open adoption clears the completed intent. No pending operation is silently discarded and no server/composable/API behavior changed.

## Executed evidence

Evidence directory: `.verification/workspace-completion-20261104/`.

1. `metadata-review-red.log`: new real-dialog regressions against a939 product source failed at both intended defects (missing in-modal reconciliation; enabled Back during snapshot), with 21 existing workspace tests passing.
2. `metadata-review-green.log`: initial correction passed 23 workspace tests.
3. `metadata-review-full.log`: final focused run passed **6 suites / 54 tests**, including four new regressions and conversion of the old uncertain metadata test to real dialog semantics.

Command:

```
node node_modules/vitest/vitest.mjs run --config .verification/workspace-completion-20261104/review.config.mjs
```

The modal-specific tests use actual installed Reka DialogRoot/Portal/Content/Title/Close primitives, matching Nuxt UI's modal=true and dismissal-prevention behavior. They assert actual outside pointer blocking, restrict user clicks to the active dialog, and verify accessible recovery, disabled controls, hidden close, Escape/navigation refusal, native inert state, exact retry identity, delayed no-op write/continuation, dirty refusal and late-unmount no-write behavior. They do not mount the complete Nuxt UI styling wrapper or prove hosted keyboard/device behavior.

Both modified implementation/test files were reread end-to-end. Vue script/template compilation and `git diff --check` passed. Tests used the existing resolver, own cache, one worker and disabled remote iframe loading; no install or heavy build ran.

## Remaining gates

Independent re-review of this follow-up commit and the previously recorded backend integration/hosted journey gates remain. No push, merge, deploy, configuration flag, database, publication or send action occurred. Native WASM evidence remains separate from application acceptance.
