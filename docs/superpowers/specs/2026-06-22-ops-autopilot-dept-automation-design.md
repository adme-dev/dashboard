# Department Operating System — Digital Advertising Lifecycle Orchestration & Automation

**Date:** 2026-06-22
**Status:** Design (program-level) — awaiting review
**Author:** Paul + Claude (brainstorming session)
**Supersedes:** the earlier "Ops Autopilot" framing in this file — expanded to full lifecycle orchestration.

---

## 1. Context & Goal

The dashboard is the **system of record** for agency work (the Monday.com migration scaffolding confirms an active cut-over off Monday). This program turns the dashboard into a **Department Operating System** for Digital Advertising: AI assistants run the **end-to-end job lifecycle** — brief → task → assignment → production → QA → proofing → approval → deployment → live monitoring → reporting → billing — and **call a human only at defined gates.**

**Autonomy model (decided):** *Graduated autonomy on a deterministic lifecycle spine.* AI completes the safe, repetitive, and analytical work autonomously; for consequential actions it **assembles a proposal and a human approves**.

**Autonomy ceiling (decided):** **Any action that spends live client money — budget changes and campaign activation — is ALWAYS human-approved.** No exceptions in the initial design; specific low-risk cases can be loosened later, deliberately.

**Execution model (decided):** *Dual-surface* — each capability is a pure callable unit, surfaced both as (a) an autonomous cron/rule action and (b) a tool on the Digital Advertising department AI assistant.

**Scope (decided):** Department-level (Craig, Garrix, Hannah as role-holders; Matthew as approver), keyed on `client + capability + role`, never a hardcoded person.

## 2. Who this serves (evidence-based)

From a full scan of 312 Monday boards / 28,901 items (1,305 team-owned) + Slack.

| Person | Monday id | Owned | Dominant work | In program |
|---|---|---|---|---|
| Craig Lawrence | 82751293 | 128 | Paid-media ops, tracking, SEO, reporting | Operational core |
| Garrix Lopena | 78099299 | 162 | Campaign **production** | Operational slice only (production stays human) |
| Hannah Lavina (Ads Specialist) | 99302407 | 74 | Campaign **production** | Operational slice only |
| Matthew Crawford (Social & Traffic Ops Mgr) | 24000966 | 954 (710 "Approved To Be Billed") | Approval + oversight | **Escalation approver** |

Co-ownership is rare (team divides work), so the design serves parallel role-holders, not one shared queue.

## 2.5 How the agency actually runs (operational reality)

Validated against the live Monday boards + #digital-advertising-team. The lifecycle is adopted **as practiced**, not invented.

**Real flow:** Brief (Slack / "Agency Briefs" group) → **"Items to Action"** queue → if creative/web needed, handoff to the **`ADME Creative Request`** board (its own pipeline: Brief Required → Copy Required → Active Graphic Design → Designer QA → Awaiting Creative Approval → Approved → Prep Final File → Upload; plus "Active Web Projects" = landing pages, "eDM's") → back to paid → **QA** (QA / QA New Campaign / Review Required) → **Awaiting Approval / Awaiting Client** → build & deploy → **Daily Budget Updates** (statuses Check Daily, Budget Update, Stop Campaign) → **Roll This/Next Month** (monthly recurrence) → **[Platform] Completed [Month]** archive → **Approved To Be Billed** (Invoicing Tracking → "Checked" by Alicia) → EOM/Xero.

**The real state machine is the existing 34-value Status column** (Brief Required, Copy Required, Awaiting Assets, Working On It, QA, QA New Campaign, Awaiting Approval, Awaiting Client, Awaiting OEM Offers, Budget Update, Check Daily, Stop Campaign, Roll This/Next Month, Done, …). The orchestration **adopts these**; the §3 state machine maps onto them.

**Operational truths that reshape priorities:**
- **Budget changes are constant + manual** — requested ad-hoc in Slack ("budget update McRae from 1,000 to 500 now"), set to status `Budget Update`, hand-actioned. → C1 watchdog + human-approve spend is a direct fit.
- **Monthly roll-over is a core cycle** — automotive campaigns `Roll This/Next Month` (the "Reshare" month column). → **new capability C6**.
- **The #1 friction is the confirmation loop** — "briefed but no update in the jobs / not sure if actioned." Matthew briefs, then chases. → auto status-update + actioned-confirmation closes it (a primary value driver).
- **Matthew is the de-facto traffic controller** (briefs work in, chases it) — the AI Traffic Controller augments exactly this role.
- **Every job carries a "Design Budget" (time, 10min–4h)** → feeds capacity routing + billing.
- **Alicia owns invoicing checks** (`Invoicing Tracking`, "Query for Alicia") → an explicit billing-QA step.
- **The team is already AI-forward** — Clara writes briefs with Claude today; a Monday AI agent ("Elena") already gatekeeps brief completeness.

