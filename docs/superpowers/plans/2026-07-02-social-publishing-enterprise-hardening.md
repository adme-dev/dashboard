# Social Publishing Enterprise Hardening

Date: 2026-07-02

## Goal

Make the social content calendar, scheduler, publishing dispatch, provider connections, and engagement wall safe enough for production agency use across multiple clients and platforms.

## P0 - Authority And Tenant Safety

- [x] Lock post state transitions on the server.
  - [x] Create and generic patch endpoints cannot set `approved`, `scheduled`, `approved_at`, `approved_by`, or approval request fields directly.
  - [x] Approval request, approve, reject, and publish are explicit transitions.
  - [x] Add a first-class schedule transition if we keep `status='scheduled'`.
  - [x] Creative users can draft/request approval; management users approve/reject.
  - [x] Content-changing edits to approved/scheduled posts reset approval; published posts reject content edits.
- [x] Apply `requireSocialClientAccess()` consistently.
  - [x] Posts list/create/get/patch/delete/publish/request-approval/approve/reject.
  - [x] Accounts list/connect/pending/complete/delete.
  - [x] OAuth callbacks re-check client access from signed state before token exchange, pending selection, or account upsert.
  - [x] Calendar, queue, wall, analytics, nav counts, approvals.
  - [x] Planner campaigns, slots, board endpoints.
  - [x] AI plan generation endpoint requires access to the requested client.
- [x] Make manual publish idempotent.
  - [x] Use atomic `UPDATE ... WHERE status='approved' RETURNING *`.
  - [x] Return conflict when a concurrent request already claimed the row.
- [x] Add route tests for post, account, calendar, queue, wall, analytics, nav count, approval, planner, and OAuth authorization rules.

## P1 - Server-Side Validation

- [x] Validate request bodies at API boundaries.
  - [x] Supported platforms only.
  - [x] Account ids must be active, same client, and match selected platforms.
  - [x] Scheduled timestamps must be valid ISO datetimes.
  - [x] Platform overrides must be bounded objects with supported keys.
  - [x] Media arrays must be size bounded and URL-like.
- [x] Enforce platform publish prerequisites before dispatch.
  - [x] Instagram requires media.
  - [x] YouTube requires video.
  - [x] Google Business requires account/location metadata.
  - [x] LinkedIn/TikTok/YouTube publish attempts require connected OAuth rows.
  - [x] Manual and scheduled dispatch refuse reconnect-required accounts before provider calls.

## P2 - Dispatch Model Completeness

- [x] Replace implicit `platforms[] + account_ids[]` fan-out with explicit targets.
  - [x] Target shape: `{ platform, accountId, options }`.
  - [x] Support multiple accounts per platform.
  - [x] Persist per-target results without overwriting same-platform outcomes.
- [x] Deliver currently stored composer fields.
  - [x] Publish `first_comment` after successful provider post where supported.
  - [x] Pass `linkUrl` to providers as structured link/CTA options where supported.
  - [x] Add provider options for Instagram reels/stories, Google Business CTA/event/offer, YouTube metadata.

## P3 - Platform Connection Completion

- [ ] Meta: verify Facebook + linked Instagram connection, token refresh posture, and reconnect UX.
  - [x] Surface server-derived publishing account health without returning raw access/refresh tokens.
  - [x] Flag expiring/expired non-refreshable Meta tokens and show reconnect UX on the publishing accounts page.
  - [x] Cross-check linked Instagram rows against the connected Facebook Page row for the same client.
  - [x] Surface Meta webhook subscription gaps as operational attention without forcing unnecessary reconnects.
  - [x] Block reconnect-required accounts in composer binding and post-create/update target validation.
  - [x] Block reconnect-required accounts again at manual and scheduled publish dispatch time.
  - [ ] Run live provider smoke for Facebook Page + linked Instagram account discovery and reconnect.
