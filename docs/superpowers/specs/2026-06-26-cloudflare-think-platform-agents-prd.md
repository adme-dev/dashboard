# PRD: Cloudflare Think Platform Agents

**Date:** 2026-06-26
**Status:** Approved - build started
**Owner:** ADME / XeroFlow
**Primary first slice:** `/agency/social/spend` Spend Controller Agent
**Secondary surfaces:** `/agency/social/publishing/planner`, Traffic Controller, Financial Alerts, Office Assistant watches, AI command center

## 1. Objective

Introduce a durable Cloudflare Think-backed agent layer for platform areas where AI needs memory, tool use, scheduled/proactive work, and recoverable long-running decisions.

The first production slice is a **Spend Controller Agent** for `/agency/social/spend`. It should review pacing, alerts, spend diagnostics, campaign history, and proposed actions, then produce explainable recommendations and draft action plans. It must not write budgets or campaign settings directly in v1. Human approval remains mandatory for any money-moving or publishing action.

## 2. Source Notes

- Cloudflare Think is documented as a stateful agent harness for agents that stream replies, remember conversation state, call tools, resume streams, persist messages, support client tools, support sub-agent RPC, and store state through Durable Object SQLite.
- Cloudflare Think can be used as a top-level WebSocket chat agent or as a sub-agent driven programmatically by another agent.
- Cloudflare Think's own docs position it for persistent memory, long conversations, conversation search, sub-agent systems, proactive agents, scheduled tasks, and durable async submission.
- Existing app surfaces already have the core business logic this PRD should reuse:
  - Spend pacing: `server/api/agency/social/spend/pacing-review.get.ts`
  - Spend alerts: `server/api/agency/social/spend/alerts.get.ts`
  - Spend action plans: `server/api/agency/social/spend/[id]/actions/plan.post.ts`
  - Spend approve/execute/cancel: `server/api/agency/social/spend/[id]/actions/[actionId]/*.post.ts`
  - Publishing AI plan generation: `server/api/agency/social/publishing/ai/generate-plan.post.ts`
  - Publishing board/planner: `app/pages/agency/social/publishing/planner.vue`
  - Financial advisor: `server/api/ai/financial-advisor.get.ts`
  - Office assistant watches: `server/api/cron/office-assistant.post.ts`
  - Model Ops dashboard and agent run surfaces: `app/pages/admin/ai/model-ops.vue`

Source: https://developers.cloudflare.com/agents/harnesses/think/

## 3. Problem

The platform already has many AI-assisted features, but most are direct one-shot completions or endpoint-local AI calls. That works for summaries and generation, but it is not enough for operational control surfaces where the user expects the assistant to:

- remember prior decisions and rejected recommendations;
- monitor conditions over time;
- call multiple tools before answering;
- recover from long-running work or page navigation;
- explain what data informed the decision;
- propose changes without directly applying them;
- escalate high-risk conditions with auditability.

This affects social spend, publishing planning, financial alerts, traffic control, and office assistant watches. Without a durable agent layer, each area will keep rebuilding memory, tool orchestration, proactive checks, and run visibility in inconsistent ways.

## 4. Product Thesis

Use Cloudflare Think for **durable agent control loops**, not for every AI call.

Direct routed AI calls remain best for:

- simple summaries;
- one-off caption generation;
- transcription and TTS;
- deterministic classification;
- short read-only recommendations that do not need memory.

Cloudflare Think should be used where an agent owns an ongoing operational context:

- social spend control;
- publishing strategy and content-calendar planning;
- financial risk watching;
- traffic allocation control;
- office/watch evaluation;
- future cross-agent orchestration from the AI command center.

## 5. Goals

- Add a reusable platform-agent architecture beside the Nuxt app without replacing existing Nuxt APIs.
- Launch a read/propose-only Spend Controller Agent for `/agency/social/spend`.
- Reuse existing spend, publishing, finance, and assistant endpoints as tools instead of duplicating business logic.
- Record agent runs, tool calls, findings, proposals, and user decisions in a common audit shape.
- Surface agent health and model routing in AI Model Ops.
- Keep all risky actions human-confirmed in v1.
- Establish the implementation pattern for later Publishing Planner, Financial Watch, and Traffic Controller agents.

## 6. Non-Goals

