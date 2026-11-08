# Video workspace developer handoff

## Scope and routes

Video projects use `/agency/audio/projects?mediaType=av`; audio and all-project views remain at the canonical projects route. The editor is `/agency/audio/projects/:id`. Both use the agency layout and creative-role middleware. The screenshot-directed workspace borrows Freefield's media-first gallery and control/preview arrangement, not its GPU execution platform or data model. Reference revision: `neuregex/freefield@e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca`.

`VideoStudioWorkspaceHeader` and `VideoStudioProjectGallery` provide project navigation, search, client/status filters and remembered grid/list presentation. `ProjectEditor.client.vue` retains canonical timeline and storyboard services. `VideoStudioWorkbench` owns bounded pane scrolling, preview/library/history/help tabs and mobile navigation. `VideoStudioFeatureMenu` selects tools or the next request's model; selecting a model never submits it.

## Data and authority

- Projects: `/api/agency/audio/projects` and existing project-ID routes. Create uses one idempotency identity for a request and its retries. AV projects receive the server's canonical empty timeline; audio projects retain their existing initial-state contract.
- Gallery covers: `server/utils/audio/projectCovers.ts` projects an existing video asset thumbnail only when the actor, project ownership, client and source-project association permit access. It returns an authenticated thumbnail URL or null. No timeline scraping, background extraction, signing of arbitrary keys or synthetic media. Read-only roles currently receive no covers because the canonical thumbnail route requires write access.
- Storyboard: existing `useVideoStoryboard` and `/api/agency/video/projects/:id/storyboard` contracts retain draft, candidate, approval, application and ambiguous-operation recovery. Reviewed application and tenant/project authorization remain mandatory.
- Models: read `/api/agency/video/generation/models?projectId=...`. The server remains authoritative for tenant eligibility, provider configuration, source approval, quote and budget. Model choice is request-level; there is no new persistent project model default or provider credential form.
- History: existing render jobs and `useVideoGenerationJobs` records. Reading history does not retry, generate, publish or modify a project. Existing explicit output actions retain their handlers.

## Flags and local setup

Use Node 24.18.0 and the repository's frozen pnpm lockfile. Run `pnpm install --frozen-lockfile`, `pnpm exec nuxt prepare`, then `pnpm dev` in an owned checkout. Production credentials must not be copied into test fixtures. DB integration tests use their documented disposable localhost database guards.

The shared storyboard policy defaults on when absent, enables only literal `true` when supplied, and honors explicit `false` or malformed values as disabled. Cloudflare event bindings are authoritative over process environment. The public config applies the same build-time policy; disabling the server binding takes effect independently of a previously built UI, which requires a rebuild to hide the entry.

For the authorized production pilot build, mirror the existing server capabilities with `VIDEO_STUDIO_ENABLED=true VIDEO_GENERATION_ENABLED=true`, preserve `SEARCH_AUTHORITY_ENABLED=true`, and keep the 10 GiB build ceiling. Do not add redundant bindings beyond Pages capacity. The existing public asset-harness flag is coupled to VIDEO_GENERATION_ENABLED in nuxt.config.ts, so this build also exposes the implemented asset-preparation panel. No separate harness/provider binding is added. Its model catalogue includes disabled entries and registry defaults; listing/defaultEnabled is not proof of provider execution. Research-only R2/R3 capabilities are not promoted. Preserve tenant caps, approval, quotes and submission controls.

Release only fresh reconciled main after exact-head CI and the documented zero-new-type-diagnostics comparison. Run `pnpm deploy:check` then `pnpm deploy:production` for immutable `agency-dashboard`; record source, deployment ID, public flags and read-only live checks in the release receipt. Do not redeploy audio-jobs merely for presentation changes. Its external runtime remains under a separate ownership hold.

## Verification and honest limits

Focused tests cover cover-access restrictions, absent/failed previews, gallery filters and action emissions, tab/preview preservation and model selection without submission. Review both desktop and narrow layouts and verify actual authenticated routes after deployment. Existing projects must retain edits, versions and approval receipts.

A listed model and configured credentials demonstrate capability discovery, not successful provider execution. No paid provider run is part of this UI verification. Full pilot acceptance, physical-device render acceptance and research-only R2/R3 capability promotion remain separate. Missing thumbnails show a truthful empty preview; no example results are fabricated.