- [x] Google Business: expose publishing-capable locations in publishing accounts, not only inbox settings.
- [ ] LinkedIn/TikTok/YouTube: add OAuth connection flows, token refresh, account listing, connection health, and provider smoke tests before advertising as live.
  - [x] Remove planned platforms from new compose, AI-plan, and posting-slot selection until publishing OAuth is complete.
  - [x] Document planned-provider readiness in the shared platform registry and accounts UI so paid-media OAuth is not confused with organic publishing OAuth.
  - [x] Reject new create/patch API targets for planned providers until organic publishing onboarding is production-ready.
  - [x] Reject planned providers in AI plan generation before model calls.
  - [x] Reject planned providers in AI scheduling proposals and Video Studio social draft defaults.
  - [x] Add YouTube OAuth/channel-discovery foundation behind the production-ready publishing guard.
  - [x] Add LinkedIn organic OAuth/organization-discovery foundation behind the production-ready publishing guard.
  - [x] Add TikTok Content Posting OAuth/creator-discovery foundation behind the production-ready publishing guard.
  - [x] Add provider-specific OAuth and account discovery foundations for YouTube, LinkedIn, and TikTok behind the production-ready publishing guard.
  - [x] Surface connected planned-provider accounts as publishing-disabled and block legacy publish dispatch before provider API calls.
  - [x] Keep active planned-provider accounts publishing-disabled even when stored tokens are expired, so the UI does not present reconnect actions for providers that are not advertised as live.
  - [ ] Add provider token refresh and connection health.
    - [x] Refresh YouTube, LinkedIn organic, and TikTok Content Posting tokens before inbox polling when a refresh token is available.
    - [x] Refresh Google Business tokens through shared token persistence before live publish dispatch and clear stale account errors after a successful refresh.
    - [x] Record account-level `last_error` on provider token refresh failure so publishing account health reflects bad refresh credentials.
    - [ ] Wire provider refresh into live publishing once each provider is approved and advertised as production-ready.
  - [ ] Add provider smoke tests and live verification evidence.

## P4 - Engagement Attribution

- [x] Link inbound engagement to managed posts.
  - [x] Match source platform post ids against `social_posts.platform_results`.
  - [x] Populate `social_conversations.linked_social_post_id` on new inbound messages.
  - [x] Backfill existing conversations where platform ids match.
- [x] Surface managed-post engagement on both Social Wall and Engagement Wall.

## P5 - Observability And Operations

- [x] Add audit entries for create/update/request/approve/reject/schedule/publish/disconnect.
- [x] Add structured logs for publish attempts and provider failures.
- [x] Add a Cloudflare Workflows publishing callback bridge.
  - [x] Standalone `agency-workflows` Worker calls the Pages internal publish callback with `x-workflow-secret`.
  - [x] Pages callback validates the workflow secret, feature flag, and payload before touching publishing state.
  - [x] Manual publish, cron dispatch, and workflow callback share one atomic claim/publish/persist dispatcher.
  - [x] Already-claimed or already-published posts return an idempotent skipped acknowledgement instead of double-publishing.
  - [x] Unexpected dispatch failures after claim are persisted as failed publish attempts instead of leaving rows in `publishing`.
  - [x] Add the Pages-to-Worker start/service-binding kickoff for explicit schedule and approval auto-schedule transitions.
  - [x] Add an admin readiness check for Pages flags, secret presence, service-binding/fallback transport, and Worker `/health`.
  - [ ] Cut over scheduled publishing from cron after production verification.
- [x] Add backlog and repeated-failure alerts for scheduler and metrics sync.
  - [x] Scheduler dispatch returns health and warns on saturated due backlog / exhausted retries.
  - [x] Metrics sync returns health and warns on provider/account/post metric failures.
- [x] Add static light/dark theme guard for compose, accounts, calendar, queue, wall, planner, approvals, analytics, and engagement wall surfaces.
- [ ] Add light/dark browser smoke checks for compose, accounts, calendar, queue, wall, and engagement wall.
  - [x] Add Playwright smoke command requiring explicit auth token or storage state.
  - [x] Support both `SOCIAL_SMOKE_*` and `SOCIAL_PUBLISHING_SMOKE_*` auth env aliases.
  - [ ] Run authenticated smoke against local or production social publishing routes.

