# AI Orchestration + Model Ops — Implementation Plan

## Goal

Make Cloudflare Agents the durable orchestration layer for XeroFlow's existing AI integrations, while adding an admin Model Ops dashboard that shows which models are used where, current pricing assumptions, gateway/fallback health, Graphify context freshness, and cost by feature/client/user.

This plan is intentionally visibility-first. The platform already has AI chat, tool calling, MCP tools, Graphify repo context, video/audio generation, spend recommendations, action audit, memory, and a Command Center. The next step is to unify governance and observability before increasing agent autonomy.

## Current State

- `app/pages/agency/ai/command-center.vue` already shows proposals, action audit, 30-day AI usage/cost, tokens, memory, and KB drafts.
- `server/database/migrations/172-ai-message-cost.sql` adds `ai_messages.cost_usd`, `prompt_tokens`, and `completion_tokens`.
- `server/utils/ai/toolLoop.ts` estimates tool-loop cost from model usage.
- `server/utils/graphify.ts` reads Graphify `graph.json` and `GRAPH_REPORT.md` from R2 and powers board/task repo context.
- `server/utils/video-generation/modelRegistry.ts` and `server/utils/video-generation/costs.ts` already maintain video model metadata and estimated per-generation/per-second costs.
- Social spend review uses deterministic pacing plus Groq-backed recommendation endpoints.
- `wrangler.toml` now defines `AI_GATEWAY_URL` for server-side Groq SDK calls, and `server/utils/groqClient.ts` supports Cloudflare AI Gateway with direct-Groq fallback.

## Architecture Decision

Cloudflare Agents should become the orchestration runtime, not the source of truth.

The app remains responsible for:
- authentication and RBAC
- deterministic calculations
- database writes
- budget and approval gates
- audit logs
- model policy

The Cloudflare Agent layer is responsible for:
- durable scheduled checks
- cross-feature reasoning
- selecting the right model/tool
- remembering investigation context
- using Graphify to inspect connected codebases
- proposing actions through existing HITL pathways
- reporting model usage and orchestration outcomes back to the app

## Target Surfaces

### Admin: `/admin/ai/model-ops`

Tabs:
- **Model Map**: feature key, endpoint/worker, provider, model, fallback, owner, status, risk tier.
- **Usage & Cost**: model/feature/client/user/day totals, estimated cost, tokens, video/audio generation estimates.
- **Routing Policy**: default/strong/cheap/fallback models, max cost per turn, model status warnings.
- **Gateway Health**: Cloudflare AI Gateway URL, gateway success/fallback counts, last successful gateway call.
- **Agent Runs**: Cloudflare Agent run history, schedule, duration, tools called, outcome.
- **Graphify Context**: connected repos, graph path, graph freshness, node counts, last sync.
- **Risk & Approval**: open proposals, confirmed actions, failed executions, high-risk tools.

### Agent Worker: `workers/ai-orchestrator-agent`

Initial agent role:
- read-only health investigator
- scheduled social spend / sync monitor
- model-ops reporter
- Graphify-aware code/context assistant

Later role:
- propose actions through existing `ai_pending_actions` and `ai_action_audit`
- never directly mutate budgets, posts, invoices, or campaigns

## Data Model

### Task 1 candidate: `ai_model_registry`

Purpose: central source for model metadata, pricing, and status.

Columns:
- `id`
- `provider` (`groq`, `workers_ai`, `cloudflare_gateway`, `openai`, `anthropic`, `replicate`, `fal`, `mock`)
- `model_id`
- `display_name`
- `status` (`production`, `preview`, `deprecated`, `disabled`)
- `modality` (`text`, `vision`, `audio`, `video`, `embedding`)
- `input_price_per_million`
- `output_price_per_million`
- `unit_price_cents`
- `unit_name`
- `context_window_tokens`
- `max_output_tokens`
- `default_for_feature`
- `fallback_model_id`
- `source_url`
- `notes`
- `updated_at`

### Task 2 candidate: `ai_invocations`

Purpose: unified ledger for all AI calls, including LLM, Workers AI, video, audio, and agent runs.

Columns:
- `id`
- `feature_key`
- `provider`
- `model_id`
- `gateway_used`
- `fallback_used`
- `agent_run_id`
- `user_id`
- `client_id`
- `request_id`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `estimated_cost_usd`
- `status`
- `error_code`
- `latency_ms`
- `metadata`
- `created_at`

### Task 3 candidate: `ai_agent_runs`

Purpose: durable orchestration run audit.

Columns:
- `id`
- `agent_name`
- `trigger_type` (`manual`, `schedule`, `webhook`, `system`)
- `feature_key`
- `status`
- `started_at`
- `finished_at`
- `duration_ms`
- `tool_calls`
- `proposal_id`
- `summary`
- `error`
- `metadata`

## Implementation Tasks

## Progress Log

### 2026-06-25: Phase 1 static model map started

Completed:
- Added `server/utils/ai/modelRegistry.ts` as the static AI feature/model inventory.
- Added `GET /api/admin/ai/model-ops/model-map` with admin/owner gating.
- Added `/admin/ai/model-ops` to surface model routing, pricing coverage, risk tiers, fallbacks, and warnings.
- Added focused tests for the registry and admin endpoint.

Verified:
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

Next:
- Phase 2 should add the `ai_invocations` ledger and start recording Groq/Gateway/fallback usage from the shared Groq helper.

### 2026-06-25: Phase 2 invocation ledger started

Completed:
- Added additive migration `server/database/migrations/202_ai_invocations.sql`.
- Added `server/utils/ai/invocationLedger.ts` with token-cost estimates and fail-soft writes.
- Instrumented `generateGroqInsight` so callers can pass `featureKey`, `userId`, `clientId`, `requestId`, and explicit metadata.
- Wired `social_spend_ai_analysis` and `social_spend_pacing_summary` into the ledger path without storing prompt content.

Verified:
- `pnpm exec vitest run test/server/utils/aiInvocationLedger.test.ts test/server/utils/groqClient.test.ts test/server/utils/spendAiAnalysis.test.ts test/server/api/socialSpendPacingReviewEndpoint.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

Next:
- Extend ledger coverage to the AI tool loop, portal loop, Xero briefing, video/audio generation, and Command Center cost summaries.

### 2026-06-25: Phase 3 Model Ops telemetry dashboard started

Completed:
- Added `GET /api/admin/ai/model-ops/invocations` for 30-day AI usage, cost, token, Gateway, fallback, error, latency, feature, model, and recent-call summaries.
- The endpoint returns a safe unavailable payload when `ai_invocations` has not been migrated yet.
- Extended `/admin/ai/model-ops` with usage/cost cards, Gateway health, top features, top models, and recent invocation rows.
- Kept prompt/output content out of telemetry; the dashboard only shows metadata, token counts, cost estimates, latency, status, and model routing.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

Remaining gaps:
- Ledger coverage is currently strongest for shared Groq calls where callers pass `featureKey`; instrument the AI tool loop, portal loop, Xero briefing, video/audio generation, and Workers AI calls next.
- The dashboard cost figures are estimates until reconciled with Cloudflare AI Gateway analytics and provider invoices.
- Gateway health is inferred from app-side invocation rows; Cloudflare Gateway API health and billing should be added as a later data source.

### 2026-06-25: Expanded invocation coverage

Completed:
- Instrumented the agency AI tool loop with invocation rows for model spec, provider, fallback usage, estimated cost, tool count, tool trace names, persona, and proposal tool metadata.
- Instrumented the client portal AI tool loop with invocation rows scoped to `clientScope` and client user.
- Added ledger opt-in metadata for `financial_advisor` and `xero_invoice_ai_briefing` Groq calls.
- Added tests proving agency and portal loops record telemetry without changing the injected-model behavior.

Verified:
- `pnpm exec vitest run test/ai/toolLoop.test.ts test/ai/portalLoop.test.ts test/server/utils/groqClient.test.ts test/server/utils/aiInvocationLedger.test.ts test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

Remaining gaps:
- Workers AI calls (`aiVoice`, `edgeAi`, video asset intelligence, music/video workers) still need ledger wrappers.
- Claude structured calls should record through the ledger when used directly, especially `financial_advisor` with `ADVISOR_BACKEND=claude`.
- L2 controller helper Groq calls are still shared Groq calls but need explicit `featureKey` metadata for clearer reporting.

### 2026-06-25: Claude, L2, and voice telemetry coverage

Completed:
- Added invocation telemetry to `generateClaudeInsight` and `generateClaudeStructured` when callers pass `featureKey`.
- Added Claude-path telemetry metadata for `financial_advisor`.
- Added explicit `featureKey` metadata for the L2 classifier, specialist loops, and synthesis calls in `aiChatEngine`.
- Added Workers AI ledger rows for shared `speechToText` and `textToSpeech` helper calls.
- Added focused tests for Claude structured telemetry and Workers AI TTS telemetry.