- Do not replace the existing AI chat route in this slice.
- Do not migrate all AI calls to Think.
- Do not allow autonomous spend writes, publishing writes, invoice sends, or financial changes.
- Do not rewrite existing social spend, publishing, or finance APIs.
- Do not introduce a second permission model. Agents must use existing app auth, roles, and guarded write chains.
- Do not deploy a generic "agent can do anything" system. Each agent gets a narrow tool registry.

## 7. Users

- **Agency owner/admin:** wants high-confidence operational recommendations without babysitting every dashboard.
- **Paid media manager:** wants pacing issues, campaign anomalies, and safe budget proposals surfaced quickly.
- **Social/content manager:** wants campaign-aware content plans and queue gap recommendations.
- **Finance operator/CFO:** wants durable financial alerts and recurring risk tracking.
- **Platform admin:** wants visibility into agent runs, model assignments, failures, and risk posture.

## 8. Primary Use Cases

### 8.1 Spend Controller Agent

Route: `/agency/social/spend`

The user can ask:

- "What spend issues need attention today?"
- "Which campaigns are pacing too fast or too slow?"
- "Draft safe budget actions for the critical issues."
- "What did we reject last week and did the risk resolve?"
- "Do not recommend changes for stale-sync campaigns."

The agent should:

- call spend summary, pacing review, alerts, diagnostics, history, and action-plan tools;
- summarize findings by severity, platform, client, and confidence;
- propose action plans using the existing plan endpoint;
- store recommendation memory and user decisions;
- refuse execution unless the user uses the existing approve/execute flow.

### 8.2 Publishing Planner Agent

Route: `/agency/social/publishing/planner`

The user can ask:

- "Plan next week's campaign posts for this client."
- "Find queue gaps and suggest drafts."
- "Repurpose high-performing social posts into LinkedIn and Instagram variants."
- "Keep the campaign voice consistent with prior approved posts."

The agent should:

- use campaign, board, queue, slot, calendar, and AI generation tools;
- create draft recommendations only;
- persist campaign memory and approved/rejected plan patterns;
- never schedule or publish without existing approval/publish flows.

### 8.3 Financial Watch Agent

Routes: `/reports`, `/agency/ai/finance`, financial alert surfaces

The user can ask:

- "What financial risks are worsening?"
- "Watch overdue debtors and alert me if the risk increases."
- "Connect ad-spend waste with margin risk."
- "Draft follow-up actions for debtor or pricing risks."

The agent should:

- use the existing financial advisor and Xero/reporting endpoints;
- remember recurring risks;
- compare current alerts against past watch state;
- draft actions or recommendations only;
- require confirmation for any outbound message, invoice, or record mutation.

### 8.4 Traffic Controller Agent

Surface: future command surface plus social spend and campaign controls

The user can ask:

- "Where should we shift traffic this week?"
- "Which campaigns should receive more or less budget?"
- "Are we over-investing in one platform for this client?"

The agent should:

- combine spend, GA4, campaign, creative, and publishing signals;
- create explainable allocation proposals;
- respect guardrails, stale data checks, and client-specific limits;
- require human confirmation for any budget, status, or publishing mutation.

### 8.5 Office Assistant Watch Agent

Surface: Office assistant and scheduled watches

The user can ask:

- "What office watches triggered and why?"
- "Keep monitoring this recurring condition."
- "Summarize watch history for this office."

The agent should:

- migrate selected office-assistant evaluations into durable Think sessions;
- use scheduled/programmatic turns where useful;
- keep current cron rails until the Think pattern is proven.

## 9. Architecture

### 9.1 Deployment Shape

Add one or more companion Cloudflare Workers for Think agents, separate from the Nuxt Pages app:

- `workers/platform-agents`
- Durable Object classes:
  - `SpendControllerAgent`
  - `PublishingPlannerAgent`
  - `FinancialWatchAgent`
  - `TrafficControllerAgent` later

Nuxt remains the source of business APIs, RBAC, and guarded mutations. Think agents call internal app APIs through tool adapters with signed service-to-service authentication.

### 9.2 Tool Boundary

Each agent gets a narrow tool registry:

Spend Controller read tools:

- `getSpendSummary`
- `getPacingReview`
- `getSpendAlerts`
- `getCampaignHistory`
- `getSpendDiagnostics`
- `getConnectionHealth`

Spend Controller propose tools:

