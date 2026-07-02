# Project Purpose

XeroFlow Agency is the operating system for a modern digital agency. Its purpose
is to keep client work, social publishing, paid media, finance, approvals,
communication, automation, and AI assistance in one permissioned system of
record.

The product is not a generic dashboard. It is designed to shorten the path from
client intent to executed work:

1. Capture demand through briefs, inbox messages, client requests, social
   engagement, sales activity, and internal tasks.
2. Convert that demand into scoped, accountable work across boards, projects,
   approvals, calendars, content plans, and client-visible milestones.
3. Execute work through deterministic platform actions, not loose chat output.
4. Use AI to recommend, draft, summarize, and propose actions inside RBAC,
   approval, budget, and audit boundaries.
5. Close the loop through reporting, financial controls, client portal evidence,
   and operational health checks.

## Operating Principles

- The app is the source of truth for permissions, business rules, writes, and
  audit trails.
- AI and automation assist the work; they do not bypass deterministic guards.
- Long-running or retry-sensitive automation should be durable, observable, and
  recoverable.
- Human approval is required for risky actions such as spend changes, public
  publishing, client-facing responses, and financial writes unless an explicit
  production-approved autopilot mode exists.
- Client data boundaries are hard boundaries. Tenant and client access checks
  must be applied at API entry points and before dispatching provider actions.
- Graphify stays current as the architecture map for agents, maintainers, and
  Model Ops context.

## Product Pillars

### Agency Work Management

Boards, tasks, project timelines, briefs, approvals, comments, notifications,
time tracking, and client portal milestones give staff and clients one place to
see what is happening and who owns the next step.

### Social And Content Operations

The social suite covers planning, AI-assisted drafting, approvals, scheduling,
multi-account publishing, inbox engagement, engagement attribution, and platform
account health. It should feel like an agency operations tool, not a consumer
posting widget.

### Paid Media And Financial Control

Spend pacing, Meta/Google sync, budget review, Xero invoices, cashflow, EOM
workflow, and profitability analysis exist so account teams can detect risk
early and act with auditability.

### AI Copilot And Automation

The assistant layer should know the platform, the user, the client context, and
the available tools. It should propose concrete next actions, route work to the
right owner, and execute only through permissioned, confirmed platform paths.

### Architecture Intelligence

Graphify, Model Ops, readiness gates, and deployment smoke checks make the code
and production system understandable enough for rapid change without losing
control.

## Enterprise Bar

A feature is enterprise-ready only when it has:

- server-side authorization and tenant/client scoping;
- validation at API and provider boundaries;
- idempotent writes or explicit conflict behavior;
- audit entries for meaningful state changes;
- operational logs or health signals for background work;
- tests covering success, denial, and failure paths;
- light/dark mode compatibility for user-facing UI;
- a rollback or feature-flag path for risky rollout;
- updated architecture documentation when behavior changes.

## Current Execution Focus

The current highest-priority track is making social publishing, engagement,
provider connections, and automation durable enough for production agency use.
Cloudflare Workflows is the durable orchestration layer for retry-sensitive
automation, while the Nuxt app remains the source of truth for validation,
permissions, state transitions, and provider dispatch.