Verified:
- `pnpm exec vitest run test/server/utils/claudeClient.test.ts test/audio/textToSpeech.test.ts test/ai/toolLoop.test.ts test/ai/portalLoop.test.ts test/server/utils/groqClient.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

Remaining gaps:
- Video generation workers, video asset intelligence, music generation workers, and `edgeAi` classification/generation still need ledger wrappers.
- Claude Gateway usage is not yet marked separately from direct Anthropic calls.

### 2026-06-25: Media and edge telemetry coverage

Completed:
- Added Workers AI ledger rows for `edgeGenerate`, `edgeClassify`, `edgeGenerateWithLoRA`, and `edgeSummarize`, including LoRA fallback metadata.
- Added request-level telemetry for video generation queueing, compliance blocks, and source-resolution failures via `video_generation_job`.
- Added request-level telemetry for async music generation queueing via `audio_music_generation`.
- Added request-level telemetry for video asset intelligence queueing, unsupported model/action blocks, missing queue binding blocks, and enqueue failures via `video_asset_intelligence_job`.
- Added focused tests for edge AI telemetry, video generation job telemetry, music generation queue telemetry, and video asset intelligence telemetry.

Verified:
- `pnpm exec vitest run test/server/utils/edgeAi.test.ts test/video-generation/generationApi.test.ts test/server/api/videoAssetHarness.test.ts test/audio/musicGenerateApi.test.ts`

Remaining gaps:
- Companion Worker execution still needs exact runtime telemetry for video generation, music generation, and asset intelligence provider execution. The app now records the request/queue decision; workers should report actual completion/failure latency, provider request ids, and final cost when a shared worker-safe ledger client is added.
- Cloudflare AI Gateway billing/analytics reconciliation is still separate from app-side estimates.

### 2026-06-25: Invocation persistence and worker runtime telemetry

Completed:
- Applied and verified `server/database/migrations/202_ai_invocations.sql` against the configured Neon database.
- Added worker-safe, fail-soft `ai_invocations` writers for the video-generation, audio-jobs, and asset-intelligence companion Workers.
- Added runtime telemetry feature keys distinct from request/queue rows:
  - `video_generation_worker_runtime`
  - `audio_music_generation_worker_runtime`
  - `video_asset_intelligence_worker_runtime`
- Added video worker telemetry for async provider submit, immediate success, provider failure, missing provider, and worker exceptions.
- Added async video completion telemetry through `video_generation_completion` for finalize successes and reconcile provider failures.
- Added music worker telemetry for actual MiniMax model execution success/failure, while render-only retries and already-done idempotency paths do not re-log model runtime.
- Added asset-intelligence worker telemetry for provider success/failure after the job is claimed.
- Added these runtime feature keys to the Model Ops static registry.

Verified:
- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/202_ai_invocations.sql`
- `SELECT to_regclass('public.ai_invocations') IS NOT NULL;` returned `true`.
- Verified indexes: `ai_invocations_pkey`, `idx_ai_invocations_agent_run_id`, `idx_ai_invocations_client_id`, `idx_ai_invocations_created_at`, `idx_ai_invocations_feature_key`, `idx_ai_invocations_model_id`.
- `pnpm exec vitest run test/video-generation/worker.test.ts test/video-generation/finalize.test.ts test/video-generation/reconcile.test.ts test/workers/asset-intelligence/worker.test.ts test/audio/musicWorker.test.ts test/server/utils/aiModelRegistry.test.ts test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

Remaining gaps:
- Worker-side cost remains estimated or provider-reported only; Cloudflare AI Gateway billing reconciliation is still needed.

### 2026-06-25: Model Ops ledger health hardening

Completed:
- Added `health` to `GET /api/admin/ai/model-ops/invocations` so admins can see whether the ledger table is ready, total row count, distinct feature/model count, and request/runtime/completion row coverage.
- Added a compact Telemetry readiness card to `/admin/ai/model-ops`.
- Kept the existing unavailable response for missing migrations so the page degrades cleanly.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Model Ops configuration readiness

Completed:
- Added non-secret AI configuration readiness to `GET /api/admin/ai/model-ops/model-map`.
- The endpoint now reports Gateway URL presence/host, Gateway auth-token presence, provider key readiness for Groq/Anthropic/Workers AI external evals, and active AI loop model/fallback/budget/backend.
- Added `/admin/ai/model-ops` configuration readiness panels without exposing secret values.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Model Ops telemetry coverage gaps

Completed:
- Added mapped-vs-seen telemetry coverage to `GET /api/admin/ai/model-ops/invocations`.
- Coverage compares the static model map feature keys with all-time `ai_invocations.feature_key` values.
- Added missing mapped feature keys, unmapped seen feature keys, and coverage rate.
- Added a Telemetry coverage panel to `/admin/ai/model-ops`.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Remaining mapped Groq feature instrumentation

Completed:
- Added explicit `featureKey` telemetry metadata for social publishing plan/caption generation.
- Added explicit `featureKey` telemetry metadata for Banner Studio image suggestions, copy suggestions, and code assist on both Workers AI and Groq fallback paths.
- Added explicit `featureKey` telemetry metadata for social inbox reply drafts, CRM follow-up drafts, task wiki summaries, and office recording summary/action-item generation.
- Kept prompt/output content out of telemetry metadata.

Verified:
- `pnpm exec vitest run test/social/aiCaption.test.ts test/social/aiDraft.test.ts test/crm/aiDraft.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Graphify Model Ops status

Completed:
- Added `GET /api/admin/ai/model-ops/graphify` with admin/owner gating.
- The endpoint lists connected repos, board context, `graphify_path`, last sync timestamp, graph node/edge/hyperedge counts, report size, R2 readiness, and per-repo status.
- Graphify artifact reads fail soft per repo, including missing paths, missing R2 configuration, missing artifacts, stale sync timestamps, and unexpected read errors.
- Added a Graphify context panel to `/admin/ai/model-ops` with compact readiness cards and a repo status table.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Agent Runs Model Ops visibility

Completed:
- Added `GET /api/admin/ai/model-ops/agent-runs` with admin/owner gating against the existing `ai_agent_runs` and `ai_agent_reports` tables.
- The endpoint returns 30-day run counts, completion/failure/running counts, report totals, finding totals, notification totals, average duration, last run timestamp, and the 25 most recent runs.
- Report content is not returned; the endpoint only exposes counts, status, timings, run summaries, and error counts.
- Added an Agent Runs panel to `/admin/ai/model-ops` so existing app-agent health is visible before the Cloudflare Agent worker is introduced.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Existing AI Agent worker hardening

Completed:
- Confirmed the repo already has `workers/ai-agent-worker`, which is a scheduled Cloudflare Worker bridge into app-controlled internal endpoints rather than an Agents SDK durable runtime.
- Refactored the worker schedule selection and internal endpoint trigger into testable helpers.
- Added local tests for weekly-vs-daily UTC schedule routing, endpoint mapping, bearer-auth request construction, success parsing, and non-OK failure surfacing.
- Kept the worker read-only from a platform-control perspective: it only calls `POST /api/internal/ai-agent/daily-digest` or `POST /api/internal/ai-agent/weekly-report`; app-side auth, DB writes, report creation, notifications, and audit stay in the Nuxt server layer.

Verified:
- `pnpm exec vitest run test/workers/aiAgentWorker.test.ts`

Remaining:
- This is not yet a Cloudflare Agents SDK durable orchestrator. The later worker should only be added after the current Model Ops dashboard, invocation ledger, Graphify status, and app-agent run visibility are stable enough to govern it.

### 2026-06-25: AI Agent digest telemetry coverage

Completed:
- Added `ai_agent_digest_report` to the static Model Ops registry.
- Added explicit `featureKey`, `userId`, `requestId`, and safe metadata to the app AI agent digest report Groq call.
- Metadata includes run id/type, user role, relevant finding count, and result type count; prompt text and report content are not stored in telemetry metadata.
- Added tests for digest runner telemetry metadata, daily opt-out behavior, and internal worker-to-app endpoint auth/dispatch.

Verified:
- `pnpm exec vitest run test/server/utils/aiAgentRunner.test.ts test/server/api/aiAgentInternalEndpoints.test.ts test/server/utils/aiModelRegistry.test.ts`
- `pnpm exec vitest run test/workers/aiAgentWorker.test.ts test/server/api/adminAiModelOps.test.ts`

### 2026-06-25: Static registry coverage cleanup

Completed:
- Added static Model Ops rows for already-emitted L2 orchestration telemetry:
  - `agency_ai_l2_classifier`
  - `agency_ai_l2_specialist_loop`
  - `agency_ai_l2_synthesis`
- Added static Model Ops rows for shared Workers AI voice helper defaults:
  - `workers_ai_speech_to_text`
  - `workers_ai_text_to_speech`
- Kept the existing agency voice aliases so feature-specific callers can still report separately.

Verified:
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`

### 2026-06-25: Social reporting AI summary telemetry

Completed:
- Added `social_reporting_ai_summary` to the static Model Ops registry.
- Added explicit `featureKey`, optional user/client/request ids, and safe metadata to the shared social reporting AI summary helper.
- Metadata includes source, period label, post count, and whether a prior baseline exists; prompt text and generated summary content are not stored.
- Existing callers remain compatible because telemetry options are optional.

Verified:
- `pnpm exec vitest run test/social/reportingAiSummary.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Agency task assist telemetry

