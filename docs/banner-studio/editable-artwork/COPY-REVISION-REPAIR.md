# R09 saved copy revision repair

Date: 27 October 2026. Status: implemented and locally verified in the original shared workspace; no hosted or provider acceptance claimed.

## Contract and changes

Selected-copy requests require a valid UUID `projectId`, the selected format/layer, and explicit ISO `sourceRevision` from the actual saved project `updatedAt`. A partial selected-copy request returns 400. The client refuses generation for missing saved identity/revision or dirty artwork, sends the saved timestamp unchanged, and rejects responses whose echoed revision differs or is absent.

The route reads `id`, `client_id`, `created_by`, `updated_at`, and `canvas_data` directly through `queryOneFresh`; `effectScope.ts` is unchanged. It follows the access policy in `artwork.ts`: assigned projects require client access, while unassigned projects require their creator or all-client administrator access. It checks saved revision and selected text/protection before brand context, model assignment, or inference. Missing projects return 404; denied access returns 403; stale revisions/selections return 409.

After each attempted provider inference, the route reads fresh project state and checks ownership, saved revision, access, and the complete selected layer again. Changed/deleted projects or changed selections return 409. Lost client access returns 403. These checks run outside provider exception handlers, so stale Workers AI results cannot trigger Groq fallback; fallback results are checked too. Successful selected-copy responses echo the supplied saved revision and retain actual provider/model evidence. Legacy unscoped requests retain existing social-scope authorization and model-routing compatibility; they do not represent saved-project proposals.

The client retains synchronous invalidation for project, artboard, selection, and canvas changes, and additionally observes dirty-state changes. Preview remains transient. Apply updates only the captured selected layer once through existing history; one undo restores exact records and redo reapplies the text. Existing commercial/legal/merge-field/feed-binding/approved-copy protections and named-brand checks remain in place. No candidate persistence or automatic save was added.

## Owned files

- `app/composables/useBannerCopyProposal.ts`
- `server/api/agency/banner-studio/ai/copy-suggest.post.ts`
- `test/banner/copyProposal.test.ts`
- `test/server/api/bannerCopySuggest.test.ts`
- `docs/banner-studio/editable-artwork/COPY-REVISION-REPAIR.md`

## Verification

Runtime: Node `v24.18.0`.

Before implementation, the two modified test suites produced **21 failures / 13 passes**. Failures included missing revision transport, stale-before requests with unchanged selected text, deferred stale-after inference, missing access enforcement, dirty-state invalidation, and mismatched response revisions. After implementation, those 34 tests passed. Additional fallback and revision representation cases brought the modified suites to 38 tests.

Final focused regression command:

```sh
pnpm exec vitest run test/banner/copyProposal.test.ts test/server/api/bannerCopySuggest.test.ts test/banner/copyProtection.test.ts test/server/api/bannerStudioAiModelOpsRuntime.test.ts
```

Result: **4 files, 50 tests passed**. This includes unchanged Groq success, Workers AI stale success/failure, unchanged fallback success, stale fallback rejection, access denial/revocation, creator/admin handling, Date-valued database revisions, pending local edits/undo/reselection/saved-revision changes, preview isolation, exact neighboring protected text, and single-undo apply. Existing model routing tests remained unchanged and passed.

```sh
pnpm exec eslint app/composables/useBannerCopyProposal.ts server/api/agency/banner-studio/ai/copy-suggest.post.ts test/banner/copyProposal.test.ts test/server/api/bannerCopySuggest.test.ts
```

Result: exit 0, no errors or warnings. Scoped `git diff --check` also passed. Vitest emitted the existing config-loader advisory about `__dirname` in `vitest.config.ts`; tests succeeded.

## Evidence limits and integration handoff

These are local tests with mocked database/access/provider boundaries and the real client studio state/history implementation. They do not prove hosted access configuration, actual provider output, live database concurrency, or browser rendering. The route validates a point-in-time saved revision; it cannot reserve that revision after returning a transient proposal. Existing local invalidation and project save concurrency protection remain necessary.

No forms, dependencies, migrations, candidate writes, build, commit, or deployment were performed. Unrelated shared-worktree changes were preserved. The dispatched task required source changes in this original workspace rather than a new branch/worktree.

At review, branch `adme-dev/banner-editable-artwork` had no upstream, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`, and was 1 commit ahead / 4 behind freshly fetched `origin/main` (`d45326265f0dec387bd6ae3deb465b616a8f2b68`). This is local repair evidence, not release readiness; the coordinator owns reconciliation onto current main and any later hosted verification.
