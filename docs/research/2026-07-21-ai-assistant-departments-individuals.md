# R&D: AI Assistant for Every Department and Individual

**Date:** 2026-07-21
**Product:** XeroFlow Agency
**Status:** Research recommendation
**Scope:** Department assistants, personal employee assistants, execution, governance, rollout, cost, and success measures

## Executive decision

XeroFlow should not build a separate bot for every department or employee. It should finish one governed assistant platform that composes four layers at run time:

1. **Individual identity** — the signed-in employee, their role, department memberships, client assignments, preferences, and personal memory.
2. **Department skill-packs** — shared instructions, tools, policies, knowledge, workflow templates, KPIs, and escalation rules.
3. **Company governance** — RBAC, client and tenant scope, action risk tiers, approvals, audit, model policy, cost limits, and kill switches.
4. **Specialist platform agents** — durable or scheduled agents only for jobs that genuinely benefit from persistent state, proactive monitoring, or cross-domain orchestration.

The employee experiences “my assistant,” but the platform remains one maintained engine. A department is a governed capability definition, not a shared chat identity. An individual assistant is a scoped instance of that definition, not a separately trained model.

This is a product-completion program, not a greenfield build. The current repository already includes the core tool loop, six personas, 44 registered agency tools, role defaults, personal/department/organisation memory, approval and audit infrastructure, L1/L2 routing, a My Assistant page, a Command Center, portal and office surfaces, and four durable platform agents. The principal gaps are department coverage, first-class department configuration, evaluations, admin governance, employee transparency, production activation evidence, and a measured rollout.

One Cloudflare-specific issue needed action before those durable agents could be treated as production-ready: at research time the Worker protected its `/tools/*` bridges with `INTERNAL_API_KEY`, but called `routeAgentRequest(request, env)` for `/agents/*` without an authentication and instance-scope gate. C0.1 and C0.2 now default-deny that unused generic transport locally and use one fail-closed service verifier. The C0.3 app/runtime foundation now derives immutable user/service scope from RBAC, assignments, connected tenants, and active clients before all four specialist runtimes. C0.4 now adds tenant ownership to `budget_alerts`, stamps new rows from authenticated authority, and proves mixed Tenant A/Tenant B finance, spend, publishing, and traffic inputs cannot cross the model-visible result boundary. This is not a production claim: the migration is not deployed, future Think instance/user binding remains open, and C0.5 turn limits and lifecycle telemetry are not yet implemented.

## How might we

How might we give every agency employee an assistant that understands their work, remembers useful context, and safely completes work across XeroFlow without duplicating agents, weakening permissions, surveilling employees, or allowing probabilistic models to make consequential decisions unchecked?

## R&D scope and interpretation

This report covers:

- all operational departments represented by the platform and role model;
- both shared departmental intelligence and persistent individual assistance;
- knowledge access, decision support, content/draft generation, and execution;
- autonomy from read-only assistance through human-approved writes;
- target architecture, capability matrices, governance, risks, costs, roadmap, and KPIs;
- internal staff, with the existing client-portal assistant treated as a separately isolated surface.

The actual production department records were not queried. Department definitions should ultimately be generated from the governed `departments` and `department_members` records rather than hard-coded from this research taxonomy.

## Current-state audit

### What is already real in the repository

| Foundation | Current evidence | R&D assessment |
|---|---|---|
| Shared assistant engine | `server/utils/ai/toolLoop.ts`, `server/utils/aiChatEngine.ts` | Correct base; do not fork it per department. |
| Department/role focus | `server/utils/ai/personas.ts`, `rolePersona.ts` | Six personas exist: general, finance, marketing, sales, account, and media buyer. |
| Tools | `server/utils/ai/tools/index.ts` | 44 registered agency tools across finance, delivery, paid media, CRM, creative, knowledge, social, email, leads, and memory. |
| Permission ceiling | `server/utils/ai/toolRegistry.ts`, `server/utils/permissions.ts` | Tools are filtered before model exposure and checked again at execution. Configuration narrows; it does not grant. |
| Safe writes | `pendingActions.ts`, `executors/*`, `audit.ts` | One propose -> confirm -> execute -> audit spine with `confirm` and `rich_confirm` tiers. |
| Personal memory | `server/utils/ai/memory/*`, migration 180 | Semantic, episodic, and procedural memory primitives exist with bounded retrieval. |
| Shared memory | migration 187, `proposeTeamMemory.ts` | Department and organisation scopes exist; department promotion is human-gated. |
| Observe and learn | `server/utils/ai/observe/*`, migration 188 | User-scoped work-event learning is built and globally flag-gated; sensitive event types are excluded. |
| Personal controls | `app/pages/agency/ai/my-assistant.vue`, `agentConfig.ts` | Employees can select a persona, disable permitted tools, enable/disable memory, and remove observed memories. |
| Routing | `server/utils/ai/controller/*` | L1 selects one pack; L2 can decompose across up to three RBAC-permitted packs. |
| Governance view | `server/utils/ai/commandCenter.ts` and related APIs/UI | Proposals, action audit, usage/cost, memory stats, and KB drafts are assembled for management. |
| Knowledge governance | `proposeKnowledgeArticle.ts`, knowledge publish/reject APIs | Agents can draft knowledge, but cannot auto-publish shared truth. |
| Durable agents | `workers/platform-agents/` | Four Think agents exist and are deliberately read-only/draft-only. The generic transport is now default-denied locally, and app/service bridges require an immutable runtime scope. Signed per-user Think instance binding and complete tenant-level alert isolation remain required before production exposure. |
| External interoperability | `workers/mcp-server/`, `server/utils/ai/mcp/*` | MCP is present with scope, consent, assertion, and rate-limit controls. |
| Isolated surfaces | office and portal copilot modules | Staff, office-room, and portal contexts are separated; portal tools use a physically separate registry. |
| Automated coverage | `test/ai/*` and related server/worker tests | Strong contract/unit coverage exists for tools, scope, memory, controllers, approvals, and workers. |