- `draftCampaignActionPlan`
- `listExistingActions`

Spend Controller forbidden in v1:

- direct budget execution;
- platform pause/resume;
- bulk budget patch;
- connection mutation;
- anything that bypasses existing approve/execute endpoints.

Publishing read tools:

- `getPublishingBoard`
- `getCampaigns`
- `getQueue`
- `getCalendar`
- `getSlots`
- `getPerformanceSummary`

Publishing propose tools:

- `generatePlanDrafts`
- `draftPostIdeas`
- `draftQueueFill`

Publishing forbidden in v1:

- direct publish;
- direct schedule without explicit UI action;
- deleting posts or campaigns.

Finance read tools:

- `getFinancialAdvisorSnapshot`
- `getAging`
- `getBudgetVariance`
- `getCashflow`
- `getClientFinanceSnapshot`
- `getExistingFinancialAlerts`

Finance propose tools:

- `draftFinancialRecommendation`
- `draftFollowUpTask`

Finance forbidden in v1:

- sending invoices;
- sending reminders;
- editing Xero records;
- writing customer finance fields.

### 9.3 Data and Audit

Create or extend a common agent run/audit model:

- run id;
- agent type;
- tenant/user/client context;
- route/source surface;
- prompt or scheduled trigger;
- model assignment used;
- tool calls and tool results metadata;
- findings;
- proposed actions;
- user decision: accepted, rejected, ignored, edited;
- error/fallback state;
- timestamps and request ids.

Reuse Model Ops agent run visibility where possible so platform admins can inspect:

- which agents are active;
- model routing for each agent;
- tool failures;
- recommendation counts;
- proposal acceptance/rejection;
- blocked risky actions.

### 9.4 Model Routing

All agent model selection must flow through the AI Model Ops runtime assignment layer:

- feature key: `agent_spend_controller`
- feature key: `agent_publishing_planner`
- feature key: `agent_financial_watch`
- feature key: `agent_traffic_controller`
- feature key: `agent_office_watch`

Each key should support:

- provider/model assignment;
- fallback model;
- Cloudflare catalog recommendation;
- telemetry and invocation tracking;
- owner-reviewed production changes.

### 9.5 Human-in-the-Loop Rules

Agent actions are grouped by risk:

| Risk | Examples | Allowed v1 behavior |
|---|---|---|
| Read | summarize, inspect, compare, explain | allowed |
| Draft | draft post, draft action plan, draft recommendation | allowed |
| Propose guarded write | budget plan, queue fill, finance follow-up task | allowed only as pending proposal |
| Execute guarded write | budget execution, schedule/publish, send reminder | blocked in Think v1; must use existing confirmation UI |
| High-risk mutation | Xero changes, platform spend changes, bulk publishing | blocked until later explicit approval |

## 10. UX Requirements

### 10.1 Spend Controller Panel

Add a focused agent panel to `/agency/social/spend`:

- compact header: "Spend Controller";
- selected context: all clients or current filters;
- prompt input with 3-4 presets;
- response panel with findings, supporting data, and proposed next actions;
- "Draft action plan" cards that link into existing approval/execution flow;
- visible state for read-only/propose-only mode;
- run history drawer for the current client or campaign.

The panel should feel like an operational control tool, not a general chatbot.

### 10.2 Publishing Planner Panel

Add later to `/agency/social/publishing/planner`:

- "Ask Planner" panel scoped to selected campaign/client;
- queue gap and content-plan presets;
- generated drafts as editable review cards;
- no auto-schedule or auto-publish.

### 10.3 Finance Watch Panel

Add later to financial surfaces:

- current watch state;
- recurring risks;
- alert severity;
- linked source report numbers;
- draft action recommendations.

### 10.4 Admin Visibility

Extend AI Model Ops with an agent control section:

- active agents and feature keys;
- latest runs;
- error/fallback rates;
- tool failure rates;
- proposal acceptance rates;
- blocked action count;
- model assignment health.

## 11. API Contracts

### 11.1 Agent Session Start

`POST /api/agency/agents/spend-controller/session`

Input:

```ts
{
  clientId?: string | null
  platform?: 'meta' | 'google_ads' | 'tiktok' | 'linkedin' | 'pinterest' | 'snapchat' | 'microsoft_ads' | null
  period?: string | null
  scope?: 'current_filters' | 'all_spend'
}
```