## 3. The job lifecycle state machine (the spine)

The orchestration backbone. `task_statuses` + `approval_workflows` are formalised into an explicit, auditable state machine. Each stage declares an **owner** (human role or AI agent) and a **gate type** (🟢 auto / 🟡 AI-proposes-human-approves / 🔴 human-only).

| # | Stage | Owner | Gate | Automation hook |
|---|---|---|---|---|
| 1 | Brief / intake | Account manager | 🟢→🟡 | AI **brief-completeness gatekeeper** (C5); auto-convert approved brief → task |
| 2 | Create job / task | Account manager + AI | 🟢 | `automation_rules` `create_task` from approved brief |
| 3 | Traffic control / assign | Traffic controller (AI-assisted) | 🟢 | **Capacity-aware auto-routing** (gap-filler G1) |
| 4 | Production | Garrix / Hannah | 🔴 | Human; due-soon/overdue nudges only |
| 5 | Internal QA | Craig (AI-assisted) | 🟢→🟡 | **QA linter** (C3) as a gate |
| 6 | Proofing | Account manager → client | 🟡 | Auto-create proof on QA pass; SLA reminders (G3) |
| 7 | Approval | Matthew / client | 🟡 | Escalation/approval inbox; auto-advance on approval (G2) |
| 8 | Deployment / go-live | Media buyer | 🟡 **(spend gate)** | **Campaign deployment** (Phase E): AI builds PAUSED on-platform → human activates |
| 9 | Live monitoring | Craig (AI) | 🟢 / 🟡 on change | **Pacing watchdog** (C1) + **tracking health** (C4); budget changes → human |
| 10 | Reporting | Account manager (AI) | 🟢 | **Reporting engine** (C2) |
| 11 | Billable | Matthew | 🟡 | Auto-mark-billable (G4) → EOM → Xero |
| — | Oversight | Matthew / management | — | Hub + escalation inbox + capacity dashboard (cross-cutting) |

The machine is deterministic (transitions are explicit and logged); AI performs the *work within* stages and requests *movement* — humans gate the 🟡/🔴 transitions.

## 3.5 Job Bags (campaigns), job-type templates & the funnel

A client deliverable is rarely one ad — it's a **job bag**: the full campaign package spanning the **funnel** (awareness banners → capture pop-ups → landing pages / websites → paid ads incl. inventory/AIA → organic social), produced across **multiple departments** (graphic design/creative, web/production, paid media, social). The **AI Traffic Controller** owns decomposing a job bag into department-routed, funnel-aware subtasks and keeping the whole team + every AI assistant aware of the whole bag.

- **Job Bag entity (net-new):** a top-level `job_bags` (campaign) record grouping all deliverables for one campaign — carries the brief, funnel definition, client, and shared context. Each deliverable is a task in its **owning department**, linked to the bag and its funnel position; cross-deliverable **dependencies** encode funnel order (landing page live before traffic ads; creative approved before ad build).
- **Job-type templates (extend `project_templates`):** the platform already has `project_templates` + `template_phases` + `template_tasks` + `template_roles` + `template_usage_history`. We extend this into a **job-type taxonomy** (`job_types`: paid-media / creative / organic / web — with required departments, proof types, deliverable set, default approval workflow). Instantiating a job-type template against an approved brief produces the bag's deliverable subtasks **pre-routed** to the right departments with the right checklists — replacing today's gap (ad types buried in brief form-fields).
- **Deliverable tooling already exists, the bag connects it:** banner studio + `banner_feeds`, EDM builder (`edm_templates`), video/media studio, social suite (`social_post_templates`), `creative_proofs`, plus the `ADME Creative Request` flow and `All Client Inventory Feeds` board. Today these run *parallel* to tasks; the job bag is what links each deliverable subtask to its production tool.
- **Inventory ads (AIA / PMax) — net-new data model:** feed-driven. There's a `banner_feeds` start + an inventory-feeds board, but no structured catalog/vehicle/feed model. A `client_inventory_feeds` (feed URL, catalog id, platform mapping, sync status) model is required for inventory-ad job types.
- **Shared whole-bag awareness (the "every assistant knows the job bag" requirement):** every deliverable subtask references the bag; each role-agent assembles context from it via the existing `retrieveContext()`. When Garrix's assistant works a banner, it knows it's the "Knox GWM EOFY" funnel with the landing page + AIA lead-gen ad as siblings, their statuses, and the brief. **One shared context object, read by the whole team and all their assistants.**