### Important distinction: built is not the same as operationally proven

The runtime flags in `nuxt.config.ts` default to false unless explicitly enabled. This audit did not inspect production secrets or deployment settings, so it does not claim that the staff tool loop, L2 controller, memory distillation, observe-and-learn, portal writes, or every platform agent is active in production.

The repository has extensive deterministic tests, but it does not yet show a complete department-by-department evaluation program measuring live model behaviour: tool-selection accuracy, groundedness, refusal quality, memory precision, task success, cross-scope leakage, or user outcomes. That is the largest readiness gap.

## Options considered

| Direction | Value | Feasibility | Main problem | Decision |
|---|---:|---:|---|---|
| One general assistant for everyone | Medium | High | Too many tools and weak domain focus; poor trust for specialist work. | Reject as the only model. Keep as fallback. |
| One shared bot per department | Medium | Medium | Shared identity conflicts with per-user RBAC, client scope, memory, and accountability. | Reject. Share definitions and knowledge, not identity. |
| One independently built bot per employee | Medium | Low | Configuration drift, duplicated tools, ungovernable cost and maintenance. | Reject. Personalise one platform at run time. |
| Multi-agent swarm for most work | Potentially high | Low | Coordination, latency, cost, and security surface exceed the value for normal turns. | Reject as default. Use bounded L2 only when cross-domain work warrants it. |
| Deterministic workflows only | High for fixed processes | High | Cannot handle open-ended analysis, drafting, and discovery well. | Use for consequential side effects, not as the entire assistant. |
| **Layered federation** | **High** | **High** | Requires disciplined capability and governance modelling. | **Recommended.** |

The recommendation follows a “least complexity / least agency” rule. A single scoped assistant handles normal work. Deterministic workflows handle predictable consequential processes. Durable specialist agents handle monitoring and long-running work. L2 multi-agent orchestration is an exception, not a default.

## Target operating model

### The four layers

```text
Employee / surface
    |
    v
Personal assistant context
  identity + role + departments + client scope + preferences + personal memory
    |
    v
Policy and routing layer
  intent -> skill-pack(s) -> RBAC intersection -> risk tier -> model/cost policy
    |
    +----------------------+------------------------+
    |                      |                        |
    v                      v                        v
Read/draft tools       Action gateway          Durable specialists
grounded answers       propose/approve/audit   schedules/workflows/monitoring
    |                      |                        |
    +----------------------+------------------------+
                           |
                           v
Context and knowledge plane
  personal memory | department knowledge | org KB | client data | audit/evals
```

### Department assistant definition

Each department should become a versioned data definition with:

- department ID and accountable owner;
- purpose and supported jobs-to-be-done;
- allowed role and permission groups;
- focused skill-packs and tool allowlists;
- department memory/knowledge scopes and approved sources;
- standard workflows, templates, checklists, KPIs, and terminology;
- action risk policy and required approver(s);
- proactive schedules and notification policy;
- model, context, latency, and spend budgets;
- evaluation suite version and minimum release score;
- status: draft, pilot, active, suspended, or retired.

This is the missing “department product” layer. The current code has personas and department memory, but not a complete governed department-assistant contract.

### Individual assistant definition

Every employee should receive an assistant instance composed from:

```text
effective capabilities =
  company-enabled capabilities
  intersection department skill-packs
  intersection role/RBAC permissions
  intersection client assignments and tenant scope
  minus personal tool disables
  minus temporary policy restrictions
```

Personal data should include only what is needed to improve the employee’s work:

- preferred name, tone, response density, and working hours;
- role, department memberships, manager/escalation route, and client assignments;
- pinned goals, active priorities, and recurring routines;
- explicit personal memories and transparent observed memories;
- preferred channels and notification quiet periods;
- action defaults that can only narrow the company policy;
- recent outcomes and feedback used for evaluation, not hidden employee scoring.

No individual model fine-tuning is required. Personalisation should remain retrieval, configuration, and scoped state.

## Department capability blueprint

The autonomy ceiling below is the maximum recommended end-state. Rollout should still begin at read/draft or propose/confirm.