Output:

```ts
{
  sessionId: string
  websocketUrl?: string
  mode: 'read_propose'
}
```

### 11.2 Programmatic Ask

`POST /api/agency/agents/spend-controller/ask`

Input:

```ts
{
  sessionId?: string
  prompt: string
  context?: {
    clientId?: string | null
    mediaSpendId?: string | null
    period?: string | null
    platform?: string | null
  }
}
```

Output:

```ts
{
  runId: string
  answer: string
  findings: Array<{
    severity: 'critical' | 'warning' | 'info'
    title: string
    detail: string
    sourceRefs: Array<{ type: string; id?: string; label: string }>
  }>
  proposedActions: Array<{
    type: 'campaign_action_plan' | 'notification' | 'review'
    label: string
    status: 'drafted' | 'requires_confirmation' | 'blocked'
    payloadRef?: string
    rationale: string[]
  }>
  audit: {
    modelFeatureKey: string
    toolCallCount: number
    blockedActionCount: number
  }
}
```

### 11.3 Agent Run List

`GET /api/admin/ai/model-ops/agent-runs?agentType=spend_controller`

Extend existing run surfaces where possible. The response should include agent type, feature key, run status, model assignment, tool failures, proposed actions, and blocked actions.

## 12. Rollout Plan

### Phase 0: PRD and Contract

- Write this PRD.
- Confirm first slice and safety posture.
- Define tool names and API contracts.
- Confirm Cloudflare Worker/DO deployment shape.

### Phase 1: Shared Agent Foundation

- Add `workers/platform-agents` scaffold.
- Configure Think dependencies and Durable Object bindings.
- Add service-to-service auth between agent Worker and Nuxt internal APIs.
- Add agent run/audit persistence helpers.
- Add Model Ops feature keys for the agent models.
- Add local dev instructions and test harness.

### Phase 2: Spend Controller Read-Only

- Build `SpendControllerAgent`.
- Add read tools for pacing review, alerts, diagnostics, connection health, and campaign history.
- Add `/agency/social/spend` panel in read-only mode.
- Store agent runs and tool summaries.
- Show latest Spend Controller runs in Model Ops.

### Phase 3: Spend Controller Propose-Only

- Add `draftCampaignActionPlan` tool using existing action plan endpoint.
- Ensure proposals are ordinary pending/planned actions.
- Add duplicate proposal protection.
- Add stale-data and stale-sync refusal rules.
- Add UI cards for proposed actions with links into existing approval flow.

### Phase 4: Publishing Planner Agent

- Add `PublishingPlannerAgent`.
- Add board, campaign, queue, slots, and generate-plan tools.
- Add planner panel.
- Add draft-only post plan proposals.
- Store user accept/reject/edit decisions.

### Phase 5: Financial Watch Agent

- Add `FinancialWatchAgent`.
- Add financial advisor/report tools.
- Add recurring watch memory.
- Add alert digest and recommendation panel.
- Keep write actions as drafts only.

### Phase 6: Traffic Controller Agent

- Define traffic-control data sources.
- Combine spend, GA4, publishing, creative, and campaign signals.
- Add allocation recommendation engine.
- Add high-risk review gates before any execution.

## 13. Task List

### Phase 0: PRD and Approval

- [x] Task 0.1: Create PRD and task list.
  - Acceptance: PRD describes objective, scope, architecture, safety gates, rollout, tasks, and success criteria.
  - Verify: Markdown file exists under `docs/superpowers/specs/`.
  - Files: `docs/superpowers/specs/2026-06-26-cloudflare-think-platform-agents-prd.md`

- [x] Task 0.2: Approve first production slice.
  - Acceptance: Stakeholder confirms Spend Controller Agent is the first implementation target.
  - Verify: PRD status updated from draft to approved.
  - Files: this PRD.

- [x] Task 0.3: Land first foundation slice.
  - Acceptance: Platform-agent feature keys are visible to Model Ops and shared run/audit helpers can record read/propose-only agent runs using existing `ai_agent_runs` storage.
  - Verify: Focused model registry, assignment, and platform-agent run tests pass.
  - Files: `server/utils/ai/modelRegistry.ts`, `server/utils/ai/modelAssignments.ts`, `server/utils/ai/platformAgentRuns.ts`, focused tests.

