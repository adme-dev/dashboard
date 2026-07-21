# Cloudflare Think C0 Security Review Packet

**Date:** 2026-07-21
**Decision requested:** Approve, approve with conditions, or reject progression from C0 into capability-catalog and evaluation work.
**Current state:** Local implementation and release verification complete. Both Think turn flags are off. No migration, secret, Worker deployment, or production activation has been performed.

## Review scope

This packet covers the production-safety foundation for four dormant Cloudflare Think specialists:

- Spend Controller: organization/client-scoped, read/propose ceiling.
- Publishing Planner: one selected client, read/draft ceiling.
- Financial Watch: authenticated Xero tenant plus allowed client scope, read-only ceiling.
- Traffic Controller: explicit allowed-client set, read-only ceiling.

The full department/individual roadmap is in [`docs/superpowers/plans/2026-07-21-governed-ai-assistant-platform-implementation.md`](../superpowers/plans/2026-07-21-governed-ai-assistant-platform-implementation.md). This review does not approve later write actions, automation, memory expansion, schedules, workflows, or company-wide rollout.

## Trust boundaries

```text
Authenticated browser
  -> Pages app route (session, RBAC, tenant/client derivation)
  -> short-lived HMAC assertion (one user, agent, instance, tenant/client set)
  -> private Worker turn route (feature flag + assertion verification)
  -> one bound Durable Object specialist (exact tool allow-list)
  -> service-authenticated app bridge (assertion verified again)
  -> scoped runtime/database queries (parameterized + result filtering)

Worker lifecycle hooks
  -> bounded/redacted telemetry
  -> app Model Ops ledger (service auth + assertion verification for late recovery)
```

The browser never receives the service key or scope assertion. Think/model output cannot grant authority, select a broader instance, widen tenant/client scope, or call a live mutation path.

## Required invariants

The reviewer should reject C0 if any invariant is false.

1. `/agents/*` is default-denied and cannot be reopened with a query-string credential.
2. The app derives authority from the authenticated session and database; request/model context may only narrow it.
3. Each assertion is HMAC-SHA256 signed, exact-schema parsed, audience/issuer checked, bound to one agent and deterministic instance, and valid for no more than 120 seconds.
4. `INTERNAL_API_KEY` and `PLATFORM_AGENT_SCOPE_SIGNING_SECRET` are separate secrets and neither appears in source, logs, browser responses, or telemetry metadata.
5. App, Worker router, Durable Object admission, internal app bridge, runtime query, and post-query filtering all preserve the same tenant/client boundary.
6. Every Think specialist exposes only its named domain tools. Workspace, Bash, filesystem mutation, generic fetch, MCP discovery, and arbitrary sub-agent delegation are absent.
7. A turn is capped at four steps, 2,048 output tokens, one model retry, a 60-second stream-stall watchdog, and no reasoning stream.
8. Durable recovery is capped at two attempts, one OOM retry, a 60-second no-progress window, and 64 recovery work units.
9. Recovery/tool errors are stable codes and counters. Upstream error bodies, prompts, partial assistant text, terminal messages, and raw tool exceptions are not persisted.
10. Model Ops records correlation, run/request links, model, token counts, cached input, latency, cost, tool failures, finish state, and recovery state without conversational content.
11. Late recovery replays derive a one-way event key and are atomically deduplicated before a second run or invocation can be written.
12. Staged activation requires separate approval and both kill switches; approval was granted on 2026-07-21 after fail-closed production smoke checks, and either `PLATFORM_AGENT_THINK_TURNS_ENABLED` or Worker `THINK_TURNS_ENABLED` can disable turns immediately.

## Primary review surfaces

- Authority and scope: `server/utils/ai/platformAgentAuthority.ts`, `server/utils/ai/platformAgentScope.ts`
- Assertion: `shared/utils/platformAgentScopeAssertion.ts`
- App turn admission: `server/api/agency/agents/think/turn.post.ts`
- Worker/DO/tools/recovery: `workers/platform-agents/src/index.ts`
- Internal service authentication: `server/utils/ai/platformAgentServiceAuth.ts`
- Late recovery event: `server/api/internal/platform-agents/think/recovery-exhausted.post.ts`
- Runtime query boundaries: `server/utils/ai/{spendController,publishingPlanner,financialWatch,trafficController}AgentRuntime.ts`
- Telemetry ledger: `server/utils/ai/platformAgentThinkTelemetry.ts`, `server/utils/ai/invocationLedger.ts`, `server/utils/ai/platformAgentRuns.ts`
- Model Ops APIs/UI: `server/api/admin/ai/model-ops/{agent-runs,invocations}.get.ts`, `app/pages/admin/ai/model-ops.vue`
- Dormant config/runbook: `workers/platform-agents/wrangler.toml`, `workers/platform-agents/README.md`, `.env.example`

