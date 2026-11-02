# M01 merge-tag authoring worker — 2 November 2026

## Implemented boundary

The existing EDM composer now supplies a supported token picker in the Text toolbar and the selected Text/Heading/Button property panel, plus subject and preview-text pickers in the existing Save dialog. The property and metadata pickers append the token; the Text toolbar inserts at the selected range/caret using a logical bookmark that survives blur and reactive rendering. Text chips are non-editable spans during editing and serialize to canonical token strings before storage; only a validated `data-merge` attribute is accepted by the inline sanitizer. The existing canvas sanitizer retains safe presentation during hydration, and the existing strict inline whitelist still controls every edit commit.

Custom definitions are scoped to an explicit client and contain `name`, `token`, `preview_value`, `fallback`, and `client_id`. The contract uses the `custom_` namespace, ensuring definitions cannot shadow sender-owned `email`, `name`, `first_name`, or `unsubscribe_url`. No arbitrary subscriber property is presented as available recipient data. A custom definition inserts a canonical literal such as `{{custom_offer | Ask our team}}`; its sample value is used only when Preview as is set to Sample values. Editing or deleting a definition never rewrites existing document content, metadata, campaign HTML, or recipient snapshots. Existing inserted tokens keep their original literal fallback.

The catalog has authenticated client-scoped GET/POST/PATCH/DELETE routes under `/api/agency/email/merge-tags`. Reads call `requireAuth`, mutations call `requireWriteAccess`, every route calls the existing `assertEmailClientAccess`, and all storage reads/updates/deletes include the authorized client in their SQL predicate. Updates cannot change token or client identity. Duplicate token creation returns 409; inaccessible scope returns 403; a definition absent in an authorized client returns 404. No subscriber records or provider data are queried.

Migration `494_email_merge_tag_definitions.sql` adds only the authoring catalog, with client foreign key, unique client/token key, validation constraints and timestamps. **It has not been applied. The coordinator owns database execution**, explicitly overriding the general automatic-migration instruction for this dispatch.

## Preview contract and limits

The actual `/api/email/templates/render` request accepts `variables`, forwarding them through `DocumentRenderOptions` to the private renderer. The UI uses that contract, rather than sending `merge_fields` directly. Sample mode supplies the supported sender keys with invented example.invalid values and client custom sample values. Authored mode omits variables; behavior depends on the integrated renderer, so the UI labels it Authored tokens and fallbacks and explains unsupported tokens can remain visible in preview but become empty at delivery.

Preview as never fetches a recipient or calls a test-send/schedule/send endpoint. Sender sample values are transient; custom sample values are explicitly saved catalog data. A client switch clears the previous catalog and transient sender samples synchronously, resets preview mode and fences late catalog responses. Builder preview requests also fence superseded responses. Subject and preview-text display are read from the rendered HTML without executing it; the existing preview iframe remains sandboxed.

The parent owns `shared/emailRendering/mergeTags.ts`, renderer replacement semantics and campaign send formatting. This worker did not copy or cherry-pick the parent's branch or edit those files. Parent confirmed it implemented plain subject/preheader resolution before escaping and independent body resolution before assembling the wrapper, preserving one-pass semantics for recipient-inserted tokens; compiler-escaped fallback punctuation is decoded once before output encoding and quote punctuation remains allowed in fallbacks. Parent renderer tests are parent-reported, not independently re-run by this worker. That renderer integration is required to establish final metadata/render behavior.

Custom fallback literals are trimmed, nonempty and limited to 200 characters; token names use lowercase letters/numbers/underscores after `custom_`. Fallbacks exclude braces, pipe, ampersand, angle brackets and control characters to avoid ambiguous token/HTML encoding across supported fields. Sample values may contain arbitrary literal text within 256 characters and are encoded by the parent renderer. Unsupported legacy/manual token syntax remains ordinary visible text rather than a trusted chip. No FigFlow-native chip implementation is claimed.

The manager and sample controls use Nuxt UI, `UFormField`, full-width controls, container-aware field columns, semantic colours and bounded scrolling. The existing metadata dialog and preview content have explicit bounded scroll regions.

## Verification

Node 24.22.1; no package installs, lockfile changes, shared dependency mutations, full Nuxt builds or Rust builds.

```sh
RUN_REAL_BROWSER_TESTS=true pnpm exec vitest run \
  test/unit/emailMergeDefinitions.test.ts \
  test/utils/edmMergeChips.test.ts \
  test/utils/edmInlineText.test.ts \
  test/utils/edmInlineTextRealBrowser.test.ts \
  test/server/emailMergeDefinitionStorage.test.ts \
  test/server/api/emailMergeDefinitions.test.ts \
  test/app/edmMergeAuthoring.test.ts \
  test/components/edmMergeAuthoring.test.ts \
  test/app/edmBuilderStore.test.ts \
  test/utils/emailBuilderTestSend.test.ts \
  test/utils/emailBuilderSchedule.test.ts --no-cache
```

Result: 11 files, 88 tests passed. Includes real Chromium parsing, chip serialization and atomic deletion; mounted picker/Text/property surfaces; sample-only requests; stale client-response fencing; reserved-key rejection; authenticated/cross-client API denial; scoped SQL; and existing store/test-send/schedule contracts. The real-browser harness now bundles the helper with existing esbuild so browser module imports are resolved. It uses an isolated temporary Chromium profile, never a logged-in staff browser.

Scoped ESLint over all changed production and test code passed with zero errors and two existing `vue/no-v-html` warnings in the renderer. An isolated strict TypeScript program checked the shared definition contract, merge composable and inline helper, using existing dependencies and a temporary `$fetch` declaration; it did not claim full-repository typecheck cleanliness. Vue compiler-sfc parsed and compiled script/template for all five touched Vue components (5/5 passed). `git diff --check` passed. The Vitest command disables cache writes.

## Parent integration and remaining acceptance

- Apply migration 494 after schema review, then exercise authenticated real-client catalog CRUD and unauthorized/cross-client denial against the deployed API.
- Integrate the parent bounded resolver and confirmed metadata ordering fix; verify the actual rendered subject, preheader, Text, Heading and Button output with custom samples, literal fallbacks, quotes and empty values.
- Preserve parent's concurrent FigFlow handoff controls when integrating the narrow builder hunks. No parent handoff controls, runtime config, CI, provider or deployment files changed here.
- Public feature-page copy sync is explicitly parent-owned for the combined final scope; no new top-level navigation category is introduced.
- Run the real builder in the hosted/authenticated UI for keyboard editing, toolbar focus/placement, narrow-width scrolling, dark mode and saved/reloaded content. Local component and parser proofs do not establish hosted, full native, real-client, provider-send or employee acceptance.
- Scheduling/delivery code is untouched; the authoring catalog has no dependency from those paths. Do not join mutable definitions into scheduled snapshot resolution later.
