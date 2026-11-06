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

For the authorized production pilot build, mirror the existing server capabilities with `VIDEO_STUDIO_ENABLED=true VIDEO_GENERATION_ENABLED=true`, preserve `SEARCH_AUTHORITY_ENABLED=true`, and keep the 10 GiB build ceiling. Do not add redundant bindings beyond Pages capacity. Asset-harness/research flags are separate and are not enabled by this work. Preserve tenant caps, approval, quotes and submission controls.

Release only fresh reconciled main after exact-head CI and the documented zero-new-type-diagnostics comparison. Run `pnpm deploy:check` then `pnpm deploy:production` for immutable `agency-dashboard`; record source, deployment ID, public flags and read-only live checks in the release receipt. Do not redeploy audio-jobs merely for presentation changes. Its external runtime remains under a separate ownership hold.

## Verification and honest limits

Focused tests cover cover-access restrictions, absent/failed previews, gallery filters and action emissions, tab/preview preservation and model selection without submission. Review both desktop and narrow layouts and verify actual authenticated routes after deployment. Existing projects must retain edits, versions and approval receipts.

A listed model and configured credentials demonstrate capability discovery, not successful provider execution. No paid provider run is part of this UI verification. Full pilot acceptance, physical-device render acceptance and research-only R2/R3 capability promotion remain separate. Missing thumbnails show a truthful empty preview; no example results are fabricated.

The implementation used actual Kimi CLI alias `kimi-code/k3.1-pro` for the three gallery/header/page files and Codex for authority projection, integration and independent review. Release evidence and exact acceptance limits live in the dated external release receipt, not in claims inferred from source existence.
