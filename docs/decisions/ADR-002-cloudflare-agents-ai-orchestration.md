# ADR-002: Use Cloudflare Agents as AI Orchestration Layer

## Status

Accepted

## Date

2026-06-25

## Context

XeroFlow already has a broad AI surface:

- Groq-backed chat, recommendations, summaries, drafts, and social spend analysis.
- Cloudflare Workers AI / AI Gateway for video/audio generation and edge inference.
- AI tool-loop, MCP tools, pending actions, action audit, user memory, and Command Center.
- Graphify repo context attached to boards/tasks through R2 artifacts.
- Existing deterministic app routes for budgets, social spend, Xero, Meta, Google, portal, and admin workflows.

The platform needs stronger orchestration, model governance, cost visibility, and durable scheduled investigations. It should not let an LLM or agent become the source of truth for business rules, permissions, or writes.

## Decision

Use Cloudflare Agents as the durable orchestration layer for AI workflows, while keeping the Nuxt app and existing server routes as the source of truth.

Cloudflare Agents will handle:

- durable scheduled checks
- cross-feature reasoning
- model/tool routing
- Graphify-aware code/context lookups
- long-running investigations
- memory and run recovery
- action proposals through existing human-in-the-loop pathways

The app will continue to own:

- authentication and RBAC
- deterministic calculations
- database writes
- action approval and execution
- audit logging
- model policy and pricing governance
- admin dashboards

The first implementation phase is visibility-first: build a Model Ops admin dashboard and unified AI invocation ledger before giving agents additional autonomy.

## Alternatives Considered

### Keep all AI orchestration inside Nuxt API routes

Pros:
- Fewer moving parts.
- Reuses existing auth and DB helpers directly.

Cons:
- Poor fit for durable, stateful, long-running agent work.
- Harder to recover/resume investigations.
- Scheduling and tool orchestration stay fragmented across routes and cron jobs.

Rejected because it does not solve durable orchestration.

### Move AI logic wholesale into Cloudflare Agents

Pros:
- Clear single AI runtime.
- Stronger fit for chat, tools, scheduling, and durable state.

Cons:
- Risks bypassing mature app-side permissions, budget checks, and audit trails.
- Would duplicate business logic already implemented in Nuxt routes.
- Higher migration risk.

Rejected because the app must remain the source of truth for writes and deterministic logic.

### Use Cloudflare Agents only for chat

Pros:
- Narrower migration path.
- Easy to map to Agents examples.

Cons:
- Misses the main operational need: model governance, scheduled checks, cost visibility, and cross-feature investigations.

Rejected as too narrow.

## Consequences

- A new Model Ops surface will be added under admin before adding more autonomy.
- All new agent capabilities must start read-only.
- Agent writes must be proposals only; existing app routes execute after approval.
- AI calls should be logged to a unified invocation ledger with provider/model/cost metadata.
- Graphify remains the repo/code context substrate and should be surfaced in Model Ops.
- Cloudflare Agents templates and examples are useful for runtime scaffolding, but the platform should not adopt a template wholesale.

## Related Plan

- `docs/superpowers/plans/2026-06-25-ai-orchestration-model-ops.md`