## P6 - Release Gates

- [x] Add a strict social publishing regression command for the hardening suite.
- [x] Run the social publishing regression command in CI before production deploys.
- [x] Run CI on pull requests to `main`, not only pushes.
- [x] Use frozen lockfile installs in CI.
- [x] Keep known repo-wide lint/typecheck debt out of the deploy-critical lane until those checks are reliable enough to enforce.
- [x] Smoke the public Cloudflare Pages origin after production deploy.

## First Implementation Slice

Start with P0 for posts only:

- [x] Tests fail for unsafe status write and missing client access.
- [x] Create always stores `draft` and validates targets.
- [x] Patch rejects controlled approval/status fields.
- [x] Get/patch/delete/publish require client access from the row's `client_id`.
- [x] Manual publish atomically claims approved posts.
- [x] Approval request/approve/reject require client access and scope writes by `client_id`.
- [x] Composer/planner UI no longer sends workflow status in create/update bodies.

## Verification Notes

- [x] Expanded social publishing/inbox/AI test surface passes: `pnpm exec vitest run test/social test/server/utils/socialPublishingNavCounts.test.ts test/server/api/publishingPlannerAgentEndpoint.test.ts test/app/publishingPlannerAgentPanel.test.ts test/ai/tools/scheduleSocialPost.test.ts test/ai/executors.test.ts` reported 96 files and 611 tests passing.
- [x] Targeted hardening lint passes for the new provider OAuth, publishing guards/readiness, token refresh, theme smoke script, and focused access/audit/metrics tests.
- [x] Production build passes: `pnpm run build` completed Nuxt client, SSR, Nitro Cloudflare Pages output, and `scripts/wrap-worker.mjs`.
- [x] Social publishing regression suite is now a first-class package script: `pnpm run test:social-publishing`.
- [x] Workflow callback focused tests pass: `pnpm exec vitest run test/server/api/socialPublishingWorkflowCallback.test.ts test/server/middleware/authInternalBypass.test.ts test/social/publishDispatch.test.ts` reported 24 tests passing.
- [x] Workflow callback scoped lint passes across the callback route, shared dispatcher, workflow contract, refactored manual/cron routes, middleware, and focused tests.
- [x] Workflow kickoff focused tests pass: `pnpm exec vitest run test/server/utils/agencyWorkflowsClient.test.ts test/social/slotsQueueApprovals.test.ts test/config/agencyWorkflowsBindings.test.ts` reported 23 tests passing.
- [x] Workflow readiness focused tests pass: `pnpm exec vitest run test/server/utils/agencyWorkflowsClient.test.ts test/server/api/socialPublishingWorkflowReadiness.test.ts` reported 12 tests passing.
- [x] Workflow readiness scoped lint passes across the readiness endpoint, workflow client, and focused tests.
- [x] Production build passes after the workflow readiness endpoint: `pnpm run build` completed Nuxt, Nitro Cloudflare Pages output, and `scripts/wrap-worker.mjs`.
- [x] Diff integrity passes; token-shaped scans found only known dummy fixtures in `test/social/socialInboxTokenRefresh.test.ts` on tracked lines and no matches in untracked files.
- [ ] Full Nuxt typecheck remains blocked by repository-wide type debt outside this slice. A longer `pnpm run typecheck` emitted repo-wide diagnostics after approximately 4 minutes; a filtered server-side rerun for the workflow callback/dispatcher files produced no matching diagnostics before the run was stopped.
- [ ] Authenticated browser smoke remains blocked until an explicit `SOCIAL_SMOKE_AUTH_TOKEN`, `SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN`, `SOCIAL_SMOKE_STORAGE_STATE`, or `SOCIAL_PUBLISHING_SMOKE_STORAGE_STATE` is provided.
- [ ] Live provider smoke remains blocked until production Meta/Google/YouTube/LinkedIn/TikTok app credentials and approved test accounts are available.
