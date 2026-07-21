# platform-agents

Cloudflare Think runtime for durable XeroFlow platform agents.

## Transport Security

The generic Think `/agents/{class}/{instance}` HTTP/WebSocket transport is not
publicly routed. Current product surfaces call authenticated Nuxt
`/api/agency/agents/*` endpoints. The Worker exposes:

- public read-only health metadata at `/health`;
- service-to-service `/tools/*` bridges protected by `INTERNAL_API_KEY`;
- dormant programmatic `/v1/turns/{agent}/{instance}` POST routes protected by
  a separate, short-lived scope assertion and `THINK_TURNS_ENABLED=true`.

The Pages bridge verifies that credential with a fixed-length digest, derives an
immutable service authority from connected Xero tenants and active agency
clients, and rejects any requested tenant/client outside that set before a
specialist runtime or query runs. For Think turns, the authenticated Pages route
derives the same user authority, issues a two-minute HMAC-SHA256 assertion bound
to the user, department agent, opaque Durable Object instance, tenant, allowed
clients, permissions, correlation ID, and unique assertion ID, and sends it in
an Authorization header. The Worker and the app bridge independently verify it.
Model tool arguments can only narrow the signed client/tenant set.

Do not reopen the generic transport with `INTERNAL_API_KEY` in a query string.
The assertion is never returned to the browser, placed in a URL, exposed to the
model, reasoning stream, response, or structured log. Think stores it only as
server-stamped turn metadata so lifecycle recovery can revalidate authority.

Every turn is bounded to four steps, 2,048 output tokens, one retry, a 60-second
stream-stall timeout, reasoning suppression, and an exact domain-tool allowlist.
Workspace tools are excluded. Terminal logs contain only correlation ID, agent,
request ID, status, step/tool counts, and latency—never prompts, assertions,
user IDs, tenant IDs, or client IDs.

Durable chat recovery is bounded to two attempts, one OOM retry, a 60-second
no-progress window, and 64 recovery work units. On exhaustion, the Worker sends
one best-effort event to the internal Pages recovery endpoint. Pages requires
`INTERNAL_API_KEY`, re-verifies the short-lived assertion against the exact
agent and instance, and records a prompt-free Model Ops failure. The recovery
reason, terminal message, partial response, and raw SDK error are never sent.
Repeated delivery of the same recovery incident derives a hashed idempotency
key and is atomically deduplicated in the existing agent-run ledger.

## Current Agent

- `SpendControllerAgent`
  - Cloudflare Workers AI model from `THINK_MODEL`.
  - Durable Object state via `SpendControllerAgent`.
  - Read-only `reviewSpendPacing` tool backed by the Nuxt internal Spend Controller endpoint.
  - Workspace bash disabled.
  - No direct budget, bid, campaign, publish, payment, or account mutation tools.
- `PublishingPlannerAgent`
  - Cloudflare Workers AI model from `THINK_MODEL`.
  - Durable Object state via `PublishingPlannerAgent`.
  - Read-only `reviewPublishingPlan` tool backed by the Nuxt internal Publishing Planner endpoint.
  - Draft-only `draftPublishingPlan` tool returns editable suggestions without creating posts.
  - No direct schedule, approve, publish, delete, or post mutation tools.
- `FinancialWatchAgent`
  - Cloudflare Workers AI model from `THINK_MODEL`.
  - Durable Object state via `FinancialWatchAgent`.
  - Read-only `reviewFinancialWatch` tool backed by stored advisor reports, recommendations, and budget alerts.
  - No direct Xero, invoice, budget, or recommendation mutation tools.
- `TrafficControllerAgent`
  - Cloudflare Workers AI model from `THINK_MODEL`.
  - Durable Object state via `TrafficControllerAgent`.
  - Read-only `reviewTrafficControl` tool backed by recent spend, publishing, and finance agent signals.
  - No direct budget, publishing, invoice, campaign, or Xero mutation tools.

## Local Checks

```sh
pnpm exec tsc -p workers/platform-agents/tsconfig.json --noEmit
pnpm vitest run test/workers/platform-agents/worker.test.ts test/ai/platformAgentScopeAssertion.test.ts test/ai/platformAgentBridgeAssertion.test.ts test/server/api/platformAgentThinkTurnEndpoint.test.ts test/server/api/platformAgentThinkRecoveryEventEndpoint.test.ts
```

## Deploy

This worker is not part of `pnpm deploy:workers`; that script is cron-only.

```sh
pnpm --dir workers/platform-agents deploy
```

Before deploying, set the service credential and a separate scope-signing
secret on this Worker. The corresponding Pages values must match:

```sh
pnpm --dir workers/platform-agents exec wrangler secret put INTERNAL_API_KEY
pnpm --dir workers/platform-agents exec wrangler secret put PLATFORM_AGENT_SCOPE_SIGNING_SECRET
```

Keep both coordinated gates off during the initial deployment:

- Worker: `THINK_TURNS_ENABLED = "false"` in `wrangler.toml`.
- Pages: `PLATFORM_AGENT_THINK_TURNS_ENABLED=false`.

Production activation was approved on 2026-07-21 after evaluation, database
readiness, secret installation, and fail-closed smoke checks. The public turn
transport is authenticated with a separate, short-lived, agent-bound HMAC scope
assertion; the generic Agents SDK transport remains unavailable. Enable both in
a staged release. Turning either one off is the immediate transport rollback.

Pages flags still control runtime availability:

- `SPEND_CONTROLLER_AGENT_ENABLED=true` enables the app and internal read-only endpoints.
- `SPEND_CONTROLLER_AGENT_PROPOSALS_ENABLED=true` enables proposal drafting from the authenticated app route only.
- `PUBLISHING_PLANNER_AGENT_ENABLED=true` enables the publishing planner app and internal review/draft-only endpoints.
- `FINANCIAL_WATCH_AGENT_ENABLED=true` enables the financial watch app and internal read-only endpoints.
- `TRAFFIC_CONTROLLER_AGENT_ENABLED=true` enables the traffic controller app and internal read-only endpoints.

The internal Worker bridge blocks `draftActions`; proposal and post creation remain in the Pages app behind normal user auth and write access. Service credentials are verified fail-closed using fixed-size digests.

## SDK compatibility note

This Worker is tested with `@cloudflare/think` 0.13.x and `agents` 0.17.x. It
uses the documented `chat(..., { metadata })` server-side path for scoped turns.
Do not replace it with `runTurn({ body })` without a regression test: Think
0.13.0 declares that field but its wait-mode implementation does not forward it
to admission.
