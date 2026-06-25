# AI Orchestrator Agent

Local-only foundation for a future Cloudflare Agents SDK orchestrator.

This worker is intentionally read-only at this stage. It exposes:

- `GET /health` for the current read-only tool catalog.
- `POST /tools/call` to call the Pages app-controlled internal endpoint:
  `/api/internal/ai-orchestrator/read-tool`.

`/tools/call` is bearer-authenticated with `INTERNAL_API_KEY` before proxying, and the
app endpoint repeats the same bearer check while owning all data access. The Worker trims
the configured secret for both inbound and app-bound bearer checks so accidental secret
whitespace does not split the auth contract. Blank internal secrets fail before any
app-bound request is sent.
The worker does not directly mutate budgets, campaigns, posts, invoices, or social accounts.
Local tests cover the Worker fetch surface: public `/health`, bearer-protected `/tools/call`,
rejected tool calls, and unknown-route 404s.
The app also exposes `POST /api/internal/ai-orchestrator/manual-check` for internal
bearer-authenticated manual checks of the current read-only tool bundle without enabling
scheduled execution.
Model Ops surfaces orchestrator readiness from the model-map endpoint, including internal
secret readiness, optional worker URL readiness, and current read-tool count.
For local development, set `INTERNAL_API_KEY` in the Pages app environment before using the
Model Ops manual read check. For deployment, set the same `INTERNAL_API_KEY` secret on both
the Pages app and this Worker, then set the app-side `AI_ORCHESTRATOR_WORKER_URL` once the
Worker URL is known.

## Current Tool Contracts

- `model_ops_model_map`
- `model_ops_invocations`
- `model_ops_graphify_status`
- `model_ops_agent_runs`
- `social_spend_sync_status`

All current tools are wired to compact read-only app-side summaries. The app endpoint returns
small status payloads rather than raw admin tables or prompt/model content.
Each read-tool call is logged fail-soft into `ai_agent_runs` as
`run_type = ai_orchestrator_read_tool`, so Model Ops can show orchestrator usage before
scheduled Agents SDK execution is enabled.

## Cloudflare Agents Activation Notes

Sources checked on 2026-06-25:

- Cloudflare Agents overview: https://developers.cloudflare.com/agents/
- Add to existing project: https://developers.cloudflare.com/agents/getting-started/add-to-existing-project/
- Agents API: https://developers.cloudflare.com/agents/runtime/agents-api/
- Routing: https://developers.cloudflare.com/agents/runtime/communication/routing/
- Scheduling: https://developers.cloudflare.com/agents/runtime/execution/schedule-tasks/
- GitHub repository: https://github.com/cloudflare/agents

Cloudflare documents that Agents use Durable Objects for durable identity/state, require
`nodejs_compat`, and use a Durable Object binding plus a `new_sqlite_classes` migration
for state persistence. Routing is normally handled with `routeAgentRequest(request, env)`.

Activation sequence:

1. Install the current `agents` package in this worker workspace.
2. Add and export `XeroFlowOrchestratorAgent extends Agent`.
3. Enable the Durable Object binding and `new_sqlite_classes` migration in `wrangler.toml`.
4. Keep the initial tools read-only and backed by `/api/internal/ai-orchestrator/read-tool`.
5. Add scheduled execution only after read-tool run logging is visible in Model Ops.