| Department / cohort | Primary jobs for the assistant | Existing foundation | Recommended additions | Maximum autonomy |
|---|---|---|---|---|
| **Leadership and management** | Morning operating brief; portfolio risk; capacity, profitability, pipeline, delivery and cash synthesis; assign follow-ups | Generalist, finance/account packs, L2 controller, Command Center, Financial Watch and Traffic Controller | Dedicated leadership pack; goal/KPI context; decision log; scenario comparisons; delegated follow-up workflow | Auto-read and draft; confirm assignments; dual approval for consequential financial or people actions |
| **Account management / client service** | Account briefing; risks, overdue work and approvals; convert briefs; prepare client updates; assign and reprioritise work | Account pack; client/project/task/brief/social tools; capacity; assign/status/convert proposals | Client-meeting prep and recap; next-best-action; renewal/retainer risk; approval chase; client communication drafts | Auto-read/draft; confirm task/project changes and outbound communication |
| **Paid media** | Pacing checks; campaign diagnosis; budget health; anomaly explanation; plan budget changes and alerts | Media-buyer pack; pacing, campaign, budget and social reads; rich budget proposal; Spend Controller | Search/ad-level diagnostics; experiment log; creative fatigue signals; daily exception digest; rollback verification | Auto-read/draft; rich confirm for live budget/bid/status changes; never silent live changes |
| **Marketing, social and email** | Content planning; channel performance; inbox/listening; email campaign analysis; draft/schedule content | Marketing pack; social, listening, inbox, email, news and scheduling tools; Publishing Planner | Dedicated marketing role default; campaign calendar; brand/compliance checks; cross-channel reporting; approval routing | Auto-read/draft; confirm scheduling/sends; client approval where required |
| **Creative and design** | Creative queue; brief interpretation; brand retrieval; concept and production assistance; proof progression | Creative queue and proof-status tools; banner/video/audio/MCP generation foundations; creative role currently maps to marketing | Dedicated creative pack; brand-kit retrieval; version/resize/export workflow; proof feedback synthesis; asset lineage | Auto-read/generate drafts; confirm proof/status/export/publish; no unapproved final release |
| **Production and project management** | Daily workload; blockers; capacity balancing; task creation/assignment/status; brief-to-plan; handoffs | Account pack; task, project, capacity and brief-convert tools; office context | Dedicated producer/PM instructions; dependency planning; timeline variance; meeting-to-actions; delivery checklist workflows | Auto-read/draft; confirm assignments/status changes; policy-based automation only for reversible housekeeping |
| **Sales and CRM** | Lead and pipeline briefing; opportunity research; activity logging; follow-up and quote drafting | Sales pack; CRM, pipeline, leads, client, brief and opportunity/quote/activity tools | Lead qualification with evidence; stale-deal detection; meeting preparation; handoff to account management | Auto-read/draft; confirm CRM writes; manager approval for pricing exceptions and binding quotes |
| **Finance** | Cash/P&L snapshot; profitability; forecast; anomalies; EOM preparation; expense approval recommendations | Finance pack; snapshot, profitability, retainer, over-servicing, revenue and expense/EOM tools; Financial Watch | Reconciliation explanation; variance narratives; control evidence; dual-control policy; Xero validation workflow | Auto-read/draft; rich or dual approval for EOM/Xero/payment-impacting actions |
| **Bookkeeping / accounts** | Expense classification; invoice and reconciliation queues; missing evidence; exception follow-up | Finance pack; expense classification and finance reads | Dedicated bookkeeping instructions; duplicate detection; document chase; reconciliation work queue | Auto-read/draft classification; confirm ledger changes; never autonomous payment or final financial sign-off |
| **People and HR** | Policy Q&A; onboarding/offboarding checklists; role/profile administration; review-cycle preparation | HR subsystem, department membership and governance routes; no HR assistant pack in the main registry | Dedicated HR pack and physically constrained tool subset; onboarding workflow; policy retrieval; evidence summaries; employee-visible provenance | Auto-read/draft only for people decisions; confirm administration; **no autonomous hiring, termination, pay, promotion, performance rating, or disciplinary decision** |
| **Operations and automation** | Cross-team exception queue; workflow health; SLA and backlog monitoring; playbook execution | Generalist, automation permission group, office watches, orchestrator and platform-agent status | Operations pack; workflow-run tools; integration health; incident triage; deterministic recovery runbooks | Auto-read/monitor; confirm remediation; policy-based auto-retry only when idempotent and reversible |
| **Engineering / IT** | Incident and deployment briefing; logs/status; technical knowledge; issue/task creation; runbook guidance | Developer role exists but has no permission groups or assistant default; Model Ops and orchestration status tools exist | Engineering pack; repository/runbook search; deploy and service health; incident timeline; strict environment and production boundaries | Auto-read/draft; confirm issue/task changes; production changes remain normal CI/CD and change-control workflows |
| **General members, viewers and guests** | Find information; understand assigned work; get navigation and process help | Generalist; read-only roles already block mutating tools | Constrained employee-help pack; onboarding and process navigation; explicit data-scope explanations | Read and draft only; viewers/guests never receive write tools |

### Priority order

1. **Account management / production** — high-frequency work, existing low/medium-risk tools, measurable cycle-time reduction.
2. **Paid media** — strongest differentiated “advise to governed action” loop, with rich confirmation already designed.
3. **Finance/bookkeeping** — strong read value; introduce writes more slowly because assurance stakes are higher.
4. **Creative and marketing** — large productivity upside once brand and approval context are reliable.
5. **Sales** — good existing tool coverage and clear CRM outcome metrics.
6. **Leadership/operations** — most valuable after specialist signals and evaluations are trustworthy.
7. **HR and engineering** — build deliberately because their data and execution policies differ materially from the existing commercial packs.

## Individual experience blueprint

An employee should not have to choose a bot before every task. The assistant should present one continuous surface with transparent routing.

### Daily experience

1. **Start of day:** an optional briefing assembled from permitted tasks, clients, approvals, alerts, and routines.
2. **During work:** grounded answers and drafts using the current screen, client, project, office room, or conversation as context.
3. **Action:** a proposal card that shows exactly what will change, why, source data, approver, blast radius, and rollback path.
4. **Cross-department request:** the assistant visibly consults a bounded set of specialist packs and returns one answer; it does not expose an internal swarm UI.
5. **End of work:** an optional recap of completed actions, pending approvals, and commitments.
6. **Control:** “What my assistant knows,” edit/delete memory, disabled tools, active scopes, and why a capability is or is not available.