## Verification evidence

The current focused command covers 20 files and 173 tests. It includes authority derivation, assertion tamper/expiry/instance binding, fixed-length service auth, all four tenant/client isolation paths, Xero tenant selection, generic transport denial, response whitelisting, telemetry redaction, cost calculation, Model Ops reconciliation, real recovery-exhaustion hook behavior, and atomic late-recovery replay deduplication.

```bash
pnpm vitest run \
  test/ai/platformAgentAuthority.test.ts \
  test/ai/platformAgentBridgeAssertion.test.ts \
  test/ai/platformAgentScope.test.ts \
  test/ai/platformAgentScopeAssertion.test.ts \
  test/ai/platformAgentServiceAuth.test.ts \
  test/config/budgetAlertTenantIsolationMigration.test.ts \
  test/server/api/financialWatchAgentEndpoint.test.ts \
  test/server/api/publishingPlannerAgentEndpoint.test.ts \
  test/server/api/spendControllerAgentEndpoint.test.ts \
  test/server/api/trafficControllerAgentEndpoint.test.ts \
  test/server/api/spendControllerProposalDecisionEndpoint.test.ts \
  test/server/api/platformAgentThinkTurnEndpoint.test.ts \
  test/server/api/platformAgentThinkRecoveryEventEndpoint.test.ts \
  test/server/api/xeroSelectTenantEndpoint.test.ts \
  test/server/api/adminAiModelOps.test.ts \
  test/server/utils/platformAgentRuns.test.ts \
  test/server/utils/aiInvocationLedger.test.ts \
  test/server/utils/platformAgentThinkTelemetry.test.ts \
  test/app/adminModelOpsPage.test.ts \
  test/workers/platform-agents/worker.test.ts
```

Additional passing gates:

- `pnpm --dir workers/platform-agents run typecheck`
- Scoped ESLint for all new/changed server telemetry and admission modules
- `git diff --check`
- Wrangler 4.110.0 `deploy --dry-run`; all four Durable Objects and Workers AI bind. The Worker was first deployed with `THINK_TURNS_ENABLED=false` and verified fail-closed before coordinated activation.
- A cache-free `npm run build`; Nuxt client/server compilation, prerendering, Cloudflare Pages Nitro packaging, and the final wrapped Worker output all complete successfully

## Open repository gates

These are not hidden by the focused evidence:

1. Repository-wide Nuxt typecheck has a large pre-existing baseline. The global type gate must be restored or explicitly risk-accepted before production activation.
2. The production dependency audit has a pre-existing high-severity OpenTelemetry advisory through `@rocicorp/zero`; it requires a separate compatibility-tested remediation or recorded exception.
3. Migration `267_budget_alert_tenant_isolation.sql` is authored but unapplied. Production activation must not precede migration review, backup/rollback preparation, application, and post-migration isolation checks.
4. This checkout contains unrelated uncommitted work. The C0 release must be promoted from an isolated, reviewed commit or worktree rather than deploying the current mixed working directory.

## Reviewer attack checklist

- Replay an assertion against another agent, instance, user, tenant, client, and after expiry.
- Attempt client/tenant widening through the browser body, model tool arguments, direct Worker route, and internal app bridge.
- Attempt generic `/agents/*`, wrong method/content type, oversized prompt/body/response, malformed model telemetry, and missing configuration.
- Make a tool return mixed-tenant rows and confirm post-query filtering removes them before prompt construction.
- Trigger tool failure, provider failure, stream stall, and recovery exhaustion; inspect app logs, Worker logs, browser response, `ai_agent_runs`, and `ai_invocations` for secret/prompt/error leakage.
- Interrupt or replay the late recovery event and confirm service auth plus agent/instance/permission assertion checks fail closed.
- Confirm proposal paths remain non-executing and no tool can publish, schedule, mutate Xero, change budgets, or bypass the existing action gateway.
- Confirm rollback requires only setting either feature flag false; no schema rollback is required to stop turns.

## Decision record

Reviewer: ____________________
Date: ____________________
Decision: `approve` / `approve with conditions` / `reject`
Conditions or findings:

1. ________________________________________________
2. ________________________________________________
3. ________________________________________________

Approval permits only Phase 1 capability-catalog and Phase 2 evaluation-foundation work. It does not authorize production activation or consequential actions.
