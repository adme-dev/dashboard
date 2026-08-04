import type { ToolContext, RiskTier } from '../toolContext'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { Pool } from '@neondatabase/serverless'

export type ExecutorClass = 'local-transactional' | 'internal-http' | 'external-provider'

export interface ExecutionServices {
  /** Stable logical key claimed before dispatch; forward to providers that support idempotency. */
  idempotencyKey: string
  /** Present only for local-transactional executors. Never supplied to HTTP/provider executors. */
  db?: Pick<Pool, 'query'>
}

/**
 * Phase-0 WS-B: the executor registry generalizes the confirm step.
 *
 * Background: Option B (spec §8) splits a write into PROPOSE (the tool persists an ai_pending_actions
 * row) and EXECUTE (the confirm endpoint runs the real mutation on a human click). The confirm
 * endpoint was hardwired to `create_task`. An ActionExecutor is the per-`tool_name` mutation handler,
 * so a new write tool only needs to register one of these — no endpoint changes.
 *
 * The execute() side-effect (an internal $fetch / DB write) is the executor's own concern; tests
 * inject it (see makeCreateTaskExecutor), mirroring the injected-deps pattern used across the tools.
 */
export interface ExecutorResult {
  /** Id of the created/changed entity — surfaced to the client + stored as result_ref. */
  resultRef: string
  /** Natural-language confirmation posted into the chat thread ("✅ Created task …"). */
  summary: string
}

export interface ActionExecutor {
  /** Must match the proposing tool's `name` (the ai_pending_actions.tool_name). */
  toolName: string
  /** Short noun for logs/audit ("task", "budget change"). */
  label: string
  /** Gating tier — mirrors the tool's effectiveRiskTier; the endpoint can demand richer confirm. */
  riskTier: RiskTier
  /**
   * The permission the confirmer must hold, RE-CHECKED at execute time (must match the proposing
   * tool's `requiredPermission`). Defense in depth: the propose-time check + registry filter both run
   * as the proposer, but a role downgraded between propose and confirm would otherwise still execute.
   * Undefined = any write-capable role (the create_task default; still blocked for read-only roles).
   */
  requiredPermission?: PermissionGroup
  /** Explicit durability boundary; callers must never infer this from implementation details. */
  executionClass: ExecutorClass
  /** Run the real mutation from a confirmed, resolved payload. Throws on failure (caller reverts). */
  execute: (payload: any, ctx: ToolContext, services?: ExecutionServices) => Promise<ExecutorResult>
}