### Personalisation maturity

| Level | Capability | Release guidance |
|---|---|---|
| P0 | Role and permission-aware | Mandatory baseline |
| P1 | Department and client-assignment-aware | Mandatory baseline |
| P2 | Explicit preferences and memories | Enable in pilot with user controls |
| P3 | Observed routines from system-of-record events | Enable only after privacy impact assessment, notice, and precision evaluation |
| P4 | Proactive suggestions | Separate opt-in or clearly governed activation; never autonomous consequential action |

## Autonomy and approval policy

| Tier | Behaviour | Examples | Required controls |
|---|---|---|---|
| **A0 Inform** | Read and explain | Status, performance, policy, search | Scope enforcement, citations/provenance, freshness indicators |
| **A1 Draft** | Produce an editable artefact without side effects | Email, report, plan, caption, quote draft | Clear AI label, human review, no external send |
| **A2 Propose** | Resolve an action and await one-person confirmation | Create/assign task, log CRM activity, schedule a draft | Proposal expiry, idempotency, payload preview, audit |
| **A3 Policy execute** | Execute a reversible low-risk action under an explicit policy | Retry a failed sync, housekeeping, known-safe status transition | Pre-approved policy, bounded values, rollback, alerts, sampled review |
| **A4 Controlled high-risk** | Execute only after rich or dual approval | Live budget change, EOM/Xero action, pricing exception | Independent validation, rich evidence, separation of duties, rollback/reconciliation |
| **Prohibited** | The assistant must not decide or execute | Employment decisions, payments, secret access, privilege grants, destructive bulk actions | Hard-coded denial outside the model; no tool exposed |

The model should never be the only enforcement point. Permissions, scope, validation, value limits, idempotency, approval, and audit must remain deterministic server controls.

## Architecture recommendations

### Keep the existing interactive engine

Do not rewrite the Nuxt tool-calling loop onto Cloudflare Agents solely for architectural consistency. It already has the required permission, proposal, memory, routing, and test foundations. A rewrite would add migration risk without creating user value.

### Use Cloudflare Agents selectively

Use durable Agents for identities that need persistent state, schedules, WebSockets, or continuous monitoring. The existing platform-agents Worker already demonstrates this shape. Keep authenticated app-side APIs as the source of authority and do not give durable agents direct unrestricted database or vendor mutation access.

## Cloudflare agentic infrastructure and Project Think assessment

### What Think is, and where it fits

Cloudflare separates the **Agents SDK runtime** from an opinionated **agent harness**. The runtime supplies the `Agent` class, Durable Object identity and state, routing, communication, scheduling, and recovery primitives. Project Think supplies the behavioural loop above it: persistent and branching conversations, streaming, resumable turns, workspace tools, session memory and compaction, search, sub-agent RPC, programmatic turns, lifecycle hooks, and optional Workflow integration.

Think is therefore a strong fit for XeroFlow's persistent specialists and proactive monitors. It is not a reason to migrate the mature in-app personal assistant. That assistant already has custom Groq/model routing, RAG, per-tool RBAC, memory, proposals, approval cards, audit, and Vue streaming behaviour. Migration should occur only if a benchmark shows a clear reliability or delivery advantage.

### Recommended Cloudflare platform map

| Layer | Cloudflare/XeroFlow component | Responsibility |
|---|---|---|
| Product and authority | Nuxt/Nitro on Pages plus Neon | Authentication, RBAC, tenant/client scope, deterministic business logic, records, proposals, approval, execution, and audit |
| Durable agent runtime | Agents SDK on Workers and Durable Objects | Stable specialist identity, serialized state, WebSockets, alarms, resumable execution, and RPC |
| Behavioural harness | Project Think | Tool loop, sessions, streaming/recovery, compacted conversation context, programmatic turns, and bounded sub-agents |
| Durable process | Cloudflare Workflows | Explicit multi-stage processes, retries, waits, approvals, compensation, and idempotent side effects |
| Event plane | Queues, Cron Triggers, webhooks, and `submitMessages` | Convert business events and schedules into idempotent agent or workflow work |
| Model plane | Workers AI and current external providers through AI Gateway | Model choice, fallback, rate/spend controls, metadata, analytics, caching where safe, and provider portability |
| Context/data | Neon, Durable Object SQLite, Vectorize, R2 | Business records; agent/session state; semantic retrieval; large artefacts and immutable evidence respectively |
| Tool interoperability | MCP plus typed internal app capabilities | Portable tools, per-user OAuth where appropriate, scopes, versioning, and least privilege |
| Security edge | Access/Zero Trust, signed short-lived tokens, Worker secrets, route hooks | Authenticate transports, bind the caller to the agent instance, and prevent direct use of internal authority |
| Observability | Agent lifecycle hooks, Model Ops ledger, AI Gateway analytics, Workers logs/Tail Workers | Trace turn -> model -> tool -> proposal -> approval -> result, with tenant-safe metadata and alerts |

### Workload placement decision