Completed:
- Added static Model Ops rows for task assist creation and analysis:
  - `agency_task_assist_creation`
  - `agency_task_assist_analysis`
- Added explicit feature metadata to both task-assist Groq calls.
- Metadata includes mode, user id, task/board/workspace ids, context row counts, description length, and whether an existing task was available; prompt text and generated recommendations are not stored.

Verified:
- `pnpm exec vitest run test/server/api/agencyTaskAssist.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Agency analytics AI telemetry

Completed:
- Added static Model Ops rows for agency analytics AI:
  - `agency_analytics_ai_summary`
  - `agency_analytics_ask`
- Added explicit feature metadata to the Workers AI campaign breakdown summary endpoint and the Groq grounded analytics Q&A endpoint.
- Metadata includes route, campaign/window scope, client id where applicable, channel or breakdown counts, and prompt size signals; prompt text and generated answers are not stored.

Verified:
- `pnpm exec vitest run test/server/api/agencyAnalyticsAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Rate card description telemetry

Completed:
- Added `rate_card_description` to the static Model Ops registry.
- Added explicit feature metadata to rate-card service description generation.
- Metadata includes route, category, price mode/unit, setup/context flags, and whether Perplexity research was available; service prompt text, research body, and generated copy are not stored.

Verified:
- `pnpm exec vitest run test/server/api/rateCardDescriptionAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Video Studio publish-social caption telemetry

Completed:
- Added static Model Ops rows for Video Studio social caption drafts:
  - `video_asset_publish_social_caption`
  - `audio_render_publish_social_caption`
- Added explicit feature metadata to both injected publish-social caption generators.
- Metadata includes route, user/client ids, asset/project/job ids, format, platform, tone, and source model where available; generated captions are not stored.

Verified:
- `pnpm exec vitest run test/audio/renderDistributionApi.test.ts`
- `pnpm exec vitest run test/server/api/videoAssetHarness.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: AI intent classifier telemetry

Completed:
- Added static Model Ops rows for AI intent routing:
  - `agency_ai_intent_lora_classifier`
  - `agency_ai_intent_edge_classifier`
  - `agency_ai_intent_groq_classifier`
- Added explicit feature metadata to LoRA, Workers AI edge, and Groq fallback classification paths.
- Metadata includes classifier stage, message length, and intent count; user message text is not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/utils/aiIntentClassifier.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Notification digest narrative telemetry

Completed:
- Added `notification_digest_narrative` to the static Model Ops registry.
- Added explicit feature metadata to optional notification digest board narratives.
- Metadata includes route, range, board id, top item count, and reason-count totals; task titles and generated narrative text are not stored.

Verified:
- `pnpm exec vitest run test/server/api/notificationDigestNarrative.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Notification why explanation telemetry

Completed:
- Added `notification_why_explanation` to the static Model Ops registry.
- Added explicit feature metadata to uncached notification "why" explanation generation.
- Metadata includes route, notification id/type, reason, and context-field presence flags; title, body, metadata content, and generated explanation text are not stored.

Verified:
- `pnpm exec vitest run test/server/api/notificationWhyAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Task assignment auto-ack telemetry

Completed:
- Added `task_assignment_auto_ack` to the static Model Ops registry.
- Added explicit feature metadata to Groq-drafted assignment acknowledgement comments.
- Metadata includes task, assigner, assignee, project/due-date presence, and task title length; generated comment text and task title are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/utils/notifications.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Office meeting AI telemetry

Completed:
- Added static Model Ops rows for office meeting AI:
  - `office_meeting_cross_search`
  - `office_meeting_question_answer`
- Added explicit feature metadata to cross-meeting search and single-meeting Q&A Groq calls.
- Metadata includes user/request ids, office/meeting ids, artifact/source counts, and question length; question text and artifact content are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/api/officeMeetingSearchPost.test.ts`
- `pnpm exec vitest run test/server/api/officeMeetingAskPost.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Customer insights AI telemetry

Completed:
- Added `customer_insights_summary` to the static Model Ops registry.
- Added explicit feature metadata to lazy customer insights summary generation.
- Metadata includes tenant/contact ids, anomaly count, churn/forecast bands, cache presence, invoice count, and boolean revenue/payment flags; customer names, prompt text, and generated summary text are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/api/customerInsightsAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Cashflow insights AI telemetry

Completed:
- Added `cashflow_insights` to the static Model Ops registry.
- Added explicit feature metadata to cashflow insight JSON generation.
- Metadata includes forecast period, runway, shortfall/invoice counts, scenario presence, and numeric cashflow inputs; generated recommendations are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/api/cashflowInsightsAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Expense insights AI telemetry

Completed:
- Added `expense_insights` to the static Model Ops registry.
- Added explicit feature metadata to cached expense insight JSON generation.
- Metadata includes tenant id, reporting period, category/vendor/transaction counts, total spend, optional analysis-section presence, and subscription counts/totals; prompt text and generated recommendations are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/api/expenseInsightsAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Anomaly narrative AI telemetry

Completed:
- Added `anomaly_driver_narrative` to the static Model Ops registry.
- Added explicit feature metadata to uncached anomaly driver narrative generation.
- Metadata includes tenant/anomaly ids, anomaly type, severity/status, context-field presence flags, and tag count; anomaly prompt text and generated narrative text are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/api/anomalyNarrativeAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Action plan AI telemetry

Completed:
- Added `action_plan_generation` to the static Model Ops registry.
- Added explicit feature metadata to cached financial action plan generation.
- Metadata includes tenant id, source item type/category/severity, title/description lengths, input-presence flags, tag/action-step counts, and whether Xero, Vectorize, or web research context was used; prompt text and generated plan text are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/api/actionPlanAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Financial insights AI telemetry

Completed:
- Added static Model Ops rows for `/api/ai/insights`:
  - `financial_insights_headline`
  - `financial_insights_recommendations`
- Added explicit feature metadata to the executive headline and recommendation enhancement Groq calls.
- Metadata includes tenant id, health score/label, source availability flags, key metric/section/recommendation counts, and no prompt or generated text.

Verified:
- `pnpm exec vitest run test/server/api/financialInsightsAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Board automation AI telemetry

Completed:
- Added static Model Ops rows for board automation AI actions:
  - `board_automation_ai_insight`
  - `board_automation_ai_summary`
- Added explicit feature metadata to task event AI insights and board-level AI summaries.
- Metadata includes automation/board/task ids where applicable, event/action/trigger types, recipient/task presence flags, board task counts, and change counts; prompt text and generated notification text are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/utils/automationEngineAi.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Budget change sanity-check telemetry

Completed:
- Added `budget_change_sanity_check` to the static Model Ops registry.
- Added explicit feature metadata to the advisory counter-model pass used by `propose_budget_change`.
- Metadata includes tool name, campaign-name length, platform, current/proposed budget, percent change, issue type, and from-zero flag; prompt text and model concern text are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/ai/tools/proposeBudgetChangeTelemetry.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: AI memory distillation telemetry

Completed:
- Added `ai_memory_distillation` to the static Model Ops registry.
- Added explicit feature metadata to the default inferred-memory distillation model call.
- Metadata includes the orchestration route and prompt length; user/assistant message text and inferred memory content are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/ai/memoryDistillTelemetry.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Social listening enrichment telemetry

Completed:
- Added `social_listening_enrichment` to the static Model Ops registry.
- Added explicit feature metadata to cron-driven social listening sentiment/topic enrichment.
- Metadata includes cron route, enabled query count, queries run, upserted mention count, and prompt length; mention text and generated classification content are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/api/socialListeningCronTelemetry.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Observe-and-learn telemetry

Completed:
- Added `observe_and_learn_distillation` to the static Model Ops registry.
- Added explicit feature metadata to cron-driven observed-routine memory distillation.
- Metadata includes cron route, routine lookback window, and prompt length; activity details, routine text, and generated memory content are not stored in telemetry metadata.

Verified:
- `pnpm exec vitest run test/server/api/observeAndLearnCronTelemetry.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Groq feature-key coverage guard

Completed:
- Added `agency_ai_single_shot_fallback` and `video_project_ai_assembly` to the static Model Ops registry.
- Added explicit feature metadata to the AI chat single-shot fallback and video project AI assembly Groq calls.
- Added a static regression test that scans server-side `generateGroqInsight` call sites and fails if a feature key is missing, excluding the shared Groq helper implementation.
- Metadata avoids prompt/generated text and stores only request ids, counts, lengths, route names, selected model/persona/format, and context availability flags.

Verified:
- `pnpm exec vitest run test/server/utils/groqFeatureKeyCoverage.test.ts`
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`

### 2026-06-25: Legacy AI message cost fallback

Completed:
- Added a fail-soft `ai_messages` 30-day usage summary to `GET /api/admin/ai/model-ops/invocations` so older Command Center assistant-turn costs remain visible beside the new `ai_invocations` ledger.
- Kept legacy message costs separate from attributed invocation rows because `ai_messages` does not carry feature/model/gateway metadata.
- Added a compact `/admin/ai/model-ops` telemetry card for legacy assistant turns, cost, tokens, and last seen time.
- Added regression coverage proving the endpoint queries `ai_messages` without selecting message `content`.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`