**AI Traffic Controller flow on a job bag:**
1. Approved brief → AI picks the **job-type template** → creates the **job bag**.
2. Fans out **deliverable subtasks** across departments (creative: banners/pop-ups; web: landing pages; paid: ads incl. inventory; social: posts), wiring funnel dependencies.
3. **Capacity-routes** each subtask to the best-fit available person.
4. Publishes the **shared bag context** so every assignee + AI assistant has whole-job awareness.
5. Drives each deliverable through its stage gates (QA → proof → approval); spend/deploy stay 🟡 human-approved.

## 4. Orchestration architecture

### 4.1 Reuse map — most of this already exists

| Layer | Reuse (exists) |
|---|---|
| **Workflow engine** | `departments`/`tasks`/`task_statuses`/`task_assignees`/`custom_columns` (20+ types) |
| **Job-bag templating** | `project_templates`/`template_phases`/`template_tasks`/`template_roles`/`template_usage_history` |
| **Deliverable tooling** | banner studio + `banner_feeds`, `edm_templates`, video/media studio, social suite (`social_post_templates`), `creative_proofs`, `ADME Creative Request`, `All Client Inventory Feeds` |
| **Shared context** | `retrieveContext()` (core abstraction), scoped to a job bag |
| **Automation engine** | `automation_rules` (triggers/conditions/actions incl. update_field, assign_to, create_task, move_to_status, webhook, slack, delay), `automation_executions` (run log), `scheduled_jobs` (cron rules), `board_automations` |
| **Approval / human-on-call** | `task_approvals`+`approval_workflow_steps` (sequential), `client_approvals` (token sign-off), `notifyApprovalRequest→notifyNextApprover→notifyApprovalCompleted` |
| **Proofing** | `creative_proofs` (draft→internal→client_review→approved), `proof_approvers`, `proof_comments`, versions, portal |
| **Capacity (traffic control data)** | `resource_forecasts`, `v_available_resources`, `team_member_skills`, `capacity_adjustments` |
| **Billing** | `eomEngine.ts` (billable-status jobs → `eom_line_items` → Xero), task billing endpoints |
| **AI agent** | tool registry (`server/utils/ai/tools/`), `toolLoop.ts`, executors, `ai_pending_actions`, `riskTier: auto/confirm/rich_confirm`, Groq `gpt-oss-120b` |
| **Ad spend + writes** | `spendSync.ts`, `budgetPacing.ts`, detectors, `budgetGuardrails.ts`, the plan→approve→execute **live budget-write chain** (Meta/Google) |
| **Deploy (organic)** | `social_posts` publish pipeline (scheduled→published) |
| **Conversion tracking** | `tracking_sites`/`tracking_events`, GA4 facts, `ga4Client.ts`, `fetchGtmConfig()` |
| **Reporting** | `report_schedules`/`report_runs`, social PDF (CF Browser Rendering), R2, Resend |

**Implication:** this program is largely *assembly + a thin orchestration layer + a few net-new evaluators*, not a from-scratch build. The earlier proposed `automation_jobs`/`automation_runs`/`automation_escalations` tables are **mostly redundant**: reuse `automation_rules`/`automation_executions` for jobs+runs, and `task_approvals`/`client_approvals` for escalations. Net-new tables are minimal (see §5–7).

### 4.2 Role-agents

The Digital Advertising department AI assistant (existing tool-calling agent) is given lifecycle tools — `create_task`, `route_to_capacity`, `lint_campaign`, `generate_proof`, `request_approval`, `build_campaign_draft`, `deploy_campaign` (gated), `generate_report`, `mark_billable`, plus the read/inspect tools (`check_pacing`, `check_tracking_health`). It advances a job through stages it's authorised for and **stops at a gate**, raising an approval and notifying the right human.

### 4.3 Graduated-autonomy policy

Encoded via the existing `riskTier`:

| Tier | Actions | Behaviour |
|---|---|---|
| 🟢 **auto** | reporting, QA lint, pacing/tracking scans, capacity routing, status nudges, brief completeness | AI completes; logs to `automation_executions` |
| 🟡 **confirm** (human-on-call) | **budget change, campaign activation**, client-facing proofs, billing, scope/budget changes | AI proposes → `task_approval`/`client_approval` → notify human → **job blocks** until decided |
| 🔴 **human-only** | creative production, strategic/client-relationship & contract calls | AI assists/drafts; human decides |

**Hard rule:** every live-spend action (budget write, campaign activation) is 🟡 — **always human-approved** (the decided ceiling). Enforced both in the agent policy and at the write-path (existing `budgetGuardrails` + approval chain).

### 4.4 Human-on-call mechanism

The escalation/approval **inbox** at `/agency/automation` is a unified view over `task_approvals` + `client_approvals` + capability-raised escalations, grouped by severity/client, gated by the `AUTOMATION` permission group (Matthew default approver). Approving a 🟡 spend action triggers the existing plan→approve→execute chain. Reuses the `notifyApprovalRequest→notifyNextApprover→notifyApprovalCompleted` notification chain.

## 5. Capabilities (the work agents/auto-actions perform)

Each is a pure module surfaced as an auto-action + an assistant tool.