The implementation used actual Kimi CLI alias `kimi-code/k3.1-pro` for the three gallery/header/page files and Codex for authority projection, integration and independent review. Release evidence and exact acceptance limits live in the dated external release receipt, not in claims inferred from source existence.

## Changed-brand-kit recovery (T08)

An adjusted cut can explicitly reapprove its existing pinned brand kit after the canonical kit changes. The review snapshot offers only an accessible current kit, its old pin and current content hash. The operator inspects the kit in Banner Studio, supplies evidence and acknowledges the change before accepting the adjusted edit. Refresh or changed selections invalidate acknowledgements; an uncertain response retains the exact request for retry.

The server requires the same kit identity and both hashes, locks source/actor/client/font dependencies, and writes one immutable cut-scoped reference set together with any media approvals. The global storyboard reference set is unchanged and remains a revocation fence. The transaction rolls back if final render validation fails. This does not add, remove or replace a kit, approve unavailable sources, or bypass project authority. Existing review recovery remains accessible when new storyboard entry is disabled.

## T09 owned nonpaid acceptance runner

`scripts/video-storyboard-pilot-acceptance.mjs` drives the existing manual storyboard APIs; it is not a production pipeline and has no direct network, login, project-create, media-create, generation, render or publish capability. Use Node 24.18.0:

```bash
node scripts/video-storyboard-pilot-acceptance.mjs \
  --config /root-owned/t09-fixture.json \
  --adapter /root-owned/t09-browser-adapter.mjs \
  --receipt /root-owned/evidence/t09-receipt.json
```

The fixture must set `schemaVersion: 1`, `ownership: 'owned-disposable-nonpaid-t09'`, exact `origin`/`ownedHost`, `projectId`, `actorId`, `clientId`, `runId`, `approveCopy: true`, canonical `references`/`brandKit`, and the manual `plan` (`inputMode`, integer `durationSeconds`, `targetFormat`, exact `copy`, `shots`, optional recipe). Root prepares the owned project and canonical media separately. A fresh run refuses anything but an empty draft AV project whose creator is the session actor and whose storyboard, reference set and latest application are absent. This ownership check does not rely on `isTest`; that flag is only recorded.

The adapter module default-exports `async ({ origin, projectId }) => ({ actorId, request, close? })`. `request({ projectId, method, path, body?, headers? })` must use the root-owned authenticated browser/session, remain bound to the exact origin, forward the supplied idempotency header, reject non-success responses with a numeric `status` or `statusCode`, and return parsed canonical JSON. It must not log response bodies or broaden the supplied route. Keep the adapter and all session material outside fixtures and receipts. Without that explicit adapter the runner fails closed.

The runner permits only project/storyboard reads, reference save, manual plan/candidate acceptance, resolve, apply/recovery and timeline review. It uses deterministic operation IDs, stable `Idempotency-Key` headers and the exact initial timeline ID/edit revision. Apply is issued twice with the identical body to prove receipt replay, then recovered by operation ID; an ambiguous first response is recovered before replay. Review is a no-op review of the unchanged applied cut (`obligationMappings: []`), also replayed and read back. It is not adjusted-edit acceptance.

Stdout is JSON-lines progress. The atomic mode-`0600` receipt stores IDs, hashes, findings and coverage limits, not copy, reference evidence notes, media locators, sessions or credentials. Retry an interrupted run with the identical fixture/run ID/receipt; it re-resolves before an unfinished apply rather than storing resolved media. A changed fixture requires a new run ID. A completed receipt resumes with read-only preflight and no writes. Focused check: `pnpm exec vitest run test/video/storyboardPilotAcceptance.test.ts` (5 tests passing on this source slice). The root-owned browser adapter has separately completed the manual hosted fixture described below; the generic runner also passes against disposable local Postgres.

## Remaining original-plan work

T01–T08 foundations are implemented; T08 includes bounded changed-brand-kit recovery. PR884–PR886 are merged. PR886 merge `40ad01146216cc7808d334612e27e0b3a5d5672f` was released on 6 November as Pages deployment `0a21b015-a984-4d97-845b-36a4ad660e6a`; older kit-recovery deployment-pending statements are historical. The 8 November source readback and bounded hosted results are recorded below.