### 2026-06-25: Read-only orchestrator worker foundation

Completed:
- Added `workers/ai-orchestrator-agent` as a local read-only Worker foundation with `/health` and `/tools/call`.
- Added a strict read-only tool catalog for Model Ops model map, invocation telemetry, Graphify status, agent runs, and social spend sync status.
- Added `POST /api/internal/ai-orchestrator/read-tool` with `INTERNAL_API_KEY` bearer auth.
- Wired `model_ops_model_map` to real static Model Ops registry data; the next slice should replace the temporary pending responses for the remaining contracted tools with compact read-only summaries.
- Documented current Cloudflare Agents SDK requirements from official docs and kept Durable Object/Agents activation commented until the `agents` package is installed and the Agent class is introduced.

Verified:
- `pnpm exec vitest run test/workers/aiOrchestratorAgent.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts`

### 2026-06-25: Orchestrator read-tool adapters

Completed:
- Wired all current `/api/internal/ai-orchestrator/read-tool` contracts to compact read-only app-side summaries.
- `model_ops_invocations` now returns 30-day invocation count, gateway/fallback/error counts, cost, tokens, and last seen time.
- `model_ops_graphify_status` now returns repo count, configured repo count, missing-path count, and stale repo count without reading graph content.
- `model_ops_agent_runs` now returns 30-day run totals, status counts, last run time, and failure rate.
- `social_spend_sync_status` now returns latest per-platform spend sync job status for a period, including processed/total accounts and failure counts.
- Missing telemetry tables fail soft with explicit unavailable reasons.

Verified:
- `pnpm exec vitest run test/server/api/aiOrchestratorInternalEndpoint.test.ts`

### 2026-06-25: Orchestrator read-tool run logging

Completed:
- Added fail-soft `ai_agent_runs` logging for every successful internal orchestrator read-tool call.
- Logs use `run_type = ai_orchestrator_read_tool`, `status = completed`, one check performed, zero findings/notifications, and a compact summary containing only the tool name, read-only flag, and source.
- Logging failures are warned and do not break the read-tool response.
- This makes orchestrator usage visible in Model Ops Agent Runs before any scheduled Agents SDK runtime is enabled.

Verified:
- `pnpm exec vitest run test/server/api/aiOrchestratorInternalEndpoint.test.ts`

### 2026-06-25: Orchestrator worker fetch-route coverage

Completed:
- Added local tests for the `workers/ai-orchestrator-agent` fetch surface.
- Covered `GET /health`, successful `POST /tools/call`, rejected write-like tool calls, and unknown-route 404 behavior.
- Verified `/health` exposes only read-mode tools and `/tools/call` proxies to the app-controlled internal read-tool endpoint.

Verified:
- `pnpm exec vitest run test/workers/aiOrchestratorAgent.test.ts`

### 2026-06-25: Orchestrator Agent Runs visibility

Completed:
- Added orchestrator read-tool run counts to `GET /api/admin/ai/model-ops/agent-runs`.
- The Agent Runs summary now includes `orchestratorReadToolRuns` and `orchestratorReadToolFailures` for rows logged with `run_type = ai_orchestrator_read_tool`.
- Added a Model Ops dashboard card for read-tool runs and a read-tool failure badge.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`

### 2026-06-25: Manual orchestrator read-only check

Completed:
- Added `POST /api/internal/ai-orchestrator/manual-check` for bearer-authenticated local/manual execution of the current read-only tool bundle.
- The endpoint reuses `/api/internal/ai-orchestrator/read-tool` for every tool call, so it cannot bypass the existing allowlist, app-side adapters, or fail-soft run logging.
- Supports a safe subset via `tools: [...]`; unsupported requested tools are returned as per-tool failures instead of enabling writes.
- Returns only tool status/data summaries and omits secrets from the response.

Verified:
- `pnpm exec vitest run test/server/api/aiOrchestratorInternalEndpoint.test.ts`

### 2026-06-25: Admin manual orchestrator check action

Completed:
- Added `POST /api/admin/ai/model-ops/orchestrator-check` with admin/owner gating.
- The admin endpoint wraps the internal manual check using the server-side `INTERNAL_API_KEY`, so browser users never receive or supply the internal secret.
- Added a `/admin/ai/model-ops` "Run read check" action that calls the admin wrapper, shows success/failure counts, and refreshes Agent Runs after completion.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Orchestrator readiness visibility

Completed:
- Added `config.orchestrator` to `GET /api/admin/ai/model-ops/model-map`.
- The readiness payload includes internal API key readiness, optional worker URL host/readiness, manual-check readiness, and read-tool count.
- Added an Orchestrator readiness card to `/admin/ai/model-ops` so operators can see whether manual checks are usable and whether a Worker URL is configured.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Model Ops orchestrator UI regression coverage

Completed:
- Added SSR regression coverage for `/admin/ai/model-ops` to confirm the Orchestrator readiness card renders from the model-map payload.
- The test also confirms the manual "Run read check" action is present beside the page refresh action.
- Added stable `data-testid` hooks to the readiness card and read-check button without changing runtime behavior.

Verified:
- `pnpm exec vitest run test/app/adminModelOpsPage.test.ts test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/workers/aiOrchestratorAgent.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Model Ops read-check readiness gating

Completed:
- Wired `config.orchestrator.manualCheckReady` into the `/admin/ai/model-ops` manual read-check action.
- The "Run read check" button is disabled when `INTERNAL_API_KEY` is not configured, and the click handler also refuses to post in that state.
- Added a warning alert explaining that `INTERNAL_API_KEY` is required for manual read checks.
- Expanded the Model Ops page SSR regression test to cover the missing-secret state.

Verified:
- `pnpm exec vitest run test/app/adminModelOpsPage.test.ts`

### 2026-06-25: Admin read-check secret hardening

Completed:
- Hardened `POST /api/admin/ai/model-ops/orchestrator-check` so blank `INTERNAL_API_KEY` values are treated as not configured.
- The admin wrapper now trims the server-side internal key before readiness validation and before constructing the internal bearer token.
- Added regression coverage for whitespace-only internal keys so the endpoint returns the same controlled 503 as a missing key.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`

### 2026-06-25: Model-map trimmed-secret readiness coverage

Completed:
- Confirmed `GET /api/admin/ai/model-ops/model-map` already uses trimmed presence checks for orchestrator readiness.
- Added regression coverage so whitespace-only `INTERNAL_API_KEY` reports `internalApiKeyConfigured: false` and `manualCheckReady: false`.
- This keeps the admin page readiness state aligned with the hardened `POST /api/admin/ai/model-ops/orchestrator-check` guard.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`

### 2026-06-25: Manual read-check result UI coverage

Completed:
- Expanded the `/admin/ai/model-ops` page test harness with a client-mounted interaction path for the async page.
- Added regression coverage that clicks "Run read check", posts to the admin wrapper, and renders the returned successful/total tool count.
- Kept the runtime page behavior unchanged; this slice only hardens coverage around the existing completion alert.

Verified:
- `pnpm exec vitest run test/app/adminModelOpsPage.test.ts`

### 2026-06-25: Manual read-check failure UI coverage

Completed:
- Added a regression that runs a successful manual read check, then a failed retry, and verifies the error message is shown without the stale success alert.
- Updated `/admin/ai/model-ops` to clear the previous read-check result at the start of each new attempt, including readiness-blocked attempts.
- This keeps the operator-facing state unambiguous when a later check fails after an earlier success.

Verified:
- `pnpm exec vitest run test/app/adminModelOpsPage.test.ts`

### 2026-06-25: Manual read-check Agent Runs refresh coverage

Completed:
- Added regression coverage that a successful `/admin/ai/model-ops` manual read check refreshes the Agent Runs telemetry fetch.
- Confirmed the action does not refresh unrelated Model Ops fetches; the full page refresh remains the explicit refresh action.
- Kept runtime behavior unchanged because the page already refreshed Agent Runs after successful checks.

Verified:
- `pnpm exec vitest run test/app/adminModelOpsPage.test.ts`

### 2026-06-25: Manual read-check failed-refresh coverage

Completed:
- Added regression coverage that a failed `/admin/ai/model-ops` manual read check does not refresh Agent Runs telemetry.
- Confirmed the page still shows the server-side error message for the failed check.
- Kept runtime behavior unchanged because Agent Runs already refreshes only after successful checks.

Verified:
- `pnpm exec vitest run test/app/adminModelOpsPage.test.ts`

### 2026-06-25: Manual read-check readiness-block coverage

Completed:
- Added regression coverage that a readiness-blocked manual read check does not call the admin POST endpoint.
- Confirmed readiness-blocked checks also do not refresh Agent Runs telemetry.
- Kept runtime behavior unchanged because the page already disables the button and has a handler-side readiness guard.

