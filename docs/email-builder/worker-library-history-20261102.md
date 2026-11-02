# Canonical library and history — 2 November 2026

Base: `3f42719006f216457a8be9ce77c353cc4ea65ea1`; branch: `adme-dev/figflow-library-history-20261102`. Old conditional branch retained.

Implementation sequence: strict shared commands and current-policy restore derivation; transactional template publication/copy and revision list/preview/restore; composer library/history controls and exact-payload reconciliation; focused authority/concurrency/recovery/UI verification and full changed-file review.

Design: extend the existing composer with bounded slideovers. Use the dashboard's semantic palette (default/elevated/muted/primary), existing sans typography, clear version selection and a large document preview. A single scroll owner contains the catalog, review and action sections. Nuxt UI fields carry labels; explicit override checkboxes sit immediately above publication and instance update controls. Existing template/module/media owners and immutable revision receipts remain authoritative.

Constraints: no installs, remote DB, provider requests, sends, deployment, full Nuxt/Cargo build, native/runtime registration or other worker edits. Node 24.18.0, cache-disabled single-worker Vitest. Parent registers new routes and owns release verification.

## Checkout and ownership

The restarted dispatch found the existing implementation dirty at the exact requested base. The coordinator explicitly confirmed that the prior worker had exited, assigned the preserved files to this dispatch, and superseded the original clean-start instruction: continue the existing branch without creating/resetting another branch or discarding work. No other editor's files or root integration checkout were changed. This is an integration candidate from the assigned base, not evidence of inclusion in current main or a release.

## Delivered workflow

- The existing composer opens bounded Nuxt UI library/history slideovers using trusted `libraryAuthoring` discovery. Saved-state, source/head, local-conflict, active handoff, condition, brand, and unknown-write guards gate actions.
- Modules publish/revise from a saved canonical selection, preview an immutable selected version, insert with pinned provenance, explicitly update one linked instance with preserve/discard review, and detach. Versioned modules and drafts cannot fall through the fragment copy/save paths. Local review resets when the selected instance/version or override choice changes.
- The existing image picker uploads to `/api/agency/email/assets/upload`, carries the draft's client scope, and chooses registered media. Canonical selection filters foreign scopes and unsupported media; publication and insertion use the existing registered-byte descriptor and signed delivery owner. The canonical picker consistently displays/enforces JPEG/PNG/GIF and 10 MB.
- Template publication creates an `edm_templates` library owner and immutable canonical revision atomically. Library copy/duplicate creates a separate draft from the exact selected revision and expected source head. Blocks, module instances, dependency pins, asset descriptors, policy, lineage and pinned brand source survive; shared templates can be copied into an authorized client, while client templates cannot widen or cross client scope.
- Agency publication authority is fresh and separate from source read and destination designer authority. All are rechecked across asynchronous rendering/storage boundaries. Publication requires review of the actual saved local override paths.
- Server history lists the immutable parent chain with bounded pagination, previews exact stored revisions, and restores by appending a successor under expected-head CAS. Strict commands name stored revisions; the browser supplies no replacement design JSON. Current scope, source/brand, content grants and locks govern the result. Restored node/instance/lineage IDs and immutable receipts remain intact; reintroduced nodes gain no historical content permissions.
- Actor/action advisory locks and payload digests bind immutable receipts. Revision and asset publication reject cross-owner action reuse; template/module/history commands reject cross-command or changed-payload reuse. Unknown replies retain the original action/payload and baseline through receipt/readback failures, including a subsequent 403. Exact readback never silently adopts an intervening head; composer acceptance also compares intervening local document and metadata edits before one undoable application.

Review reproduced and fixed an inherited-lock restore bypass through reintroduced descendant styles, unknown-action loss after a rejected retry, stale instance-update review, a misleading canonical image byte-limit label, and a newly introduced Save guard that blocked the existing nested FigFlow save. Regression tests were observed failing before these fixes and passing afterward. The Save guard now blocks an active canonical library/history action while preserving the established `beginFigflow()` save inside `designFlow.run()`.

## Parent integration contract

Register these exact handlers in the parent-owned runtime route registration:

| Method | Route | Handler |
| --- | --- | --- |
| POST | `/api/email/design/templates` | `server/api/email/design/templates.post.ts` |
| GET | `/api/email/design/templates/:templateId/:revisionId` | `server/api/email/design/templates/[templateId]/[revisionId].get.ts` |
| POST | `/api/email/design/history` | `server/api/email/design/history.post.ts` |

The existing immutable module GET route `/api/email/design/modules/:moduleId/:revisionId` additionally accepts `?preview=1` for server-rendered preview. Existing module POST, asset publication, registered-media upload/list, template list/read and roundtrip discovery owners remain in use.

