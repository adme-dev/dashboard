// server/utils/ai/marketing/ownerBudgetReview.ts
// Marketing phase 3: the active owner (God mode) can list, read and independently approve/reject the
// marketing department's recorded budget allocation proposals over MCP. Before this, the owner's God-mode
// catalog had no budget review tools, so owner approval of department proposals was impossible over MCP.
//
// The owner only DECIDES here. Applying an approved proposal stays with the department's existing
// `marketing_set_budget_allocations`, which re-verifies an owner approver as a still-active owner.
// Dormant behind MCP_SUITE_CONFIG.marketingDraftReview.
import { createError } from 'h3'
import { z } from 'zod'
import type { ToolContext } from '../toolContext'
import { departmentBudgetProposalSchema, departmentBudgetReviewSchema } from './departmentBudgetSchemas'
import {
  DEPARTMENT_BUDGET_ACTION,
  viewDepartmentBudgetProposal,
  type DepartmentBudgetProposalRow
} from './departmentBudgetReview'

export const OwnerBudgetProposalListSchema = z.strictObject({
  clientId: z.string().uuid().optional(),
  includeExpired: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50)
})

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

export interface OwnerBudgetReviewDependencies {
  enabled(ctx: ToolContext): Promise<boolean>
  isActiveOwner(userId: string): Promise<boolean>
  /** Requester must still hold current department authority for the client. */
  assertRequester(ctx: ToolContext, requesterId: string, clientId: string): Promise<void>
  listRows(input: { clientId: string | null, includeExpired: boolean, limit: number }): Promise<DepartmentBudgetProposalRow[]>
  loadRow(proposalId: string): Promise<DepartmentBudgetProposalRow | null>
  transaction<T>(work: (db: Db) => Promise<T>): Promise<T>
}

function forbidden(statusMessage: string): never {
  throw createError({ statusCode: 403, statusMessage })
}
function conflict(statusMessage: string): never {
  throw createError({ statusCode: 409, statusMessage })
}

const defaultDependencies: OwnerBudgetReviewDependencies = {
  enabled: async (ctx) => {
    const { resolveMcpRuntimeConfig } = await import('../mcp/runtimeConfig')
    return resolveMcpRuntimeConfig(ctx.event).suiteFlags.marketingDraftReview === true
  },
  isActiveOwner: async (userId) => {
    const { queryOneFresh } = await import('~~/server/utils/db')
    return !!await queryOneFresh(
      `SELECT id FROM team_members WHERE id = $1 AND is_active = TRUE AND user_role = 'owner' LIMIT 1`, [userId])
  },
  assertRequester: async (ctx, requesterId, clientId) => {
    const { assertMarketingCapabilityAtBoundary } = await import('./reviewAuthority')
    const author = await assertMarketingCapabilityAtBoundary(ctx.event!, requesterId, clientId, 'department_management')
    if (!author.permissionGroups?.includes('MARKETING_MANAGEMENT')) forbidden('Requester no longer has department authority')
  },
  listRows: async ({ clientId, includeExpired, limit }) => {
    const { queryRowsFresh } = await import('~~/server/utils/db')
    return queryRowsFresh<DepartmentBudgetProposalRow>(
      `SELECT p.id, p.user_id, p.status, p.expires_at, p.resolved_payload, p.result_payload
         FROM ai_pending_actions p
         JOIN agency_clients c ON c.id::text = p.resolved_payload->>'clientId' AND c.is_active = TRUE
        WHERE p.source = 'mcp' AND p.tool_name = $1 AND p.status = 'proposed'
          AND ($2::boolean OR p.expires_at > NOW())
          AND ($3::text IS NULL OR p.resolved_payload->>'clientId' = $3::text)
        ORDER BY p.created_at DESC
        LIMIT $4`,
      [DEPARTMENT_BUDGET_ACTION, includeExpired, clientId, limit]
    )
  },
  loadRow: async (proposalId) => {
    const { queryOneFresh } = await import('~~/server/utils/db')
    return queryOneFresh<DepartmentBudgetProposalRow>(
      `SELECT id, user_id, status, expires_at, resolved_payload, result_payload
         FROM ai_pending_actions WHERE id = $1 AND source = 'mcp' AND tool_name = $2`,
      [proposalId, DEPARTMENT_BUDGET_ACTION]
    )
  },
  transaction: async (work) => {
    const { transactionWithoutRetry } = await import('~~/server/utils/db')
    return transactionWithoutRetry(db => work(db as unknown as Db))
  }
}