Verified:
- `pnpm exec vitest run test/app/adminModelOpsPage.test.ts`

### 2026-06-25: Internal orchestrator secret trim review fix

Completed:
- Reviewed the admin and internal orchestrator auth path after the Model Ops manual-check work.
- Found and fixed a consistency issue where the admin wrapper trimmed `INTERNAL_API_KEY`, but the internal manual-check and read-tool endpoints compared against the raw environment value.
- Added regressions proving both internal endpoints accept the same trimmed bearer token produced by the admin wrapper when the configured secret has accidental surrounding whitespace.

Verified:
- `pnpm exec vitest run test/server/api/aiOrchestratorInternalEndpoint.test.ts`

### 2026-06-25: Orchestrator Worker tools auth hardening

Completed:
- Hardened the AI orchestrator Worker so `POST /tools/call` requires `Authorization: Bearer <INTERNAL_API_KEY>` before proxying to the app.
- Kept `GET /health` public for read-only readiness/catalog checks.
- Added regressions for missing auth, wrong bearer token, and trimmed Worker secrets.

Verified:
- `pnpm exec vitest run test/workers/aiOrchestratorAgent.test.ts`

### 2026-06-25: Orchestrator Worker outbound bearer normalization

Completed:
- Normalized the AI orchestrator Worker app-bound bearer token by trimming `INTERNAL_API_KEY` before building `/api/internal/ai-orchestrator/read-tool` requests.
- Tightened Worker tests so the trimmed-secret case verifies the outbound `Authorization` header, not just that the proxy call happened.
- Documented that the Worker trims the configured secret for both inbound `/tools/call` auth and outbound app-bound auth.

Verified:
- `pnpm exec vitest run test/workers/aiOrchestratorAgent.test.ts`

### 2026-06-25: Orchestrator Worker blank-secret guard

Completed:
- Hardened the Worker read-tool contract builder so blank or whitespace-only `INTERNAL_API_KEY` values throw before building or sending app-bound read-tool requests.
- Added coverage that direct `buildInternalToolRequest` and `callReadOnlyTool` usage fail fast and do not call `fetch` when the secret is blank.
- Documented that blank internal secrets fail before any app-bound request is sent.

Verified:
- `pnpm exec vitest run test/workers/aiOrchestratorAgent.test.ts`

### 2026-06-25: Orchestrator Worker route documentation cleanup

Completed:
- Tightened the Worker README route wording so only `/health` is described as public.
- Documented `/tools/call` as bearer-protected in the fetch surface summary.
- No runtime behavior changed.

Verified:
- `pnpm exec vitest run test/workers/aiOrchestratorAgent.test.ts`

### 2026-06-25: Orchestrator Worker blank-route-secret coverage

Completed:
- Added regression coverage that `POST /tools/call` fails closed when the Worker `INTERNAL_API_KEY` is blank or whitespace-only.
- Confirmed blank route secrets return `401` and do not proxy to the app read-tool endpoint.
- No runtime behavior changed because the route guard was already fail-closed.

Verified:
- `pnpm exec vitest run test/workers/aiOrchestratorAgent.test.ts`

### 2026-06-25: Graphify Model Ops availability hardening

Completed:
- Hardened `GET /api/admin/ai/model-ops/graphify` so missing repository metadata tables return a soft `available: false` payload instead of failing the dashboard fetch.
- Added a Model Ops warning state for unavailable Graphify repository metadata.
- Added regression coverage that missing `project_repos` metadata does not call R2 artifact loaders and returns an empty status payload.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/app/adminModelOpsPage.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Agency voice telemetry registry alignment

Completed:
- Audited runtime `featureKey` literals against the Model Ops static registry.
- Wired agency chat voice transcription and speech synthesis routes to emit `agency_ai_voice_stt` and `agency_ai_voice_tts` instead of only the generic shared Workers AI helper keys.
- Kept `workers_ai_speech_to_text` and `workers_ai_text_to_speech` as shared-helper defaults for non-agency call sites.
- Added endpoint assertions so the agency voice telemetry keys cannot silently regress.

Verified:
- Runtime literal feature-key diff: all literal runtime feature keys are mapped in the Model Ops registry.
- `pnpm exec vitest run test/server/api/aiChatTranscribe.test.ts test/server/api/aiChatSpeak.test.ts test/server/utils/aiModelRegistry.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Orchestrator config runbook alignment

Completed:
- Added `INTERNAL_API_KEY` and optional `AI_ORCHESTRATOR_WORKER_URL` examples to `.env.example` so local Model Ops manual read checks can be configured without guessing variable names.
- Added root `wrangler.toml` comments clarifying that `INTERNAL_API_KEY` is a secret and that `AI_ORCHESTRATOR_WORKER_URL` should only be enabled after the standalone Worker is deployed.
- Updated the Worker README to state that the same `INTERNAL_API_KEY` must be set on both the Pages app and the `ai-orchestrator-agent` Worker.
- Kept production behavior unchanged; no real secrets were added.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/app/adminModelOpsPage.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/workers/aiOrchestratorAgent.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`
- `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit`

### 2026-06-25: Model Ops telemetry index hardening

Completed:
- Added migration `203_model_ops_telemetry_indexes.sql` for the Model Ops dashboard and orchestrator read-tool query paths.
- Indexed `ai_agent_runs.started_at`, `ai_agent_runs.created_at`, and `ai_agent_runs(run_type, started_at DESC)` for recent run summaries and orchestrator read-tool counts.
- Indexed `ai_agent_reports.run_id` for the report-count joins used by Agent Runs telemetry.
- Indexed legacy assistant messages by recent `created_at` where `role = 'assistant'` for the 30-day legacy usage summary.
- Kept the migration additive and idempotent with `CREATE INDEX IF NOT EXISTS`.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/server/utils/aiInvocationLedger.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

### 2026-06-25: Merge-scope audit

Completed:
- Audited the dirty worktree and separated the Model Ops/orchestrator scope from unrelated local changes.
- Confirmed the core Model Ops/orchestrator branchable set includes:
  - `/admin/ai/model-ops` page and admin navigation links.
  - `server/api/admin/ai/model-ops/*` and `server/api/internal/ai-orchestrator/*`.
  - `server/utils/ai/modelRegistry.ts`, `server/utils/ai/invocationLedger.ts`, and migrations `202`/`203`.
  - `workers/ai-orchestrator-agent/*`.
  - focused admin, internal endpoint, registry, ledger, voice telemetry, and Worker tests.
  - `.env.example`, `wrangler.toml`, ADR/runbook docs.
- Confirmed the wider dirty worktree still contains separate social spend sync/pacing work, broad AI telemetry instrumentation, media/audio/video worker instrumentation, and unrelated Hyperframes planning docs that should be staged as separate slices unless intentionally merged together.
- No staging, committing, deploying, or file reverts were performed.

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/server/api/aiChatSpeak.test.ts test/server/api/aiChatTranscribe.test.ts test/server/utils/aiModelRegistry.test.ts test/server/utils/aiInvocationLedger.test.ts test/workers/aiOrchestratorAgent.test.ts test/app/adminModelOpsPage.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`
- `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit`
- `curl -I http://localhost:3001/admin/ai/model-ops`

### 2026-06-25: Non-destructive staging manifest

Purpose:
- Keep the Model Ops/orchestrator commit slice separate from the broader dirty worktree.
- This is a manifest only. No `git add`, commit, deploy, or file revert has been run.

Stage together for the Model Ops/orchestrator slice:

```bash
git add \
  .env.example \
  wrangler.toml \
  app/pages/admin.vue \
  app/pages/admin/index.vue \
  app/pages/admin/ai/model-ops.vue \
  server/api/admin/ai/model-ops \
  server/api/internal/ai-orchestrator \
  'server/api/agency/ai/chat/conversations/[id]/voice.post.ts' \
  server/api/agency/ai/chat/speak.post.ts \
  server/api/agency/ai/chat/transcribe.post.ts \
  server/utils/aiVoice.ts \
  server/utils/ai/modelRegistry.ts \
  server/utils/ai/invocationLedger.ts \
  server/database/migrations/202_ai_invocations.sql \
  server/database/migrations/203_model_ops_telemetry_indexes.sql \
  workers/ai-orchestrator-agent \
  test/app/adminModelOpsPage.test.ts \
  test/server/api/adminAiModelOps.test.ts \
  test/server/api/aiOrchestratorInternalEndpoint.test.ts \
  test/server/api/aiChatSpeak.test.ts \
  test/server/api/aiChatTranscribe.test.ts \
  test/audio/textToSpeech.test.ts \
  test/server/utils/aiModelRegistry.test.ts \
  test/server/utils/aiInvocationLedger.test.ts \
  test/workers/aiOrchestratorAgent.test.ts \
  docs/decisions/ADR-002-cloudflare-agents-ai-orchestration.md \
  docs/superpowers/plans/2026-06-25-ai-orchestration-model-ops.md
```

Review before staging with:

```bash
git diff -- .env.example wrangler.toml app/pages/admin.vue app/pages/admin/index.vue \
  'server/api/agency/ai/chat/conversations/[id]/voice.post.ts' \
  server/api/agency/ai/chat/speak.post.ts \
  server/api/agency/ai/chat/transcribe.post.ts \
  server/utils/aiVoice.ts \
  test/audio/textToSpeech.test.ts
```

Keep out of this slice unless intentionally merging broader work:
- `app/pages/agency/social/spend.vue`
- `app/components/social/*`
- `server/api/agency/social/spend/*`
- `server/utils/googleRecommendations.ts`
- broad AI endpoint/worker instrumentation not listed above
- `docs/specs/2026-06-25-hyperframes-render-runtime-prd.md`
- `docs/superpowers/plans/2026-06-25-hyperframes-render-runtime.md`

Self-containment note:
- `server/utils/aiVoice.ts` belongs in this slice because the agency voice routes now pass telemetry options into `speechToText` and `textToSpeech`.
- Other broad AI helper instrumentation (`groqClient`, `claudeClient`, `edgeAi`, tool loops, media workers) remains a separate telemetry slice unless intentionally included.

Pre-stage hygiene, verified after the manifest update:
- `git diff --check` passed for tracked manifest files.
- Conflict-marker scan found no unresolved merge markers in manifest files.
- Secret-pattern scan found only placeholder/example false positives.
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/server/api/aiChatSpeak.test.ts test/server/api/aiChatTranscribe.test.ts test/audio/textToSpeech.test.ts test/server/utils/aiModelRegistry.test.ts test/server/utils/aiInvocationLedger.test.ts test/workers/aiOrchestratorAgent.test.ts test/app/adminModelOpsPage.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`
- `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit`
- `curl -I http://localhost:3001/admin/ai/model-ops`

Temporary-index staging simulation:
- Ran the manifest `git add` against a copied index at `/tmp/model-ops-manifest-index.*`.
- The simulated staged file list matched the manifest, including `server/utils/aiVoice.ts` and `test/audio/textToSpeech.test.ts`.
- Confirmed the real index stayed untouched: `git diff --cached --name-only` returned no files.
- No real `git add`, commit, deploy, push, or revert was performed.

Temporary-index diff/stat audit:
- Simulated staged scope: 38 files.
- Simulated staged size: 7,374 insertions and 12 deletions after the deployment runbook, internal Graphify read-tool fail-soft fix, and admin Graphify concurrency cap.
- Largest files in the simulated staged diff:
  - `docs/superpowers/plans/2026-06-25-ai-orchestration-model-ops.md`: 1,503 inserted lines.
  - `app/pages/admin/ai/model-ops.vue`: 1,099 inserted lines.
  - `server/utils/ai/modelRegistry.ts`: 909 inserted lines.
  - `test/server/api/adminAiModelOps.test.ts`: 562 inserted lines.
  - `test/app/adminModelOpsPage.test.ts`: 406 inserted lines.
  - `test/server/api/aiOrchestratorInternalEndpoint.test.ts`: 398 inserted lines.
  - `server/api/admin/ai/model-ops/invocations.get.ts`: 365 inserted lines.
  - `server/api/internal/ai-orchestrator/read-tool.post.ts`: 326 inserted lines.
  - `server/api/admin/ai/model-ops/graphify.get.ts`: 254 inserted lines.
- Risk note: this is reviewable as one coherent governance/orchestrator foundation, but it is a large PR. If review bandwidth is tight, split docs/runbook, Model Ops dashboard/API, and Worker/internal orchestrator into stacked PRs.
- Confirmed again after the audit that the real index stayed untouched: `git diff --cached --name-only` returned no files.

Optional stacked PR split:

PR 1 — Model Ops ledger and registry foundation:

```bash
git add \
  server/utils/ai/modelRegistry.ts \
  server/utils/ai/invocationLedger.ts \
  server/database/migrations/202_ai_invocations.sql \
  server/database/migrations/203_model_ops_telemetry_indexes.sql \
  test/server/utils/aiModelRegistry.test.ts \
  test/server/utils/aiInvocationLedger.test.ts
```

Verification:
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts test/server/utils/aiInvocationLedger.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

PR 2 — Admin Model Ops dashboard and read-only summaries:

```bash
git add \
  app/pages/admin.vue \
  app/pages/admin/index.vue \
  app/pages/admin/ai/model-ops.vue \
  server/api/admin/ai/model-ops \
  test/app/adminModelOpsPage.test.ts \
  test/server/api/adminAiModelOps.test.ts
```

Verification:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/app/adminModelOpsPage.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`
- `curl -I http://localhost:3001/admin/ai/model-ops`

PR 3 — Read-only orchestrator Worker and internal tool bridge:

```bash
git add \
  server/api/internal/ai-orchestrator \
  workers/ai-orchestrator-agent \
  test/server/api/aiOrchestratorInternalEndpoint.test.ts \
  test/workers/aiOrchestratorAgent.test.ts
```

Verification:
- `pnpm exec vitest run test/server/api/aiOrchestratorInternalEndpoint.test.ts test/workers/aiOrchestratorAgent.test.ts`
- `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit`
- `pnpm exec vue-tsc --noEmit --pretty false`

PR 4 — Agency voice telemetry alignment and runbook/config:

```bash
git add \
  .env.example \
  wrangler.toml \
  'server/api/agency/ai/chat/conversations/[id]/voice.post.ts' \
  server/api/agency/ai/chat/speak.post.ts \
  server/api/agency/ai/chat/transcribe.post.ts \
  server/utils/aiVoice.ts \
  test/server/api/aiChatSpeak.test.ts \
  test/server/api/aiChatTranscribe.test.ts \
  test/audio/textToSpeech.test.ts \
  docs/decisions/ADR-002-cloudflare-agents-ai-orchestration.md \
  docs/superpowers/plans/2026-06-25-ai-orchestration-model-ops.md
```

Verification:
- `pnpm exec vitest run test/server/api/aiChatSpeak.test.ts test/server/api/aiChatTranscribe.test.ts test/audio/textToSpeech.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

Stacking note:
- PR 2 depends on PR 1.
- PR 3 depends on PR 1 for registry/ledger types and is easiest to review after PR 2 because Model Ops exposes run visibility and the admin wrapper button path.
- PR 4 depends on PR 1 because `server/utils/aiVoice.ts` records through `recordAiInvocation`.
- PR 4 can technically land after PR 1, but putting it last keeps the dashboard/orchestrator review focused.
- After all four land, rerun the full manifest verification command from the main PR package before merge/deploy.

Stacked PR gate verification:
- PR 1 gate passed: `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts test/server/utils/aiInvocationLedger.test.ts`.
- PR 2 gate passed: `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/app/adminModelOpsPage.test.ts`.
- PR 3 gate passed: `pnpm exec vitest run test/server/api/aiOrchestratorInternalEndpoint.test.ts test/workers/aiOrchestratorAgent.test.ts`.
- PR 4 gate passed: `pnpm exec vitest run test/server/api/aiChatSpeak.test.ts test/server/api/aiChatTranscribe.test.ts test/audio/textToSpeech.test.ts`.
- Shared checks passed: `pnpm exec vue-tsc --noEmit --pretty false`, `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit`, and `curl -I http://localhost:3001/admin/ai/model-ops`.
- Confirmed the real index stayed untouched: `git diff --cached --name-only` returned no files.

### 2026-06-25: Commit and PR readiness package

Suggested commit message:

```text
feat(ai): add Model Ops dashboard and read-only orchestrator foundation

Adds an admin Model Ops dashboard for AI model inventory, configuration readiness,
invocation telemetry, Graphify freshness, agent-run health, and manual read-only
orchestrator checks.

Introduces a fail-soft AI invocation ledger, read-only internal orchestrator
endpoints, a protected ai-orchestrator-agent Worker foundation, and scoped tests
for auth, readiness, telemetry, and staging hygiene.
```

Suggested PR title:

```text
Add AI Model Ops dashboard and read-only orchestrator foundation
```

Suggested PR summary:

```markdown
## Summary
- adds `/admin/ai/model-ops` for AI model inventory, pricing/config readiness, telemetry, Graphify status, and agent-run visibility
- adds fail-soft `ai_invocations` ledger support plus Model Ops indexes
- adds internal read-only orchestrator endpoints and a protected `workers/ai-orchestrator-agent` bridge
- aligns agency voice STT/TTS telemetry with Model Ops registry keys
- documents Cloudflare Agents activation path and safe staging manifest

## Verification
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/server/api/aiChatSpeak.test.ts test/server/api/aiChatTranscribe.test.ts test/audio/textToSpeech.test.ts test/server/utils/aiModelRegistry.test.ts test/server/utils/aiInvocationLedger.test.ts test/workers/aiOrchestratorAgent.test.ts test/app/adminModelOpsPage.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`
- `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit`
- `curl -I http://localhost:3001/admin/ai/model-ops`