No new feature flag or migration is required. The new routes use the existing `designLibrarySession` checks for `FIGFLOW_EDM_DRAFT_SAVES_ENABLED`, `FIGFLOW_EDM_DESIGNER_ENABLED`, and `FIGFLOW_EDM_LIBRARY_ENABLED`, plus the established mutation origin/session boundary and `FIGFLOW_EDM_APP_ORIGIN`. Migration 497 is unused and unreserved. Runtime registration/config, native bridge, renderer, campaign final-send, public feature-page release messaging, deployment and hosted acceptance remain parent-owned.

## Verification

All commands used exact Node `v24.18.0` via `PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH`, existing dependencies only, and `vitest run --cache=false --maxWorkers=1`.

- Focused regression suite: **60 files passed, 537 tests passed**, exit 0 (20.77 seconds). It includes all matching email design/template/condition suites under `test/unit`, `test/app`, `test/components`, and `test/server`, plus `emailEdmImageLibraryPicker.test.ts`; the separate draft-dialog harness is reported below. The filename selection contains `emailDesign`, `edmDesign`, `edmConditions`, `edmCanonical`, `figflowTemplate`, `emailTemplate`, `edmTemplate`, `emailEdmTemplate`, or `emailEdmImageLibraryPicker`.
- Shared/persistence coverage: fresh publisher/read/designer authority and revocation during render, stale and concurrent CAS, lost commit replies, exact immutable receipt replay after later heads, cross-command/action reuse, module scope and pin retention, registered asset digest/scope retention, explicit local override review, shared/client template copying, structural history undo, current content grants, current inherited locks, and unchanged campaign fixtures.
- UI/composable coverage: trusted discovery, immutable previews/selection, insert and explicit update review, labelled Nuxt UI fields and bounded scroll, canonical template copy versus legacy CRUD, exact-payload reconciliation, original pending action after rejected retry, intervening local document/metadata/head edits, one undoable confirmed application, scoped registered image upload/pick, and the nested Save regression.
- All six changed Vue SFCs parsed and compiled with the installed `@vue/compiler-sfc` (`compileScript` and `compileTemplate`, using binding metadata). No full Nuxt or Cargo build ran.
- Scoped TypeScript compiler API check: 17 changed production `.ts` files, zero diagnostics attributed to those files. It uses the generated server aliases, `strict: false`, `skipLibCheck`, no emit, and a typed `$fetch` declaration. There are 31 transitive diagnostics outside changed files, primarily omitted framework globals in this deliberately scoped program; this is not a clean whole-project typecheck or Vue template typecheck.
- Scoped ESLint comparison: zero introduced diagnostics across changed `.ts`/`.vue` files. `TemplatesPanel.vue` retains 114 errors and 6 warnings, compared with 115 errors and 6 warnings in base `3f4271900`; baseline diagnostics were compared by rule/message/source text, not merely by total count. All other changed code files are clean. `git diff --check` passes.
- Every changed/new file was reread through the final implementation, including the composer shell and existing owner interactions. Review checked server aliases, nonempty select sentinels, reactivity, duplicate sections, semantic styles, preserved source/pins/policy, absence of URL fetching, strict commands, transactional receipts and scope boundaries.

### Separate existing draft-dialog harness limitation

`pnpm exec vitest run --cache=false --maxWorkers=1 test/components/figflowDraftDialog.test.ts` fails 8/8 tests in this assigned base. Each fails during the extracted setup `new Function(...)` with `ReferenceError: ref is not defined`, before the dialog assertions execute: its validation slice now includes condition setup but its injected arguments do not provide those dependencies. The coordinator reported a repaired harness in root and retained ownership of integrating it. This file was not edited or silently counted as passing. Parent must rerun the repaired harness together with this candidate and complete core bridge acceptance; the added executable Save regression does not replace that gate.

## Boundaries and remaining acceptance

This work is locally verified implementation, not configured-database, hosted runtime, native/WASM, employee, customer-event, or release acceptance. Transaction tests use serialized in-memory SQL/storage/renderer fixtures and do not prove real PostgreSQL locking/triggers or R2 behavior. No configured/remote database, providers, send, deployment, installation, full build, or native/runtime registration was invoked.

Unsupported native-artifact publication and unsupported unregistered/legacy HTML media mapping fail closed. Legacy revision history remains visible but cannot be restored as canonical structured JSON. Current-lock conflicts are conservatively blocked rather than restoring obsolete authority. Pending actions remain in the mounted composer/template-copy owner; a newer remote head never becomes retry authority. After parent integration, verify the three registered routes, current-role discovery, the repaired draft-dialog/core bridge flow, and the complete library/template/history workflow in the authorized hosted environment before any release claim.
