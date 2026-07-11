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
  - [x] Require readiness to verify every active Workflow kind, not only the publishing workflow.
  - [x] Add an agency-wide Workflows readiness route and keep the social publishing route as a compatibility alias.
  - [x] Add an admin workflow instance status lookup through the Pages-to-Worker service binding/fallback transport.
  - [x] Allow admin workflow status lookup by deterministic workflow payload identity fields as well as exact instance id, so operators can inspect scheduled publishing and inbox automation instances without manually reconstructing Cloudflare Workflow ids.
  - [x] Make Worker health degrade when a required Cloudflare Workflow binding is missing.
  - [x] Add a repeatable authenticated production smoke gate for Workflows readiness and optional instance status lookup.
  - [x] Add a dedicated `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET` machine credential for Workflows readiness/status diagnostics, with GitHub Actions storing the raw secret, Pages deploy config storing `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256`, and admin JWT/cookie kept as operator fallbacks.
  - [x] Add a dormant Workflow-primary scheduled publishing cutover path behind `AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY=false`.
  - [x] Make deterministic Workflow starts idempotent so duplicate cron ticks reuse an existing Workflow instance instead of falling back to direct publish.
  - [x] Pin the `agency-workflows` package deploy script to its Worker config and add explicit dry-run scripts so root Pages deploy metadata cannot break Worker verification/deploys.
  - [x] Add an operator readiness gate, `pnpm run readiness:agency-workflows`, that checks git status, local Graphy architecture artifacts, workflow config tests, Worker typecheck, Worker deploy dry-run, and authenticated production smoke when admin auth is present.
  - [x] Make the readiness gate Graphy/Obsidian-aware: missing or stale `graphify-out/graph.json` + `GRAPH_REPORT.md` blocks cutover with remediation to regenerate the local Graphy vault, review it in locally installed Obsidian, and upload it via `scripts/upload-graphify.mjs`.
  - [x] Make the readiness gate automation-governance-aware: missing or weakened `docs/project-purpose.md` or ADR-003 blocks Workflows cutover before new automation drifts from the enterprise architecture decision.
  - [x] Make scheduled publishing Workflow starts schedule-attempt-specific and stale-callback safe.
    - [x] Include normalized `scheduledAt` in deterministic `social.post.publish` Workflow instance ids for scheduled/cron attempts while keeping manual starts per-post.
    - [x] Require workflow and cron fallback claims to match the row's current `scheduled_at` and only publish when that timestamp is due, so callbacks from old reschedules skip instead of publishing early.
  - [ ] Cut over scheduled publishing from cron after production verification.
    - [x] Regenerate/update Graphy after Workflows architecture changes so `graphify-out/` reflects the current `agency-workflows` Worker, Pages callbacks, cron fallback, and service-binding topology.
    - [ ] Run `pnpm run smoke:agency-workflows` against production with admin auth.
    - [ ] Run `pnpm run readiness:agency-workflows` and clear/acknowledge Graphy/auth smoke blockers before flipping the cutover flag.
    - [ ] Flip `AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY` to `"true"` in `wrangler.toml`.
    - [ ] Deploy Pages and verify cron starts `workflow_started` results while failed kickoff falls back to direct publish.