## Deployment notes
- run migrations `202_ai_invocations.sql` and `203_model_ops_telemetry_indexes.sql`
- configure the same `INTERNAL_API_KEY` on the Pages app and `workers/ai-orchestrator-agent`
- set `AI_ORCHESTRATOR_WORKER_URL` only after the standalone Worker is deployed and healthy
- keep the Worker read-only; unauthenticated `/tools/call` requests must return `401`
```

### 2026-06-25: Deployment runbook refinement

Deployment notes:
- Migration order:
  - Confirm the existing Agent Runs tables from `015-ai-agent.sql` are present before relying on Agent Runs or manual read-check logging.
  - Run `server/database/migrations/202_ai_invocations.sql` before enabling the invocation telemetry panel.
  - Run `server/database/migrations/203_model_ops_telemetry_indexes.sql` after `202` and after the Agent Runs tables exist.
  - Graphify/project repository metadata is optional for this slice; the Graphify panel is expected to fail soft if `project_repos` or freshness metadata is unavailable.
- Secret setup:
  - Set `INTERNAL_API_KEY` on the Pages app before enabling `/admin/ai/model-ops` manual read checks.
  - Set the same `INTERNAL_API_KEY` on `workers/ai-orchestrator-agent` before deploying or calling the Worker `/tools/call` route.
  - Leave `AI_ORCHESTRATOR_WORKER_URL` unset until the standalone Worker URL exists and `/health` has been checked.
  - Keep `AI_GATEWAY_URL` as a non-secret configured value; `AI_GATEWAY_AUTH_TOKEN` is only required if the Cloudflare AI Gateway is configured to require authenticated gateway access.
- Worker sequencing:
  - Merge and deploy the Pages app plus database migrations first.
  - Verify `/admin/ai/model-ops` renders with the Worker readiness card showing the Worker URL as optional/not configured.
  - Configure the Worker secret, then deploy `workers/ai-orchestrator-agent`.
  - Check `GET /health` on the Worker URL.
  - Set `AI_ORCHESTRATOR_WORKER_URL` on the Pages app only after the Worker health check passes.
  - Keep `POST /tools/call` bearer-protected; unauthenticated and wrong-bearer requests should return `401`.
- Rollback notes:
  - Unset or disable `AI_ORCHESTRATOR_WORKER_URL` first to remove the Worker readiness signal and prevent app-side Worker usage.
  - Rotate or unset the Worker `INTERNAL_API_KEY` if the Worker must be isolated immediately.
  - Leave migrations in place during rollback; `202` and `203` are additive/idempotent and the app endpoints already fail soft when optional telemetry tables are unavailable.
  - If the admin surface needs to disappear quickly, hide the `/admin/ai/model-ops` nav links in the Pages app rollback while keeping the read-only endpoints gated.
  - Do not deploy this slice together with unrelated social spend or Hyperframes dirty files unless intentionally expanding scope.

Post-merge/manual checks:
- Visit `/admin/ai/model-ops` as an admin/owner.
- Confirm Model Map, Invocation Telemetry, Graphify, Agent Runs, and Orchestrator readiness panels render.
- If `INTERNAL_API_KEY` is configured, run the manual read check and confirm Agent Runs refreshes.
- If the Worker is deployed, check `GET /health` and confirm the tool catalog lists only read-only tools.
- Confirm `POST /tools/call` without a bearer token returns `401`.
- Confirm `POST /tools/call` with a wrong bearer token returns `401`.
- Confirm no write/action execution path is exposed by the orchestrator Worker; current tools remain read-only.

### 2026-06-25: Internal Graphify read-tool fail-soft fix

Audit finding:
- The admin Graphify panel already degrades when repository metadata is unavailable, but the internal `model_ops_graphify_status` read tool could still throw if `project_repos` was missing.

Change:
- Wrapped the internal Graphify read-tool query in missing-table handling so it returns `{ available: false, readOnly: true }` instead of failing the read-tool call.
- Added regression coverage in `test/server/api/aiOrchestratorInternalEndpoint.test.ts`.

Verification:
- `pnpm exec vitest run test/server/api/aiOrchestratorInternalEndpoint.test.ts`
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/server/utils/aiModelRegistry.test.ts test/server/utils/aiInvocationLedger.test.ts test/workers/aiOrchestratorAgent.test.ts test/app/adminModelOpsPage.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`
- `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit`

### 2026-06-25: Final local verification pass

Verified:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/server/api/aiChatSpeak.test.ts test/server/api/aiChatTranscribe.test.ts test/audio/textToSpeech.test.ts test/server/utils/aiModelRegistry.test.ts test/server/utils/aiInvocationLedger.test.ts test/workers/aiOrchestratorAgent.test.ts test/app/adminModelOpsPage.test.ts` passed with 79 tests after the Graphify concurrency review fix.
- `pnpm exec vue-tsc --noEmit --pretty false` passed.
- `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit` passed.
- `curl -I http://localhost:3001/admin/ai/model-ops` returned `HTTP/1.1 200 OK`.
- Confirmed the real index stayed untouched with `git diff --cached --name-only`.

### 2026-06-25: Final code-review pass

Finding:
- The admin Graphify status endpoint loaded all repository artifacts with unbounded `Promise.all`, which could create a burst of R2 reads and make `/admin/ai/model-ops` slow on tenants with many repositories.

Change:
- Added a local concurrency cap for Graphify repository artifact inspection.
- Added regression coverage proving more than four graph loads are not active concurrently.

Review notes:
- Admin Model Ops routes are gated with `requireRole(event, ['admin', 'owner'])`.
- Internal orchestrator routes and the Worker `/tools/call` route require `INTERNAL_API_KEY` bearer auth and trim configured secrets.
- Current Worker tools remain read-only; the only write-like operation in the internal path is fail-soft telemetry logging to `ai_agent_runs`.
- The UI displays configuration readiness booleans and hosts, not raw secret values.

### 2026-06-25: Final PR handoff

Go/no-go:
- Go for staging as the Model Ops/orchestrator slice once ready to create the PR.
- Do not stage unrelated social spend sync/pacing, Hyperframes, media worker, broad AI telemetry, or Google recommendations files from the wider dirty worktree unless intentionally expanding scope.
- The real index is intentionally empty at handoff time.

Exact staging command:

```bash
git add \
  .env.example \
  wrangler.toml \
  app/pages/admin.vue \
  app/pages/admin/index.vue \
  app/pages/admin/ai/model-ops.vue \
  server/api/admin/ai/model-ops \
  server/api/internal/ai-orchestrator \
  'server/api/agency/ai/chat/conversations/[id]/voice.post.ts' \
  server/api/agency/ai/chat/speak.post.ts \
  server/api/agency/ai/chat/transcribe.post.ts \
  server/utils/aiVoice.ts \
  server/utils/ai/modelRegistry.ts \
  server/utils/ai/invocationLedger.ts \
  server/database/migrations/202_ai_invocations.sql \
  server/database/migrations/203_model_ops_telemetry_indexes.sql \
  workers/ai-orchestrator-agent \
  test/app/adminModelOpsPage.test.ts \
  test/server/api/adminAiModelOps.test.ts \
  test/server/api/aiOrchestratorInternalEndpoint.test.ts \
  test/server/api/aiChatSpeak.test.ts \
  test/server/api/aiChatTranscribe.test.ts \
  test/audio/textToSpeech.test.ts \
  test/server/utils/aiModelRegistry.test.ts \
  test/server/utils/aiInvocationLedger.test.ts \
  test/workers/aiOrchestratorAgent.test.ts \
  docs/decisions/ADR-002-cloudflare-agents-ai-orchestration.md \
  docs/superpowers/plans/2026-06-25-ai-orchestration-model-ops.md
```

Copy-ready PR body:

```markdown
## Summary
- adds `/admin/ai/model-ops` for AI model inventory, pricing/config readiness, invocation telemetry, Graphify freshness, agent-run visibility, and read-only orchestrator readiness
- adds fail-soft `ai_invocations` ledger support plus Model Ops telemetry indexes
- adds internal read-only orchestrator endpoints and a protected `workers/ai-orchestrator-agent` bridge
- aligns agency voice STT/TTS telemetry with Model Ops registry keys
- hardens Graphify/Agent telemetry failure states and caps Graphify artifact inspection concurrency
- documents Cloudflare Agents activation path, deployment sequencing, rollback notes, and safe staging scope

## Verification
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts test/server/api/aiOrchestratorInternalEndpoint.test.ts test/server/api/aiChatSpeak.test.ts test/server/api/aiChatTranscribe.test.ts test/audio/textToSpeech.test.ts test/server/utils/aiModelRegistry.test.ts test/server/utils/aiInvocationLedger.test.ts test/workers/aiOrchestratorAgent.test.ts test/app/adminModelOpsPage.test.ts` passed with 79 tests
- `pnpm exec vue-tsc --noEmit --pretty false`
- `pnpm exec tsc -p workers/ai-orchestrator-agent/tsconfig.json --noEmit`
- `curl -I http://localhost:3001/admin/ai/model-ops` returned `HTTP/1.1 200 OK`
- temporary-index staging simulation: 38 files, 7,374 insertions, 12 deletions; `git diff --cached --check` passed