| Workload | Recommended runtime | Reason |
|---|---|---|
| Personal interactive assistant | Keep the current Nuxt assistant engine | Mature custom RBAC, RAG, memory, approval, audit, and UI contract; no rewrite benefit proven |
| Spend, publishing, finance, and traffic specialists | Think on Durable Objects | Persistent specialist identity, recovery, streaming, scheduled/programmatic work, and bounded tools fit well |
| EOM, campaign launch, onboarding/offboarding, publishing approval | Workflows, with Think only for defined reasoning steps | The process owns state, retries, waits, approval and compensation; the model does not own the transaction |
| Scheduled or event-driven investigations | `submitMessages` or scheduled tasks with an idempotency key | Durable, proactive turns without inventing a public chat client |
| Cross-department answer | Existing bounded L2 first; Think sub-agents only after evals | Avoid duplicating orchestration and contain fan-out, latency, scope, and cost |
| External tools and user-authorised systems | MCP with scoped OAuth or service binding | Standard interoperability without a shared super-user credential |

### Current Think implementation: strengths

- Four Durable Object classes already extend `Think<Env>`: Spend Controller, Publishing Planner, Financial Watch, and Traffic Controller.
- Tools are narrow, domain-specific, and call app-side APIs rather than receiving database or vendor mutation credentials.
- Direct mutations are excluded; proposal and execution authority remains in XeroFlow.
- `workspaceBash` is disabled in all four classes.
- The Worker-to-app bridges require a shared secret, and app-facing routes use the normal XeroFlow authentication layer.
- Feature flags and the existing Nuxt fallbacks make rollback practical.

### Current Think implementation: priority gaps

| Priority | Finding | Required response |
|---|---|---|
| **P0 — contained locally** | The research snapshot exposed the generic `/agents/{class}/{instance}` transport without an authentication wrapper. C0.1 now removes that unused public routing path in the local worktree; no repository evidence proves what is deployed. | Verify the deployed Worker before enabling it. Keep the transport private unless signed short-lived user/tenant-scoped tokens and server-derived instance binding are implemented. |
| **P0 — partially remediated locally** | The app and authenticated service boundaries now derive immutable actor, connected tenant, and explicit client allow-lists; all four runtimes require that scope. Spend and Financial Watch bind allowed clients in SQL, Financial Watch binds the tenant across reports/recommendations/alerts/state, Publishing Planner preserves ownership through aggregates, and Traffic Controller no longer permits a null/unrestricted ledger read. Mixed-result fixtures fail closed for all four specialists. Future browser/programmatic Think turns do not yet carry a signed per-user scope, and the new alert migration is not deployed. | Keep `/agents/*` closed. Add signed short-lived per-user instance scope before any transport enablement, and deploy only after migration review/backfill evidence. |
| **P1** | Setting `workspaceBash = false` disables Bash, not the rest of Think's default workspace file tools. The business specialists do not need a general workspace. | Override the remaining built-ins with deny stubs or use a custom harness if zero workspace tools are required; expose only named domain tools to these specialists. |
| **P1** | Think defaults to ten tool rounds and sends reasoning chunks. Neither is overridden. | Start with `maxSteps` around 3–5 per specialist, set time/token/tool budgets, and set `sendReasoning = false` for end-user surfaces. Show concise evidence and rationale, not private chain-of-thought. |
| **P1** | There are no visible lifecycle-hook subscriptions, Gateway trace correlation, per-tool timeouts, stream-stall policy, or end-to-end tenant-safe trace. | Add a correlation ID and lifecycle telemetry into Model Ops; alert on repeated tool failure, auth rejection, recovery exhaustion, cost anomalies, and scope denials. |
| **P1** | The default model is `@cf/moonshotai/kimi-k2.7-code` for non-code finance, media, publishing, and operations work. | Run the same department golden sets across candidate Workers AI and external models; choose by task quality, latency, safety, and cost rather than a global default. |
| **P2** | Think's richer sessions, compaction/search, scheduled tasks, programmatic submissions, Workflow adapter, sub-agents, and agent skills are not yet used. | Adopt capabilities only for a measured use case. Start with authenticated idempotent submissions and schedules, then one Workflow; do not turn on features to satisfy framework completeness. |
| **P2** | Think Actions and Agent Skills/script execution are currently experimental, while XeroFlow already has a mature approval/action spine. Actions also default each turn to a full authorization grant unless `authorizeTurn()` narrows it. | Keep XeroFlow's propose -> confirm -> execute -> audit contract authoritative. Evaluate Actions later as an adapter, not a replacement; if adopted, deny by default in `authorizeTurn()` and grant only server-derived permissions. Do not enable skill scripts for business agents initially. |
| **P2** | Pre-1.0 Think/Agents dependencies use caret ranges, and four classes duplicate model and bridge patterns in one file. | Pin exact versions for production, use upgrade canaries and contract tests, and extract a shared secure base/bridge while keeping separate least-privilege tool sets. |

### Cloudflare rollout sequence

1. **C0 — contain:** make `/agents/*` private or authenticated, derive scope server-side, fix spend/finance query scope, add cross-tenant and direct-route tests, and confirm production Access/routes.
2. **C1 — observe:** connect Agent lifecycle, tool, Gateway, cost, recovery, and proposal events to the Model Ops ledger; establish per-agent SLOs and golden evals.
3. **C2 — activate durability:** add idempotent programmatic submissions and scheduled exception checks for one specialist; configure bounded steps, recovery, concurrency, and notifications.
4. **C3 — prove one Workflow:** move one approval-heavy process to Workflows, using Think only for a well-defined reasoning step and keeping app-owned execution.
5. **C4 — decide, do not assume, migration:** benchmark the in-app engine against Think for personal-assistant tasks. Migrate only capabilities with a demonstrated reliability, maintainability, or experience gain.

This recommendation is intentionally a **hybrid control plane**, not “all AI on Agents.” It preserves the accepted ADR direction—Cloudflare for durable orchestration, XeroFlow for authority—while applying Project Think where its persistence and recovery features create real leverage.