- **C1 — Budget & pacing watchdog** 🟢 *assemble.* `evaluatePacing(client, accounts)` over `budgetPacing.ts`+detectors; daily; flags over/under-pace, no-spend, paused-with-budget, stale-sync. Budget *changes* → 🟡 escalation (never auto-write). New: evaluator wrapper, live daily-budget read-back.
- **C2 — Reporting engine** 🟡→🟢 *extend.* `buildAdReport`/`buildCallReport` reusing report schedules + PDF/email. Auto; escalate on delivery failure. New: `ad_report_schedules`, ad/call templates. *SEO report blocked on data source (§10).*
- **C3 — Campaign QA linter** 🔴→🟢 *net-new AI.* `lintCampaign(campaign)→QaFinding[]` (naming, tracking, conversion action, budget sanity, targeting, UTMs) via Groq. Gate at stage 5. New: checklist module + tool.
- **C4 — Conversion-tracking health monitor** 🔴 *net-new.* `checkConversionHealth(client)` over `tracking_events`+GA4+`fetchGtmConfig()`; flag 0-fired/broken/drifted. New: `client_conversion_actions` registry + drift evaluator.
- **C5 — Brief-completeness gatekeeper** 🟢 *net-new AI* (your "Elena" concept). AI scores brief completeness at intake, requests missing info, auto-assigns on pass.
- **C6 — Recurring monthly roll-over** 🟡 *net-new* (operational reality §2.5). At month boundary, detect `Roll This/Next Month` jobs, clone the campaign job for the new month carrying budget/creative refs, set the right entry status (Brief Required / QA); spend stays human-approved. Removes a large, predictable monthly manual cycle.
- **C7 — Actioned-confirmation loop** 🟢 *net-new* (closes the #1 friction). When a briefed change is applied (status/budget/deploy), auto-update the job status and post confirmation, so "is this actioned?" is answered by the system, not by Matthew chasing.

## 6. Lifecycle gap-fillers (net-new orchestration)

The genuinely missing pieces (vs the engine, which exists):

- **G1 — Capacity-aware auto-routing (the traffic controller).** New `automation_rules` action `route_to_capacity` using `v_available_resources` + skills to assign the best-fit available person. (Recommend: AI *proposes* assignment, auto-applies for routine, human override always available.)
- **G2 — Auto-advance status on approval.** When an `approval_workflow` completes, move the task to the next stage (today it's manual).
- **G3 — Approval SLAs / escalation timeouts.** Wire the existing `auto_approve_after_hours` field to a scheduled job; escalate overdue approvals up the chain.
- **G4 — Auto-mark-billable + EOM handoff.** On stage→done with a billable status, mark billable and feed the EOM engine (shift its source from Monday → dashboard tasks as cut-over completes).
- **G5 — Go-live → monitoring handoff.** On deployment/activation, register the campaign with C1 (watchdog) + C4 (tracking health).
- **G6 — Job-bag decomposition & cross-department fan-out (the AI Traffic Controller).** Net-new `job_types` taxonomy + `job_bags` entity + deliverable fan-out across departments with funnel dependencies + shared `retrieveContext()` scope + `client_inventory_feeds` model. See §3.5. This is the largest net-new orchestration piece; depends on G1 (capacity routing).

## 7. Phase E — Campaign deployment to platforms (final, gated)

The highest-stakes capability; built last; access-blocked.

- **Feasibility:** Meta Marketing API + Google Ads API support campaign/ad-set/ad creation; the live budget-write chain proves the write-path plumbing exists.
- **Access dependencies (prerequisite, not code):** Meta **Advanced Access** (App Review) + broader scopes; Google Ads **Standard developer token**; elevated OAuth scopes beyond today's spend-read.
- **Pattern (enforces the spend ceiling):** AI assembles the campaign from the *approved brief + approved creative* → **creates it PAUSED on-platform** → raises a **deploy-approval** (🟡) → human (media buyer) reviews in Ads Manager and **activates** → C1 watchdog takes over. No auto-activation in initial design.
- **New:** `build_campaign_draft` + `deploy_campaign` tools (deploy gated), a `campaign_deployments` audit table, per-platform payload builders.

## 8. Phased roadmap

| Phase | Delivers | Risk | Depends on |
|---|---|---|---|
| **A — Spine** | Lifecycle state machine + escalation/approval inbox (reuse engine) | Low | — |
| **B — Safe capabilities** | C1, C2, C3, C4, C5 as auto-actions/tools | Low | A |
| **C — Role-agents** | Dept assistant drives stages via tools + graduated-autonomy policy | Med | A, B |
| **D — Gap-fillers** | G1–G5 (traffic control, auto-advance, SLAs, auto-bill, go-live handoff) | Med | A, C |
| **E — Deployment** | Campaign creation to Meta/Google (paused→human-activate) | High | API access; A–D |

Each phase ships behind its own flag, default off.

## 9. Cross-cutting concerns

- **Safety:** spend/deploy always human-approved (§1 ceiling), enforced in agent policy + write-path guardrails + approval chain. Every autonomous action flag-gated, default off. Rollout per the anomalies-runbook discipline (allowlist → enable → broaden).
- **Data model keying:** `client + capability + responsible_role`; role-holder changes are data, not code.
- **Auditability:** `automation_executions` (auto actions), `task_approvals`/`client_approvals` (gated decisions: who/when/why), `campaign_deployments` (deploy audit).
- **Testing:** pure evaluators (pacing, lint, drift, routing, report rollups, brief scoring) unit-tested with fixtures; the spine + gate transitions integration-tested; **no live-platform writes in tests**.

## 10. Open questions / dependencies

1. **Ad-platform API access (blocks Phase E):** Meta Advanced Access + Google Standard dev token must be obtained first.
2. **SEO data source (blocks C2 SEO report + SEO checklist track):** no GSC/Semrush connected — decide connector vs Monday-resident.
3. **Auto-routing autonomy (G1):** AI-proposes vs auto-apply for routine assignments — confirm at Phase D.
4. **EOM source cut-over (G4):** when to switch EOM billable-job source from Monday → dashboard tasks.
5. **Per-action threshold tuning:** deferred to each phase's plan; ceiling stays "human-approve spend/deploy" until explicitly revisited.
6. **Discipline taxonomy cleanup:** `departments` is polluted by imported Monday client boards; the functional disciplines (creative/graphic-design, web/production, paid media, social, account services, ops) need a clean routing taxonomy distinct from client boards.
7. **Social-suite ↔ job-bag linkage:** the social suite (publishing/calendar) currently runs parallel to tasks; it must link to job-bag deliverables so social posts are orchestrated, not siloed.
8. **Job-type template authoring:** who defines the per-job-type templates (deliverable sets + funnel order + checklists) — a one-time setup task per ad type.

## 11. Out of scope

- Creative production (building ads) — stays human; AI-assist only.
- Full lights-out autonomy of spend/deployment — explicitly excluded by the autonomy ceiling.
- Non-Digital-Advertising departments — the spine generalises later, not designed here.
- Replacing Xero/EOM logic — extended, not rebuilt.

## 12. Success criteria

- A job flows brief → billing with AI advancing every 🟢 stage unattended and a human only touching 🟡/🔴 gates.
- No live budget change or campaign activation ever occurs without a recorded human approval.
- Operational duties (pacing, QA, tracking, reporting) run autonomously with full audit in `automation_executions`.
- The team shifts from *executing* to *approving*; adding a client or reassigning a duty needs no code change.
- Phase E can create a campaign on-platform as a paused draft that a human activates in one step.