T09 remains partial. Exact outstanding rows are A1 browser-inspected dealer assembly, A2 product/brand/source-reuse runs, A3 AI/copy revision cases, A4 role/tenancy/revocation negatives, A5 full multi-lane and no-partial-write cases, A6 two-tab/undo/refresh/adjusted-edit cases, A7 three-format visual/audio and bypass cases, A8 keyboard/narrow/dark/legacy/physical-device journeys, A13 recipe/example evidence, pilot baseline/completion/time measurements, and compatible rollback/flag-off enforcement. The runner cannot close these rows without their separate evidence. T10–T14, full R1/R2/R3 acceptance and FF-RD01–05 remain unaccepted; no paid generation or physical-device result is claimed. See the original 2026-11-04 producer PRD/plan for the detailed acceptance contract.

The gallery release is PR885, merged source `601500d7201b46c823b2daf884572cf200e49c68`, Pages deployment `2efcb595-631b-4f74-b17a-0e1bc1102565`. Authenticated gallery/create-dialog/model-selection/storyboard/history checks passed without paid generation or customer-project changes. Creation was cancelled; empty history and absent thumbnails remain truthful. The editor's inherited bucket GET may initialize metadata, so navigation is not a zero-write database audit.

## 8 November hosted follow-through

Fresh production readback identifies source `62776b77a337d82b5084c839cfd17c9c72847773`, Pages deployment `c5a665e3-a2e5-4de1-a3d2-8b11cf40c9db`. Authenticated public storyboard/studio/generation/search flags are true; 146 production settings were preserved. This supersedes the historical November 6 deployment IDs above.

The legitimately signed-in owner created a no-client disposable project `292c4921-0b7a-4c1c-96aa-d676146532ed`, uploaded an owned synthetic still, approved its exact content identity, and applied six editable shots/900 frames. Apply replay and operation recovery returned the same receipt; no-op review and a later trim review passed. An obsolete timeline edit token was rejected with 409. The browser displayed all six clips and the actual still. Sample prefill left the saved revision/reference pointers unchanged. These are owner/manual/synthetic-fixture results, not dealer-copy, voice, ordinary-role, physical-device or complete R1 acceptance.

A three-format render was accepted as job `3afe794d-4073-4469-98f8-1378846fbc9e` but failed because Cloudflare Workers reject Fetch `redirect: 'error'`. The repair uses `manual` and rejects non-success responses without following redirects. Render-history reads now bypass Hyperdrive caching; the editor retains the accepted job while waiting for history so an empty first read cannot stop polling. Hosted re-render remains pending the repaired Worker deployment; no successful hosted output is claimed yet.

Local real-Postgres checks cover canonical storyboard transactions and the nonpaid runner. Local Chrome/FFmpeg produced all three formats with audible fixture audio and exact-copy/hidden-content checks; this is macOS browser evidence, not a new Linux AMD64 or physical-device result. Authorization repairs consistently reuse the existing owner/admin-or-project-creator boundary for project listing, reads, media upload/download, history, rename and delete. Other staff access is tested locally without probing customer projects.

Evidence directory: `/Volumes/Backups/xf-video-followthrough-20261108/` (`production-hosted-check.json`, `hosted-t09.json`, `hosted-adjustment.json`, `hosted-six-shot-preview.png`, `local-render/receipt.json`, `t09-consolidated.log`). Source repairs are not production claims until their merge/deployment receipt is appended. T09 remains partial; T10–T14 and FF-RD01–05 are not accepted, and no paid provider submission was made.


### Independent review follow-through — 8 November

Claude Code 2.1.319 (reported model `claude-opus-5-5`) reviewed current-main T09 source and dashboard UX. Its confirmed render-distribution access finding is repaired in the pilot release candidate: save-to-library, send-to-portal and social-draft routes authorize the project before execution-ledger replay as well as before any side effect. Regression checks reject another project creator before job lookup, signing, asset/review/draft writes or caption generation. No customer export or provider call was used for verification. Dashboard UX findings are tracked separately; source review is not hosted acceptance.