### Use Workflows for deterministic, long-running side effects

Cloudflare Workflows are a better fit than an open-ended model loop when a process has durable steps, retries, long approval waits, or non-repeatable side effects. Candidate workflows include EOM preparation, client campaign launch, brief-to-delivery, and multi-stage publishing approval. An idle approval wait does not need to keep an agent active.

### Treat MCP as a governed capability boundary

- maintain an allowlisted MCP server catalog;
- require per-user OAuth where the user’s identity should be inherited;
- bind every tool to explicit scopes and a stable version;
- review tool descriptions and runtime responses as untrusted input;
- hide or hash sensitive instance IDs in callback paths;
- record server, tool, scope, arguments, approval, and result in the action ledger;
- deny newly discovered mutating tools until an administrator reviews and classifies them.

### Add a first-class capability catalog

Extend the existing personas/tool registry into a governed catalog containing department ownership, risk tier, data classification, required permission, external systems touched, approval rule, rollback method, test suite, and current release status. This should be the single source for My Assistant, Command Center, MCP projection, platform agents, and evaluation generation.

## Governance, privacy, and security

### Governance controls required before broad activation

- appoint an accountable AI product owner and department capability owners;
- publish an internal acceptable-use and action-responsibility policy;
- maintain an inventory of models, agents, tools, data sources, and vendors;
- perform a use-case risk assessment for each department pack and each new write tool;
- version prompts, skill-packs, tools, approval policies, and eval results;
- provide a global kill switch plus per-department, per-tool, and per-agent suspension;
- require release gates based on evaluations rather than code completion alone;
- define incident triage, disclosure, evidence retention, rollback, and post-incident review.

### Employee privacy constraints

The assistant’s personal memory and observed work patterns involve personal information. Before enabling observe-and-learn or proactive routines broadly:

- complete a Privacy Impact Assessment and employment-law review;
- tell employees what is collected, why, where it is stored, who can see it, retention, and how to challenge or delete it;
- make learned memory visible and correctable;
- never use personal assistant memory or interaction volume as a hidden performance score;
- keep sensitive HR, health, disciplinary, compensation, credential, and private-message data out of routine inference unless a separately approved use case requires it;
- define retention and offboarding deletion for personal memory and OAuth tokens;
- prevent personal memory from being promoted automatically to department or organisation knowledge;
- review the Australian automated-decision transparency obligation scheduled for 10 December 2026 if any use can materially affect rights or interests.

The current “global opt-in, transparency not consent” design for observed work should be revisited with privacy/legal stakeholders. A global flag is an operational control, not a substitute for purpose limitation, notice, access, correction, retention, and meaningful human control.

### Security threat model priorities

| Threat | Required mitigation |
|---|---|
| Prompt injection through briefs, email, social, web, files, or MCP | Treat all retrieved/tool content as data; isolate instructions; adversarial tests; deny tool escalation; sanitize rendered output |
| Excessive agency | Default to A0/A1; expose the smallest toolset; cap steps/fan-out/time/cost; deterministic policies around every side effect |
| Cross-user, cross-client, or cross-department leakage | Enforce scope in routing, immutable agent props, storage queries, and tool handlers; fuzz isolation; no model-supplied tenant IDs |
| Tool or MCP poisoning | Approved server catalog, signed/pinned configuration, description diff review, runtime response handling, per-user OAuth |
| Memory poisoning | Source provenance, user visibility, confidence/salience limits, deduplication, expiration, no auto-promotion to shared truth |
| Goal or instruction drift | Versioned skill-packs; short bounded tasks; checkpoint and revalidate before side effects |
| Cascading multi-agent failure | Fan-out cap, structured contracts, per-delegate RBAC, partial-result degradation, shared budget and deadline |
| Repudiation | Immutable action and model-invocation records with proposer, confirmer, scope, inputs, result, and rollback reference |
| Over-reliance | Evidence-first UI, uncertainty/freshness, editable drafts, human accountability, training and sampled audits |

## Evaluation program

Unit tests prove contracts; they do not prove that a probabilistic assistant is useful or safe. Each department pack needs a versioned evaluation set owned jointly by engineering and a department champion.

### Minimum suite per department

- 25–50 representative “golden” tasks from real work;
- 10+ adversarial or ambiguous requests;
- permission-negative cases for every restricted tool;
- cross-client/cross-user/cross-department isolation cases;
- stale, missing, contradictory, and malicious source-data cases;
- write proposals with correct entity resolution, amounts, scope, approvals, and rollback;
- refusal cases for prohibited actions;
- memory recall, correction, deletion, and poisoning cases;
- regression runs for every model, prompt, tool, or skill-pack change.

### Release gates

| Measure | Initial gate |
|---|---:|
| Correct tool or no-tool selection | >= 95% on the department suite |
| Grounded factual claims supported by retrieved source | >= 95% |
| Permission/scope violations | 0 |
| Consequential action without required approval | 0 |
| Correct entity and resolved payload for write proposals | >= 99% |
| Memory precision on saved/recalled facts | >= 90%, with easy correction/deletion |
| Prohibited-action refusal | 100% |
| L1 P95 response latency | Target < 8 seconds, then tune from measured baseline |
| L2 P95 response latency | Target < 20 seconds, with visible partial-result fallback |

These are recommended starting gates, not claims about current performance. Adjust them from pilot evidence, but do not relax the zero-tolerance security and approval gates.