### Phase 1: Shared Agent Foundation

- [x] Task 1.1: Scaffold platform agents Worker.
  - Acceptance: `workers/platform-agents` exists with Wrangler config, package scripts, TypeScript config, and a health endpoint.
  - Verify: Worker unit tests pass and worker TypeScript checks pass.
  - Files: `workers/platform-agents/*`, `test/workers/platform-agents/worker.test.ts`.

- [x] Task 1.2: Add Think runtime bindings.
  - Acceptance: Worker declares Durable Object binding and migrations for the first agent class.
  - Verify: Worker TypeScript check passes and tests cover the advertised runtime surface.
  - Files: `workers/platform-agents/wrangler.toml`, `workers/platform-agents/src/index.ts`.

- [x] Task 1.3: Add service-to-service internal API client.
  - Acceptance: Worker can call the approved Nuxt internal Spend Controller API with shared `INTERNAL_API_KEY` auth; proposal mode remains blocked on the internal bridge.
  - Verify: Unit tests cover header validation, rejected invalid auth, prompt validation, and read-only bridge calls.
  - Files: `workers/platform-agents/src/index.ts`, `server/api/internal/platform-agents/spend-controller/ask.post.ts`, focused tests.

- [x] Task 1.4: Add shared agent run/audit storage.
  - Acceptance: Platform agent runs, tool counts, findings, proposed actions, blocked actions, and proposal decision counts can be persisted and queried through the existing `ai_agent_runs` and `campaign_action_log` audit rails.
  - Verify: Platform-agent run tests, Model Ops API tests, and Spend Controller endpoint tests pass.
  - Files: `server/utils/ai/platformAgentRuns.ts`, `server/utils/ai/spendControllerAgentRuntime.ts`, `server/api/admin/ai/model-ops/agent-runs.get.ts`, tests.

- [x] Task 1.5: Register Model Ops feature keys.
  - Acceptance: Agent feature keys appear in AI Model Ops as runtime-controllable assignments.
  - Verify: Model Ops registry and assignment tests include agent keys.
  - Files: `server/utils/ai/modelRegistry.ts`, `server/utils/ai/modelAssignments.ts`, tests.

### Phase 2: Spend Controller Read-Only

- [x] Task 2.1: Add Spend Controller read tools.
  - Acceptance: Think runtime exposes a read-only `reviewSpendPacing` tool backed by the audited Nuxt pacing review endpoint.
  - Verify: Worker tests cover tool exposure and app bridge execution.
  - Files: `workers/platform-agents/src/index.ts`, `test/workers/platform-agents/worker.test.ts`.

- [x] Task 2.2: Implement `SpendControllerAgent`.
  - Acceptance: Agent has Cloudflare Workers AI model binding, safety prompt, disabled workspace bash, and a read-only pacing review tool.
  - Verify: Worker TypeScript and focused worker tests pass.
  - Files: `workers/platform-agents/src/index.ts`, tests.

- [x] Task 2.3: Add Nuxt bridge endpoints.
  - Acceptance: `/api/agency/agents/spend-controller/ask` exists for authenticated app users, and `/api/internal/platform-agents/spend-controller/ask` exists for authenticated Worker calls.
  - Verify: API tests cover app auth, internal auth, validation, and response shape.
  - Files: `server/api/agency/agents/spend-controller/*.ts`, `server/api/internal/platform-agents/spend-controller/ask.post.ts`, tests.

- [x] Task 2.4: Add Spend Controller panel UI.
  - Acceptance: `/agency/social/spend` shows a compact panel with context selector, prompt presets, answer, findings, and read-only mode badge.
  - Verify: Vue page tests cover render, prompt submit, loading, error, and findings.
  - Files likely touched: `app/pages/agency/social/spend.vue`, `app/components/social/SpendControllerPanel.vue`, tests.

- [x] Task 2.5: Add Model Ops run visibility.
  - Acceptance: Spend Controller runs appear in agent run surfaces with model feature key, status, tool count, findings, proposal counts, blocked counts, and decision telemetry.
  - Verify: Model Ops API and page tests cover platform-agent summary and recent-run rendering.
  - Files: `server/api/admin/ai/model-ops/agent-runs.get.ts`, `app/pages/admin/ai/model-ops.vue`, tests.

### Phase 3: Spend Controller Propose-Only