- [ ] Extend Cloudflare Workflows to automation workloads.
  - [x] Document the durable workflow direction for social inbox automation before cutover.
  - [x] Add a `social.inbox.automation` Workflow foundation that calls a single-conversation Pages callback through the shared automation engine.
  - [x] Start inbox automation workflows from new inbound events behind the existing `AGENCY_WORKFLOWS_ENABLED` gate.
  - [x] Add a dormant `social.spend.review` Workflow foundation for read-only paid-media pacing review, with deterministic instance ids, Worker readiness/status support, a Pages internal callback, and production smoke enforcement before any budget-write cutover.
  - [x] Add a dormant `brief.lifecycle.check` Workflow foundation for read-only brief completeness/lifecycle checks, with deterministic instance ids, Worker readiness/status support, a Pages internal callback, and production smoke enforcement before conversion/assignment automation cutover.
  - [x] Add a dormant `crm.followup.review` Workflow foundation for read-only CRM due-reminder pressure review, with deterministic hourly instance ids, Worker readiness/status support, a Pages internal callback, and production smoke enforcement before any notification/reminded-at write cutover.
  - [x] Add the controlled CRM follow-up write cutover path behind `AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED=false` and `AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY=false`.
    - [x] Workflow callback stays read-only by default and returns pressure summaries with write counters at zero.
    - [x] Write mode atomically claims still-unreminded tasks before notification fan-out, preventing Workflow retries or cron races from double-notifying already-claimed reminders.
    - [x] Write mode preserves the CRM anti-flood behavior: assigned/fresh reminders notify, unassigned or long-overdue backlog drains, and all claimed reminders receive a `reminded_at` audit trail.
    - [x] Legacy `crm-task-reminders` cron delegates the previous completed hourly bucket to Workflows only when the primary flag is enabled, and fails closed if Workflow start is unavailable to avoid two writers.
  - [x] Evaluate the same Workflows pattern for other long-running automation jobs before adding more cron-only loops.
    - Recommendation: use Cloudflare Workflows for event-triggered or retry-sensitive automation runs, including social reports, spend watchdog/escalations, CRM/opportunity follow-ups, brief-to-job lifecycle checks, and video generation jobs. Keep cron workers as sweep/recovery triggers rather than the primary execution engine when the job has per-item retries, waits, callbacks, or operational audit requirements.
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
  - [x] Include the Workflows readiness governance tests in `pnpm run test:social-publishing` so CI protects the automation-spine decision and readiness gate wiring.