## Rollout roadmap

### Stage 0 — prove readiness (1–2 weeks)

- inventory the actual production flags, bindings, model assignments, department records, and enabled tools;
- appoint product, privacy/security, and department owners;
- convert current personas into versioned capability-catalog records;
- create baseline evaluation suites for account/production, paid media, and finance;
- run privacy impact and threat-model reviews;
- instrument task success, refusal, scope, proposal, approval, rollback, latency, and cost.

**Exit gate:** zero scope/approval failures; baseline evals recorded; production kill switches and audit verified.

### Stage 1 — read and draft pilot (2 weeks)

- 5–10 users across account/production, paid media, and finance;
- A0/A1 only except existing low-risk create/assign task proposals;
- personal memory explicit-only initially; observed memory remains off;
- weekly qualitative review plus telemetry.

**Exit gate:** useful-answer rate and time-to-task improve; no privacy/security incident; department champions approve progression.

### Stage 2 — governed actions (2–4 weeks)

- enable A2 department by department;
- paid-media rich confirmation, finance read/draft first, sales and marketing low-risk proposals;
- add dedicated creative and leadership/operations packs;
- finish Command Center Govern controls and per-tool suspension;
- add approval timeout, escalation, reconciliation, and rollback verification.

**Exit gate:** >= 99% correct resolved write payload, low rollback rate, all actions audited, no action bypass.

### Stage 3 — company-wide personal assistants (2–4 weeks)

- role/department default for all staff cohorts;
- add HR, engineering, general-member, and dedicated marketing packs;
- enable explicit personalisation and visible memory controls;
- publish training, acceptable-use, and incident processes;
- progressively enable department memory after curation.

**Exit gate:** sustained weekly adoption, trust, cost, and task-success targets across departments.

### Stage 4 — selective proactivity and durable workflows (ongoing)

- enable observed routines only after the privacy/evaluation gate;
- opt in or explicitly govern proactive suggestions separately;
- move appropriate multi-stage work to Cloudflare Workflows;
- keep A3 limited to reversible, policy-bounded operations;
- retain A4 human or dual approval.

An experienced two-engineer team with part-time product, department champions, and privacy/security support could target a controlled company-wide rollout in roughly **8–12 calendar weeks**, because the foundation already exists. This is an R&D estimate; Stage 0 should replace it with a delivery estimate based on the live environment and selected departments.

## Cost model

### Inference

Current Groq list pricing checked on 2026-07-21:

- `openai/gpt-oss-120b`: US$0.15 / million uncached input tokens and US$0.60 / million output tokens;
- `openai/gpt-oss-20b`: US$0.075 / million uncached input tokens and US$0.30 / million output tokens.

At an illustrative 6,000 input and 800 output tokens, a 120B turn is about **US$0.00138**. A 20B memory-distillation call at 1,200 input and 200 output tokens is about **US$0.00015**. Multi-step tool loops, retries, large tool manifests, and L2 delegation can multiply that base, so budget using observed invocation telemetry rather than the single-call estimate.

A practical planning range is **US$2–12 per 1,000 normal assistant turns** before external generation/search tools. At 30 employees, 10 turns per workday, and 22 workdays, that is approximately **US$13–79/month** for text inference. Treat this as an order-of-magnitude estimate, not a quote.

### Platform

- Vectorize is unlikely to be the dominant cost at agency scale; Cloudflare’s published 768-dimension examples range from well under US$1 to a few dollars monthly for tens or hundreds of thousands of queries.
- Workers Paid starts at US$5/month with included Workers and Durable Objects usage. The existing platform likely already carries this base cost.
- Workflows shares Workers request/CPU pricing and adds storage/step billing from 2026-08-10; long idle waits do not incur CPU time.
- Neon, R2, AI Gateway, observability retention, email/SMS, image/video generation, speech, browser automation, paid search, and third-party MCP/API charges are separate.

### Cost controls

- per-turn and per-user budgets;
- one focused skill-pack by default;
- progressive tool/skill disclosure instead of advertising every capability;
- cached static instructions and compact tool responses;
- smaller model for classification, distillation, validation, and summaries where evaluations pass;
- L2 fan-out cap and deadline;
- batch non-interactive work;
- chargeback/showback by department, capability, and external tool;
- cost per successful task, not cost per token, as the business metric.

## Success scorecard

### Business outcomes

- cycle time from brief to actionable project plan;
- time to produce client, campaign, EOM, and leadership reports;
- overdue-task and approval-chase reduction;
- media pacing exceptions detected and resolved earlier;
- CRM follow-up completeness and stale-deal reduction;
- hours of repetitive work avoided, validated against a pre-pilot baseline.

### Adoption and trust

- weekly active assistant users / eligible users;
- repeat usage after four and eight weeks;
- useful-answer rating and task completion rate;
- proposal acceptance, edit-before-acceptance, rejection, and rollback rates;
- percentage of users who inspect or correct memory;
- qualitative trust score by department.

### Safety and quality

- zero unauthorised or unapproved consequential writes;
- zero cross-scope leaks;
- groundedness and correct-tool rate by department;
- prohibited-action refusal rate;
- memory precision and deletion completion;
- incident count, severity, detection time, and recovery time;
- evaluation pass rate by model/prompt/tool version.

### Reliability and economics

- P50/P95 latency for L1, L2, tools, and approvals;
- tool/API error and retry rates;
- cost per active user, turn, successful task, and department;
- workflow completion and manual intervention rates;
- provider fallback and degraded-mode success.