- [x] Task 3.1: Add action-plan proposal tool.
  - Acceptance: Agent can draft campaign action plans through the existing plan endpoint and persist proposal refs.
  - Verify: Tests prove proposals are planned/draft only and do not execute.
  - Files likely touched: `workers/platform-agents/src/tools/spendActions.ts`, server proposal helpers, tests.

- [x] Task 3.2: Add proposal guardrails.
  - Acceptance: Stale sync, missing budget, unsupported platform, duplicate pending action, or disabled live-write rails block proposals with explanation.
  - Verify: Guard tests cover each blocked condition.
  - Files likely touched: spend proposal utility, tests.

- [x] Task 3.3: Add proposed-action UI cards.
  - Acceptance: Agent response displays action cards that link to existing approve/execute flow and cannot execute inline.
  - Verify: UI tests confirm no direct execute button exists in the agent panel.
  - Files likely touched: `app/components/social/SpendControllerPanel.vue`, spend action components, tests.

- [x] Task 3.4: Record user decisions.
  - Acceptance: accepted, rejected, edited, and ignored proposal decisions are persisted against agent runs through action metadata.
  - Verify: API tests cover approval, cancellation, explicit ignored/edited decisions, and Model Ops displays aggregate counts.
  - Files: `server/api/agency/social/spend/[id]/actions/[actionId]/*.ts`, `server/api/agency/agents/spend-controller/proposals/[actionId]/decision.post.ts`, Model Ops UI, tests.

### Phase 4: Publishing Planner Agent

- [x] Task 4.1: Add Publishing Planner read tools.
  - Acceptance: Agent can read publishing status, campaigns, queue, slots, connected accounts, and upcoming scheduled posts for a scoped client.
  - Verify: API and Worker tests cover client scoping, internal auth, read-only bridge behavior, and Think tool exposure.
  - Files: `server/utils/ai/publishingPlannerAgentRuntime.ts`, `server/api/agency/agents/publishing-planner/ask.post.ts`, `server/api/internal/platform-agents/publishing-planner/ask.post.ts`, `workers/platform-agents/src/index.ts`, tests.

- [x] Task 4.2: Add draft-only plan tools.
  - Acceptance: Agent can call existing `generate-plan` and return editable draft suggestions.
  - Verify: Tests prove no schedule or publish mutation occurs.
  - Files: shared planner generation utility, Publishing Planner agent runtime, internal bridge, Worker Think tool, tests.

- [x] Task 4.3: Add planner agent panel.
  - Acceptance: Planner route supports campaign-scoped agent prompts and draft recommendation cards.
  - Verify: Vue tests cover generate, edit draft, discard, and accept-as-draft flows.
  - Files: `app/components/social-publishing/PlannerAgentPanel.vue`, planner route wiring, Vue tests.

### Phase 5: Financial Watch Agent

- [x] Task 5.1: Add financial read tools.
  - Acceptance: Agent can read financial advisor snapshot, aging, budget variance, cashflow, and client finance context.
  - Verify: Tool tests cover disconnected Xero, missing tenant, and scoped access.
  - Files: `server/utils/ai/financialWatchAgentRuntime.ts`, authenticated/internal endpoints, Worker Think tool, tests.

- [x] Task 5.2: Add watch memory.
  - Acceptance: Agent can persist recurring financial watch state and compare latest results to prior runs.
  - Verify: Tests cover new, unchanged, worsened, and resolved watch states.
  - Files: `platform_agent_watch_states` migration, Financial Watch fingerprint persistence, endpoint tests.

- [x] Task 5.3: Add financial alert UI.
  - Acceptance: Finance surfaces show durable watch findings and draft recommendations.
  - Verify: Endpoint and Worker tests cover read-only behavior; UI test coverage remains to be added for severity/source rendering.
  - Files: `app/components/finance/FinancialWatchPanel.vue`, `/agency/ai/finance` Advisor tab wiring.

### Phase 6: Traffic Controller Agent

- [ ] Task 6.1: Define traffic-control data contract.
  - Acceptance: Data sources, freshness rules, risk rules, and proposal types are documented.
  - Verify: PRD section or follow-up design exists before implementation.