- [x] Run CI on pull requests to `main`, not only pushes.
- [x] Use frozen lockfile installs in CI.
- [x] Keep known repo-wide lint/typecheck debt out of the deploy-critical lane until those checks are reliable enough to enforce.
- [x] Smoke the public Cloudflare Pages origin after production deploy.
- [x] Run authenticated Workflows smoke after production deploy when `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET`, `AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN`, or `AGENCY_WORKFLOWS_SMOKE_COOKIE` is configured in GitHub secrets; the Pages endpoint validates the raw shared secret against `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256`; CI may skip only while all Workflow primary/write cutover flags are dormant, and fails closed if a cutover flag is enabled without smoke auth.

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
- [x] Social inbox automation Workflow foundation focused tests pass: `pnpm exec vitest run test/workers/agencyWorkflowsContracts.test.ts test/workers/agencyWorkflowsFetch.test.ts test/server/api/socialInboxAutomationWorkflowCallback.test.ts test/server/utils/agencyWorkflowsClient.test.ts test/config/agencyWorkflowsBindings.test.ts` reported 34 tests passing.
- [x] Social inbox automation Workflow scoped lint passes across the Worker contract/fetch handler, Pages callback, client starter, config test, and focused tests.
- [x] Agency Workflows worker typecheck passes: `pnpm --dir workers/agency-workflows run typecheck`.
- [x] Social publishing regression suite passes after the inbox automation Workflow foundation: `pnpm run test:social-publishing` reported 96 files and 613 tests passing.
- [x] Production build passes after the inbox automation Workflow foundation: `pnpm run build` completed Nuxt, Nitro Cloudflare Pages output, and `scripts/wrap-worker.mjs`.
- [x] Social inbox inbound Workflow kickoff focused tests pass: `pnpm exec vitest run test/social/inboxWorkflow.test.ts test/server/utils/agencyWorkflowsClient.test.ts test/workers/agencyWorkflowsContracts.test.ts test/workers/agencyWorkflowsFetch.test.ts test/server/api/socialInboxAutomationWorkflowCallback.test.ts test/config/agencyWorkflowsBindings.test.ts` reported 37 tests passing.
- [x] Social inbox inbound Workflow kickoff scoped lint passes across `server/utils/socialInbox/workflow.ts`, `server/api/cron/sync-social-inbox.post.ts`, and `test/social/inboxWorkflow.test.ts`.
- [x] Agency Workflows worker typecheck passes after the inbound kickoff wiring: `pnpm --dir workers/agency-workflows run typecheck`.
- [x] Production build passes after the inbound kickoff wiring: `pnpm run build` completed Nuxt, Nitro Cloudflare Pages output, and `scripts/wrap-worker.mjs`.
- [x] Built Pages worker config includes the `AGENCY_WORKFLOWS` service binding and `AGENCY_WORKFLOWS_ENABLED=true` in `dist/_worker.js/wrangler.json`.
- [x] Workflow readiness now degrades when any required Workflow kind is missing; focused readiness tests pass: `pnpm exec vitest run test/server/utils/agencyWorkflowsClient.test.ts test/server/api/socialPublishingWorkflowReadiness.test.ts` reported 14 tests passing.
- [x] Agency-wide Workflows readiness route focused tests pass: `pnpm exec vitest run test/server/api/socialPublishingWorkflowReadiness.test.ts test/server/utils/agencyWorkflowsClient.test.ts test/config/agencyWorkflowsBindings.test.ts test/workers/agencyWorkflowsContracts.test.ts test/workers/agencyWorkflowsFetch.test.ts` reported 33 tests passing.
- [x] Agency-wide Workflows readiness route scoped lint passes across the canonical route, compatibility alias, shared handler, and focused route test.
- [x] Production build passes after the agency-wide Workflows readiness route: `pnpm run build` completed Nuxt, Nitro Cloudflare Pages output, and `scripts/wrap-worker.mjs`; generated route chunks include both `/api/agency/workflows/readiness` and the social publishing compatibility alias.
- [x] Workflow instance status focused tests pass: `pnpm exec vitest run test/server/utils/agencyWorkflowsClient.test.ts test/server/api/agencyWorkflowStatus.test.ts test/workers/agencyWorkflowsContracts.test.ts test/workers/agencyWorkflowsFetch.test.ts test/config/agencyWorkflowsBindings.test.ts` reported 37 tests passing.
- [x] Workflow instance status scoped lint passes across the workflow client, admin status route, and focused tests.
- [x] Production build passes after the workflow instance status route: `pnpm run build` completed Nuxt, Nitro Cloudflare Pages output, and `scripts/wrap-worker.mjs`; generated route chunks include `/api/agency/workflows/status`.
- [x] Workflow Worker health binding verification focused tests pass: `pnpm exec vitest run test/workers/agencyWorkflowsFetch.test.ts test/workers/agencyWorkflowsContracts.test.ts test/server/utils/agencyWorkflowsClient.test.ts test/server/api/agencyWorkflowStatus.test.ts test/server/api/socialPublishingWorkflowReadiness.test.ts test/config/agencyWorkflowsBindings.test.ts` reported 41 tests passing.
- [x] Workflow Worker health binding verification scoped lint passes across the Worker fetch handler and focused tests.
- [x] Agency Workflows worker typecheck passes after health binding verification: `pnpm --dir workers/agency-workflows run typecheck`.
- [x] Production build passes after Workflow Worker health binding verification: `pnpm run build` completed Nuxt, Nitro Cloudflare Pages output, and `scripts/wrap-worker.mjs`; built Pages config still includes `AGENCY_WORKFLOWS` and `AGENCY_WORKFLOWS_ENABLED=true`.
- [x] Diff integrity passes; token-shaped scans found only expected secret handling code and known dummy `workflow-secret` fixtures in focused Workflows tests.
- [x] Authenticated Workflows production smoke gate added as `pnpm run smoke:agency-workflows`; it validates `/api/agency/workflows/readiness` with admin auth, requires service-binding transport, verifies both required Workflow bindings, and can optionally validate `/api/agency/workflows/status` for a known instance id.
- [x] Dormant scheduled publishing cutover path added: when both `AGENCY_WORKFLOWS_ENABLED=true` and `AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY=true`, cron starts deterministic `social.post.publish` Workflow instances for due posts; if kickoff fails, cron falls back to the existing atomic direct publish path.
- [x] Workflow start idempotency fix passes focused Worker tests, Worker typecheck, scoped lint, and the social publishing regression suite; duplicate deterministic instance creation now returns the existing instance as a successful start.
- [x] Workflows Worker package deploy scripts are now explicit: `wrangler deploy --config wrangler.toml` and `WRANGLER_WRITE_LOGS=false wrangler deploy --config wrangler.toml --dry-run`; config regression test, scoped lint, Worker typecheck, and dry-run verification pass.
- [x] Agency Workflows readiness gate added as `pnpm run readiness:agency-workflows`; focused tests cover current Graphy validation, stale Graphy blocking, missing Graphy remediation through locally installed Obsidian, local workflow gates, and authenticated-smoke blocking when no admin auth is provided.
- [x] Scheduled publishing Workflow cutover blocker fixed: schedule/cron Workflow ids now include `scheduledAt`, workflow callbacks pass `scheduledAt` into the atomic claim, and cron direct fallback claims also require the selected `scheduled_at`; focused tests and `pnpm run test:social-publishing` pass.
- [x] Local Graphy/Graphify is refreshed for the Workflows cutover track: `pnpm run graphify:rebuild` generated clean artifacts on 2026-07-02 after excluding generated/runtime directories, with 3,448 indexed files, 8,399 nodes, and 7,737 edges. The R2 upload target is `graphify/dashboard`; see `docs/graphify.md`.
- [x] Project purpose and Workflows automation spine are documented: `docs/project-purpose.md` defines the product purpose and enterprise readiness bar, and `docs/decisions/ADR-003-cloudflare-workflows-automation-spine.md` records where Workflows should replace cron-only automation.
- [x] Agency Workflows readiness now checks automation governance docs before Graphy and Worker checks; focused readiness script tests cover valid governance docs, missing ADR-003, stale Graphy, and missing authenticated production smoke.
- [x] Deploy-critical social publishing regression suite now includes `test/config/agencyWorkflowsReadinessScript.test.ts` and `test/config/agencyWorkflowsBindings.test.ts`; local `pnpm run test:social-publishing` reported 100 files and 641 tests passing.
- [x] Production deploy workflow now has an optional authenticated Workflows smoke step after the public origin smoke; local `pnpm run test:social-publishing` reported 100 files and 642 tests passing after adding the CI workflow assertion.
- [x] Workflow status payload-identity lookup focused tests pass: `pnpm exec vitest run test/server/api/agencyWorkflowStatus.test.ts test/workers/agencyWorkflowsContracts.test.ts test/workers/agencyWorkflowsFetch.test.ts test/server/utils/agencyWorkflowsClient.test.ts` reported 4 files and 38 tests passing.
- [x] Social publishing regression suite passes after workflow status payload-identity lookup: `pnpm run test:social-publishing` reported 100 files and 642 tests passing.
- [x] Production build passes after workflow status payload-identity lookup: `pnpm run build` completed Nuxt client, SSR, Nitro Cloudflare Pages output, and `scripts/wrap-worker.mjs`.
- [x] Local Graphy/Graphify refreshed and uploaded after workflow status payload-identity lookup: `pnpm run graphify:rebuild` generated 8,406 graph nodes and 7,747 edges, then the primary artifacts were uploaded to `r2://agency-files/graphify/dashboard/`.
- [x] Social spend review Workflow foundation focused tests pass: `pnpm exec vitest run test/workers/agencyWorkflowsContracts.test.ts test/workers/agencyWorkflowsFetch.test.ts test/server/utils/agencyWorkflowsClient.test.ts test/server/api/agencyWorkflowStatus.test.ts test/server/api/socialSpendReviewWorkflowCallback.test.ts test/config/agencyWorkflowsBindings.test.ts test/social/agencyWorkflowsProductionSmokeScript.test.ts` reported 7 files and 69 tests passing.
- [x] Local Graphy/Graphify refreshed and uploaded after the social spend review Workflow foundation: `pnpm run graphify:rebuild` indexed 3,451 files, generated 8,435 graph nodes and 7,810 edges, then uploaded the primary artifacts to `r2://agency-files/graphify/dashboard/`.
- [x] Brief lifecycle check Workflow foundation focused tests pass: `pnpm exec vitest run test/workers/agencyWorkflowsContracts.test.ts test/workers/agencyWorkflowsFetch.test.ts test/server/utils/agencyWorkflowsClient.test.ts test/server/api/agencyWorkflowStatus.test.ts test/server/api/briefLifecycleWorkflowCallback.test.ts test/config/agencyWorkflowsBindings.test.ts test/social/agencyWorkflowsProductionSmokeScript.test.ts` reported 7 files and 79 tests passing.
- [x] Brief lifecycle check Workflow foundation deploy gates pass locally: scoped ESLint, `pnpm --dir workers/agency-workflows run typecheck`, `pnpm run test:social-publishing` (100 files / 644 tests), `pnpm run build`, and `pnpm run deploy:workflows:dry-run` all completed successfully.
- [x] Local Graphy/Graphify refreshed and uploaded after the brief lifecycle check Workflow foundation: `pnpm run graphify:rebuild` indexed 3,454 files, generated 8,456 graph nodes and 7,853 edges, then uploaded the primary artifacts to `r2://agency-files/graphify/dashboard/`.
- [x] CRM follow-up review Workflow foundation focused tests pass: `pnpm exec vitest run test/workers/agencyWorkflowsContracts.test.ts test/workers/agencyWorkflowsFetch.test.ts test/server/utils/agencyWorkflowsClient.test.ts test/server/api/agencyWorkflowStatus.test.ts test/server/api/crmFollowupReviewWorkflowCallback.test.ts test/config/agencyWorkflowsBindings.test.ts test/social/agencyWorkflowsProductionSmokeScript.test.ts` reported 7 files and 88 tests passing.
- [x] CRM follow-up review Workflow foundation deploy gates pass locally: scoped ESLint, `pnpm --dir workers/agency-workflows run typecheck`, `pnpm run test:social-publishing` (100 files / 645 tests), `pnpm run build`, and `pnpm run deploy:workflows:dry-run` all completed successfully.
- [x] Local Graphy/Graphify refreshed and uploaded after the CRM follow-up review Workflow foundation: `pnpm run graphify:rebuild` indexed 3,457 files, generated 8,484 graph nodes and 7,910 edges, then uploaded the primary artifacts to `r2://agency-files/graphify/dashboard/`.
- [x] CRM follow-up Workflow controlled write cutover focused tests pass: `pnpm exec vitest run test/server/api/crmFollowupReviewWorkflowCallback.test.ts test/server/api/crmTaskRemindersCron.test.ts` reported 2 files and 11 tests passing.
- [x] Local Graphy/Graphify refreshed and uploaded after the CRM follow-up controlled write cutover: `pnpm run graphify:rebuild` indexed 3,458 files, generated 8,490 graph nodes and 7,917 edges, then uploaded the primary artifacts to `r2://agency-files/graphify/dashboard/`.
- [x] CRM follow-up controlled write cutover deploy gates pass locally: focused CRM/config tests (`26/26`), scoped ESLint, `pnpm --dir workers/agency-workflows run typecheck`, `pnpm run test:social-publishing` (`100 files / 646 tests`), `pnpm run build`, and `pnpm run deploy:workflows:dry-run` all completed successfully.
- [x] `pnpm run readiness:agency-workflows` passed git-status reporting, automation governance docs, fresh Graphy artifacts, workflow config tests, Worker typecheck, and Worker deploy dry-run; authenticated production smoke now prefers `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET` and still accepts admin token/cookie fallbacks.
- [x] Workflows CI smoke gate hardening added: `pnpm run smoke:agency-workflows:ci` runs the authenticated production smoke when CI auth is configured, skips only for dormant cutover flags, and blocks active Workflow primary/write cutovers without smoke auth.
- [x] Workflows post-deploy smoke moved off short-lived user sessions: readiness/status routes accept `x-workflow-smoke-secret` only when it matches the Pages `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256` verifier or raw Pages fallback secret, while all other requests continue through admin RBAC.
- [x] Local Graphy/Graphify refreshed after the Workflows smoke shared-secret/verifier gate: `pnpm run graphify:rebuild` indexed 3,460 files, generated 8,504 graph nodes and 7,940 edges. Upload target remains `r2://agency-files/graphify/dashboard/`.
- [x] Hyperdrive production posture reconciled: `docs/cloudflare-optimization-plan.md` now documents the active Pages/Worker `HYPERDRIVE` binding id, and `test/config/cloudflareHyperdriveBindings.test.ts` guards against config/documentation drift in the deploy-critical social suite.
- [ ] Full Nuxt typecheck remains blocked by repository-wide type debt outside this slice. A longer `pnpm run typecheck` emitted repo-wide diagnostics after approximately 4 minutes; a filtered server-side rerun for the workflow callback/dispatcher files produced no matching diagnostics before the run was stopped.
- [ ] Authenticated browser smoke remains blocked until an explicit `SOCIAL_SMOKE_AUTH_TOKEN`, `SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN`, `SOCIAL_SMOKE_STORAGE_STATE`, or `SOCIAL_PUBLISHING_SMOKE_STORAGE_STATE` is provided.
- [ ] Live provider smoke remains blocked until production Meta/Google/YouTube/LinkedIn/TikTok app credentials and approved test accounts are available.