export function createOwnerBudgetReviewService(overrides: Partial<OwnerBudgetReviewDependencies> = {}) {
  const deps: OwnerBudgetReviewDependencies = { ...defaultDependencies, ...overrides }

  async function assertOwner(ctx: ToolContext) {
    if (!await deps.enabled(ctx)) forbidden('MARKETING_DRAFT_REVIEW_DISABLED')
    if (ctx.userRole !== 'owner' || !ctx.godModeExecutionKey || ctx.mcpStaffAuthority === 'fresh') {
      forbidden('Owner God-mode authority required')
    }
    if (!await deps.isActiveOwner(ctx.userId)) forbidden('Active owner authority required')
  }

  return {
    async list(ctx: ToolContext, raw: unknown) {
      await assertOwner(ctx)
      const input = OwnerBudgetProposalListSchema.parse(raw ?? {})
      const rows = await deps.listRows({ clientId: input.clientId ?? null, includeExpired: input.includeExpired, limit: input.limit + 1 })
      return {
        proposals: rows.slice(0, input.limit).map(row => ({
          ...viewDepartmentBudgetProposal(row),
          expired: Date.parse(row.expires_at) <= Date.now(),
          awaitingReview: !row.resolved_payload.review
        })),
        more: rows.length > input.limit,
        providerChanged: false
      }
    },

    async get(ctx: ToolContext, raw: unknown) {
      await assertOwner(ctx)
      const input = departmentBudgetProposalSchema.parse(raw)
      const row = await deps.loadRow(input.proposalId)
      if (!row || row.resolved_payload.clientId !== input.clientId) {
        throw createError({ statusCode: 404, statusMessage: 'Budget proposal unavailable' })
      }
      return { ...viewDepartmentBudgetProposal(row), expired: Date.parse(row.expires_at) <= Date.now() }
    },

    /** Owner approve/reject of one exact revision. The requester can never be the approver. */
    async review(ctx: ToolContext, raw: unknown, beforeCommit?: () => Promise<void>) {
      await assertOwner(ctx)
      const input = departmentBudgetReviewSchema.parse(raw)
      const existing = await deps.loadRow(input.proposalId)
      if (!existing || existing.resolved_payload.clientId !== input.clientId) {
        throw createError({ statusCode: 404, statusMessage: 'Budget proposal unavailable' })
      }
      if (existing.user_id.toLowerCase() === ctx.userId.toLowerCase()) forbidden('Requesters cannot review their own proposal')
      if (existing.resolved_payload.revision !== input.expectedRevision) conflict('Budget proposal revision changed')
      if (existing.status !== 'proposed' || Date.parse(existing.expires_at) <= Date.now()) {
        conflict('Budget proposal expired or already applied')
      }
      if (existing.resolved_payload.review) conflict('Budget proposal already reviewed')
      if (input.decision === 'approve') await deps.assertRequester(ctx, existing.user_id, input.clientId)
      await beforeCommit?.()
      return deps.transaction(async (db) => {
        const row = (await db.query(
          `SELECT id, user_id, status, expires_at, resolved_payload, result_payload
             FROM ai_pending_actions WHERE id = $1 AND source = 'mcp' AND tool_name = $2 FOR UPDATE`,
          [input.proposalId, DEPARTMENT_BUDGET_ACTION]
        )).rows[0] as DepartmentBudgetProposalRow | undefined
        if (!row || row.resolved_payload.revision !== input.expectedRevision || row.status !== 'proposed'
          || row.resolved_payload.review || Date.parse(row.expires_at) <= Date.now() || row.user_id === ctx.userId) {
          conflict('Budget proposal changed while reviewing')
        }
        const payload = {
          ...row!.resolved_payload,
          review: { id: ctx.userId, decision: input.decision, revision: row!.resolved_payload.revision, reason: input.reason, kind: 'owner' as const }
        }
        await db.query(
          `UPDATE ai_pending_actions SET resolved_payload = $2::jsonb, confirmed_by = $3 WHERE id = $1 AND status = 'proposed'`,
          [row!.id, JSON.stringify(payload), ctx.userId]
        )
        return {
          ...viewDepartmentBudgetProposal({ ...row!, resolved_payload: payload }),
          reviewerKind: 'owner' as const,
          nextStep: input.decision === 'approve'
            ? 'Approved. The marketing department applies it with marketing_set_budget_allocations (re-validated at apply time).'
            : 'Rejected. No allocation changed.'
        }
      })
    }
  }
}

export const ownerBudgetReviewService = createOwnerBudgetReviewService()