## Deployment notes
- run `server/database/migrations/202_ai_invocations.sql` then `server/database/migrations/203_model_ops_telemetry_indexes.sql`; confirm `015-ai-agent.sql` tables exist for Agent Runs/manual check logging
- set the same `INTERNAL_API_KEY` on the Pages app and `workers/ai-orchestrator-agent`
- leave `AI_ORCHESTRATOR_WORKER_URL` unset until the standalone Worker is deployed and `/health` passes
- keep the Worker read-only; unauthenticated and wrong-bearer `/tools/call` requests must return `401`
```

### Phase 1: Inventory + Static Model Map

#### Task 1.1: Build AI feature inventory

Description: Create a central static registry that lists every known AI feature and the model/provider it currently uses.

Acceptance criteria:
- Registry includes social spend AI, pacing summary, AI chat tool loop, advisor, Xero briefing, social publishing, social inbox draft, banner AI helpers, video generation, audio transcription/music, CRM draft, portal AI, Graphify-backed task wiki.
- Each entry has `featureKey`, `surface`, `owner`, `provider`, `modelId`, `fallback`, `riskTier`, and `sourceFile`.
- Existing Command Center can import the registry without DB access.

Verification:
- `pnpm exec vitest run test/server/utils/aiModelRegistry.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false`

Files likely touched:
- `server/utils/ai/modelRegistry.ts`
- `test/server/utils/aiModelRegistry.test.ts`

Scope: Medium.

#### Task 1.2: Add admin model map endpoint

Description: Expose the static registry to management/admin users.

Acceptance criteria:
- `GET /api/admin/ai/model-ops/model-map` returns model map rows.
- Endpoint is management/admin gated.
- Rows include status warnings for preview/deprecated/unknown-price models.

Verification:
- `pnpm exec vitest run test/server/api/adminAiModelOps.test.ts`

Files likely touched:
- `server/api/admin/ai/model-ops/model-map.get.ts`
- `test/server/api/adminAiModelOps.test.ts`

Scope: Small.

### Phase 2: Unified Invocation Ledger

#### Task 2.1: Add `ai_invocations` migration

Description: Add a generic AI invocation ledger without removing the existing `ai_messages` cost fields.

Acceptance criteria:
- Migration is additive and idempotent.
- Has indexes for `created_at`, `feature_key`, `model_id`, `client_id`, and `agent_run_id`.
- Does not break existing Command Center queries.

Verification:
- Migration applies on a test database or is SQL-reviewed for idempotency.

Files likely touched:
- `server/database/migrations/202_ai_invocations.sql`

Scope: Small.

#### Task 2.2: Create invocation logging utility

Description: Add a safe server utility for recording AI invocations from API routes and workers.

Acceptance criteria:
- Utility tolerates logging failure without failing the user-facing AI call.
- Supports LLM token calls, Workers AI calls, video/audio unit-cost calls, and agent-run calls.
- Redacts prompt/content by default; metadata must be explicit.

Verification:
- `pnpm exec vitest run test/server/utils/aiInvocationLedger.test.ts`

Files likely touched:
- `server/utils/ai/invocationLedger.ts`
- `test/server/utils/aiInvocationLedger.test.ts`

Scope: Medium.

#### Task 2.3: Instrument Groq helper

Description: Extend `generateGroqInsight` so callers can pass `featureKey`, `clientId`, and `requestId`, and the helper records usage/cost when the provider returns usage.

Acceptance criteria:
- Existing callers keep working unchanged.
- Social spend AI analysis records `featureKey = social_spend_ai_analysis`.
- Gateway fallback is recorded as `fallback_used = true`.
- Cost estimate uses central registry pricing.

Verification:
- `pnpm exec vitest run test/server/utils/groqClient.test.ts test/server/utils/spendAiAnalysis.test.ts`

Files likely touched:
- `server/utils/groqClient.ts`
- `server/api/agency/social/spend/[id]/ai-analysis.post.ts`
- `test/server/utils/groqClient.test.ts`

Scope: Medium.

### Phase 3: Admin Model Ops Dashboard

#### Task 3.1: Add `/admin/ai/model-ops`

Description: Add a dense admin page for model map and usage overview.

Acceptance criteria:
- Page uses existing admin layout patterns.
- First version has tabs: Model Map, Usage & Cost, Gateway Health, Graphify.
- No nested cards; repeated rows use compact tables.
- Empty/error states are explicit.

Verification:
- `pnpm exec vue-tsc --noEmit --pretty false`
- Manual: visit `/admin/ai/model-ops` locally.

Files likely touched:
- `app/pages/admin/ai/model-ops.vue`
- `server/api/admin/ai/model-ops/*.get.ts`

Scope: Medium.

#### Task 3.2: Add usage and cost endpoint

Description: Aggregate `ai_invocations` plus existing `ai_messages` fallback into model/feature/day totals.

Acceptance criteria:
- Returns 7d/30d totals by feature, provider, model, and client.
- Includes missing-price warning count.
- Does not pull raw prompt/content.

Verification:
- `pnpm exec vitest run test/server/api/adminAiModelOpsUsage.test.ts`

Files likely touched:
- `server/api/admin/ai/model-ops/usage.get.ts`
- `server/utils/ai/modelOpsUsage.ts`
- `test/server/api/adminAiModelOpsUsage.test.ts`

Scope: Medium.

### Phase 4: Graphify + Context Governance

#### Task 4.1: Add Graphify status endpoint

Description: Surface connected repo graph status for admin/model ops.

Acceptance criteria:
- Lists connected repos, `graphify_path`, last synced timestamp, and inferred status.
- Attempts to read graph metadata/counts when R2 is configured.
- Fails soft per repo if artifact missing.

Verification:
- `pnpm exec vitest run test/server/api/adminAiGraphifyStatus.test.ts`

Files likely touched:
- `server/api/admin/ai/model-ops/graphify.get.ts`
- `server/utils/graphify.ts`
- `test/server/api/adminAiGraphifyStatus.test.ts`

Scope: Medium.

### Phase 5: Cloudflare Agent Orchestrator

#### Task 5.1: Scaffold read-only orchestrator worker

Description: Add `workers/ai-orchestrator-agent` using Cloudflare Agents patterns, with read-only tools only.

Acceptance criteria:
- Worker has Durable Object binding/migration.
- Tools are read-only: model map, gateway health, social spend sync status, Graphify search.
- No budget/campaign/social publishing writes.
- Local tests can run without live Cloudflare.

Verification:
- `pnpm --dir workers/ai-orchestrator-agent test`
- `pnpm --dir workers/ai-orchestrator-agent wrangler deploy --dry-run` if available.

Files likely touched:
- `workers/ai-orchestrator-agent/*`
- `wrangler.toml` or worker-local `wrangler.toml`

Scope: Large; split further during implementation.

#### Task 5.2: Connect agent run ledger

Description: Have the orchestrator write run summaries into `ai_agent_runs` or call an internal app endpoint.

Acceptance criteria:
- Every manual/scheduled run has status, started/finished timestamps, tool call count, and summary.
- Failures are visible in Model Ops dashboard.
- Secrets are not logged.

Verification:
- Worker tests plus admin endpoint tests.

Files likely touched:
- `server/api/internal/ai-orchestrator/runs.post.ts`
- `workers/ai-orchestrator-agent/src/*`

Scope: Medium.

### Phase 6: Controlled Action Proposals

#### Task 6.1: Allow orchestrator to propose, not execute

Description: Allow the agent to create action proposals through existing HITL paths.

Acceptance criteria:
- Agent can propose budget/spend follow-ups only through existing `ai_pending_actions`.
- Existing confirm/executor paths remain the only write path.
- Model Ops and Command Center show agent proposals distinctly.

Verification:
- `pnpm exec vitest run test/ai/*mcp* test/server/utils/ai*`

Files likely touched:
- `server/utils/ai/pendingActions.ts`
- `server/utils/ai/audit.ts`
- `workers/ai-orchestrator-agent/src/*`

Scope: Medium.

## Recommended Starting Point

Start with Phase 1 and Phase 2 only.

Do not build the Cloudflare Agent worker until:
- the model map exists
- invocation logging exists
- the admin dashboard can show gaps and costs
- social spend AI calls are recorded in the ledger

That keeps autonomy behind governance instead of adding another opaque AI runtime.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Agent writes bypass app permissions | High | Agent starts read-only; proposals only; app executes writes |
| Cost ledger undercounts direct helper calls | Medium | Instrument shared helpers first, then endpoints |
| Pricing goes stale | Medium | Store source URL + updated_at; admin warnings for stale pricing |
| Graphify artifacts missing/stale | Low | Dashboard status and per-repo soft failures |
| Cloudflare AI Gateway auth mismatch | Medium | Existing Groq helper falls back direct; dashboard shows fallback count |
| Dashboard duplicates Command Center | Medium | Model Ops handles model/cost governance; Command Center keeps proposals/action review |

## Source References

- Cloudflare Agents: https://developers.cloudflare.com/agents/
- Cloudflare Agents repo: https://github.com/cloudflare/agents
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Groq supported models/pricing: https://console.groq.com/docs/models
- OpenAI API pricing: https://openai.com/api/pricing/
