# platform-agents

Cloudflare Think runtime for durable XeroFlow platform agents.

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
  - No direct schedule, approve, publish, delete, or post mutation tools.

## Local Checks

```sh
pnpm exec tsc -p workers/platform-agents/tsconfig.json --noEmit
pnpm vitest run test/workers/platform-agents/worker.test.ts
```

## Deploy

This worker is not part of `pnpm deploy:workers`; that script is cron-only.

```sh
pnpm --dir workers/platform-agents deploy
```

Before deploying, set the same secret on this Worker and the Pages app:

```sh
pnpm --dir workers/platform-agents exec wrangler secret put INTERNAL_API_KEY
```

Pages flags still control runtime availability:

- `SPEND_CONTROLLER_AGENT_ENABLED=true` enables the app and internal read-only endpoints.
- `SPEND_CONTROLLER_AGENT_PROPOSALS_ENABLED=true` enables proposal drafting from the authenticated app route only.
- `PUBLISHING_PLANNER_AGENT_ENABLED=true` enables the publishing planner app and internal read-only endpoints.

The internal Worker bridge blocks `draftActions`; proposal drafting remains in the Pages app behind normal user auth and write access.