Suggested adoption target: at least 60% weekly active usage among pilot-eligible staff by week eight, but only if the task-success and safety gates are also met. Usage alone is not success.

## Key assumptions to validate

- [ ] The actual production department structure maps cleanly to the proposed skill-pack taxonomy. Validate by exporting governed department/role membership, without employee performance data.
- [ ] Staff experience repeated, high-frequency work that the assistant can shorten materially. Validate with workflow interviews and time baselines in the three pilot cohorts.
- [ ] Existing 44 tools cover most pilot jobs with reliable source data. Validate with golden-task evals and tool freshness checks.
- [ ] Employees trust personal memory when it is visible, correctable, and clearly separated from performance management. Validate through PIA, notice review, and pilot interviews.
- [ ] Rich confirmation provides sufficient understanding for high-risk actions. Validate with usability tests measuring payload comprehension and error detection.
- [ ] The current model mix meets quality/latency needs at projected cost. Validate with model-by-task evals and live telemetry.
- [ ] Department champions will own knowledge, workflows, and evaluation cases. Validate by naming owners before Stage 1.

## Not doing

- **No independently coded bot per department or employee** — capability definitions are shared; identity and memory are scoped at run time.
- **No shared department chat identity** — it weakens per-user RBAC and accountability.
- **No per-user model fine-tuning** — use scoped retrieval, preferences, and memory.
- **No unrestricted multi-agent swarm** — L2 remains bounded and exceptional.
- **No autonomous high-risk writes** — live budgets, finance, external sends, and other consequential actions remain richly approved.
- **No autonomous employment decisions or hidden employee scoring** — HR use remains assistive, reviewable, and contestable.
- **No automatic publishing of personal or inferred memory into shared knowledge** — shared truth remains curated.
- **No wholesale rewrite onto a new agent framework** — extend the working engine and use durable agents/workflows only where they earn their cost.
- **No company-wide launch based only on unit tests** — department evals and controlled pilots are release gates.

## Immediate next decisions

1. Name the accountable product owner, privacy/security reviewer, and department champions.
2. Approve the layered-federation model and “no separate department bots” principle.
3. Choose the first 5–10 pilot users from account/production, paid media, and finance.
4. Authorise a read-only production readiness audit of flags, bindings, models, tools, and telemetry.
5. Authorise Stage 0 evaluation and privacy work before enabling any new flags.

## Sources checked

Repository evidence is cited by file path throughout. External sources were checked on 2026-07-21:

- [Cloudflare Agents: human-in-the-loop patterns](https://developers.cloudflare.com/agents/concepts/agentic-patterns/human-in-the-loop/)
- [Cloudflare Agents: harnesses](https://developers.cloudflare.com/agents/harnesses/)
- [Cloudflare Agents: Project Think](https://developers.cloudflare.com/agents/harnesses/think/)
- [Cloudflare Think: configuration](https://developers.cloudflare.com/agents/harnesses/think/configuration/)
- [Cloudflare Think: tools and default workspace](https://developers.cloudflare.com/agents/harnesses/think/tools/)
- [Cloudflare Think: Actions](https://developers.cloudflare.com/agents/harnesses/think/actions/)
- [Cloudflare Think: lifecycle hooks](https://developers.cloudflare.com/agents/harnesses/think/lifecycle-hooks/)
- [Cloudflare Think: Workflows](https://developers.cloudflare.com/agents/harnesses/think/workflows/)
- [Cloudflare Agents: Agent Skills](https://developers.cloudflare.com/agents/runtime/execution/agent-skills/)
- [Cloudflare Agents: authenticated routing](https://developers.cloudflare.com/agents/runtime/communication/routing/)
- [Cloudflare Agents: cross-domain authentication](https://developers.cloudflare.com/agents/runtime/operations/cross-domain-authentication/)
- [Cloudflare Agents: persistent state](https://developers.cloudflare.com/agents/runtime/lifecycle/state/)
- [Cloudflare Agents: observability](https://developers.cloudflare.com/agents/runtime/operations/observability/)
- [Cloudflare Agents: MCP client](https://developers.cloudflare.com/agents/model-context-protocol/apis/client-api/)
- [Cloudflare Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
- [Cloudflare Workers and Durable Objects pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Vectorize pricing](https://developers.cloudflare.com/vectorize/platform/pricing/)
- [Cloudflare AI Gateway features](https://developers.cloudflare.com/ai-gateway/features/)
- [Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)
- [Groq on-demand model pricing](https://groq.com/pricing)
- [Microsoft: single-agent or multi-agent decision criteria](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/single-agent-multiple-agents)
- [Microsoft: agent architecture components](https://learn.microsoft.com/en-us/agents/architecture/components-of-agent-architecture)
- [Microsoft: reusable agent skills](https://learn.microsoft.com/en-us/agent-framework/journey/adding-skills)
- [NIST AI 600-1: Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [Australian Government: Guidance for AI Adoption — Foundations](https://www.industry.gov.au/sites/default/files/2025-10/guidance-for-ai-adoption-foundations.pdf)
- [Australian Government: Guidance for AI Adoption — Implementation practices](https://www.industry.gov.au/sites/default/files/2025-10/guidance-for-ai-adoption-implementation-practices.pdf)
- [OAIC guidance on privacy and commercial AI products](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/guidance-on-privacy-and-the-use-of-commercially-available-ai-products)
- [OAIC consultation on automated-decision transparency](https://www.oaic.gov.au/engage-with-us/consultations/consultation-on-guidance-for-transparency-in-automated-decision-making)