- [ ] Task 6.2: Build allocation recommendation engine.
  - Acceptance: Engine can compare spend, performance, creative, and publishing signals and produce allocation proposals.
  - Verify: Unit tests cover over-spend, under-delivery, stale data, and conflicting signals.

- [ ] Task 6.3: Add Traffic Controller UI.
  - Acceptance: Users can review allocation proposals with source refs and required confirmation state.
  - Verify: UI tests and manual smoke cover proposal review.

## 14. Success Metrics

Spend Controller v1:

- 90 percent of agent runs return a structured finding or a clear no-action-needed response.
- 0 direct budget executions from the Think agent.
- 100 percent of proposed actions have source refs and rationale.
- Stale-sync campaigns never produce budget-change proposals.
- Admin can inspect each run in Model Ops.
- Tool failure rate and model fallback rate are visible.

Platform-level:

- Reusable agent foundation supports at least three agent types without duplicating auth, audit, model routing, or tool telemetry.
- Each high-risk action has a human-confirmation path and blocked-action audit.
- Agents reduce duplicated one-off orchestration code for proactive AI features.

## 15. Testing Strategy

- **Unit tests:** tool adapters, guardrails, proposal eligibility, model feature key registry, agent run utilities.
- **API tests:** session/ask endpoints, auth, tenant scoping, request validation, blocked writes.
- **Worker tests:** Think agent run behavior, tool-call wiring, error recovery, no-data paths.
- **Vue tests:** panel render, prompt submit, loading/error states, findings, proposed action cards, no direct execute controls.
- **Integration smoke:** local dev route `/agency/social/spend` with mocked or seeded spend data.
- **Production smoke:** unauthenticated routes remain blocked; authenticated admin can see panel; no proposal can execute without existing approval flow.

Verification commands will be finalized during implementation, but the expected baseline is:

```bash
pnpm vitest run test/server test/app
pnpm exec vue-tsc --noEmit --skipLibCheck --project tsconfig.json
pnpm run build
```

Run `pnpm run build` only after the development slice is complete.

## 16. Rollback Plan

- Ship each agent behind explicit feature flags.
- Default all agents to read-only/propose-only.
- Disable Worker routes or feature flags to remove UI access without changing existing spend/publishing/finance flows.
- Keep existing Nuxt APIs as the source of truth.
- Do not remove existing cron/watch/AI endpoints until replacement behavior is proven in production.

Suggested flags:

- `PLATFORM_AGENTS_ENABLED`
- `SPEND_CONTROLLER_AGENT_ENABLED`
- `SPEND_CONTROLLER_AGENT_PROPOSALS_ENABLED`
- `PUBLISHING_PLANNER_AGENT_ENABLED`
- `FINANCIAL_WATCH_AGENT_ENABLED`
- `TRAFFIC_CONTROLLER_AGENT_ENABLED`

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Agent proposes unsafe money-moving action | High | v1 is read/propose only; stale-data guardrails; existing approval/execute flow remains required |
| Tool auth bypass | High | service-to-service signing, existing user/tenant scope, narrow tool registry |
| Cloudflare Think runtime maturity | Medium | start with Spend Controller read-only; keep Nuxt endpoints as source of truth; feature flags and rollback |
| Recommendation hallucination | Medium | structured tool outputs, source refs, no unsupported claims, deterministic guardrails for proposals |
| Duplicate proposals | Medium | dedupe by campaign/action/source/budget/period before creating proposal |
| Operational opacity | Medium | persist run/tool/proposal audit and expose in Model Ops |
| Too much chatbot UI | Medium | route-scoped control panels with presets and structured findings |

## 18. Open Questions

- Should the first Worker host all agent classes, or should Spend Controller ship as its own Worker first?
- Should Think sessions be scoped by user, client, campaign, or route context for Spend Controller v1?
- Which production domain should the agent WebSocket endpoint use?
- Do we want the Spend Controller panel always visible, or behind an "Ask AI" drawer to preserve dashboard density?
- Should proposal decision memory affect future recommendations immediately, or only after an explicit "remember this preference" action?

## 19. Approval Gate

Before implementation starts, confirm:

- Spend Controller is the first production slice.
- v1 remains read/propose-only.
- Existing approval/execute flows remain the only way to mutate spend.
- Model Ops is the admin visibility layer for model assignment and agent runs.
- Publishing Planner, Financial Watch, and Traffic Controller are follow-on slices, not part of the first build.
