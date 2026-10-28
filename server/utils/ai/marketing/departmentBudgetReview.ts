import { createHash } from 'node:crypto'
import { getOrgTenant } from '~~/server/utils/tokenStore'
import { invalidateSpendPeriodCaches } from '~~/server/utils/socialSpendCache'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { requireMarketingDepartment } from './departmentAuthority'
import { requireScopedClient, resolveMarketingReadScope } from './readScope'
import { assertMarketingCapabilityAtBoundary, requireIndependentMarketingReviewer } from './reviewAuthority'
import { setDepartmentBudgetAllocations } from './departmentBudgetOperations'
import { departmentBudgetUpdateSchema, departmentBudgetProposalSchema, departmentBudgetExecuteSchema, departmentBudgetReviewSchema } from './departmentBudgetSchemas'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'

const ACTION = 'department_budget_allocation'
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function deny(message: string): never {
  throw new Error(message)
}
interface Proposal {
  id: string
  user_id: string
  status: string
  expires_at: string
  resolved_payload: {
    clientId: string
    revision: string
    requestKey: string
    requestDigest: string
    input: unknown
    review: {
      id: string
      decision: 'approve' | 'reject'
      revision: string
      reason: string
    } | null
  }
  result_payload: Record<string, unknown> | null
}
const view = (row: Proposal) => ({ proposalId: row.id, requesterId: row.user_id, clientId: row.resolved_payload.clientId, revision: row.resolved_payload.revision,
  allocations: row.resolved_payload.input, review: row.resolved_payload.review, status: row.status, expiresAt: row.expires_at, result: row.result_payload, providerChanged: false })
/** Immutable allocation proposal with independent review; apply/audit/receipt commit together. */
export async function executeDepartmentBudgetProposal(name: string, raw: unknown, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  try {
    const read = name === 'marketing_get_budget_proposal'

    if (!read && (!/^mcp:[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(digest)))
      deny('Invalid request identity')

    const fresh = await requireMarketingDepartment(ctx, !read)

    if (name === 'marketing_propose_budget_allocations') {
      const input = departmentBudgetUpdateSchema.parse(raw)

      input.changes.sort((a, b) => a.spendId.localeCompare(b.spendId))

      await requireScopedClient(await resolveMarketingReadScope(fresh), input.clientId)

      const revision = sha(input)

      return await transactionWithoutRetry(async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${fresh.userId}:${key}`])

        const prior = (await db.query(`SELECT * FROM ai_pending_actions WHERE user_id = $1 AND source = 'mcp' AND tool_name = $2 AND resolved_payload->>'requestKey' = $3 FOR UPDATE`, [fresh.userId, ACTION, key])).rows[0] as Proposal | undefined

        if (prior) {
          if (prior.resolved_payload.revision !== revision || prior.resolved_payload.requestDigest !== digest)
            deny('Conflicting request identity')

          return ok(view(prior))
        }

        const rows = (await db.query(`SELECT m.id, m.budget_allocated FROM media_spend m JOIN agency_clients c ON c.id = m.client_id
          WHERE m.id = ANY($1::uuid[]) AND m.client_id = $2 AND c.is_active = TRUE ORDER BY m.id FOR UPDATE OF m,c`, [input.changes.map(c => c.spendId), input.clientId])).rows

        if (rows.length !== input.changes.length || input.changes.some(c => !rows.some(r => r.id === c.spendId && Math.round(Number(r.budget_allocated) * 100) === Math.round(c.expectedBudget * 100))))
          deny('Allocation records changed or unavailable')

        const payload = { clientId: input.clientId, revision, requestKey: key, requestDigest: digest, input, review: null }

        const row = (await db.query(`INSERT INTO ai_pending_actions (user_id,tool_name,resolved_payload,status,source,conversation_id,expires_at)
          VALUES ($1,$2,$3::jsonb,'proposed','mcp',NULL,NOW()+INTERVAL '24 hours') RETURNING *`, [fresh.userId, ACTION, JSON.stringify(payload)])).rows[0] as Proposal

        return ok(view(row))
      })
    }

    const review = name === 'marketing_review_budget_allocations'

    if (!read && !review && name !== 'marketing_set_budget_allocations')
      deny('Unknown budget operation')

    const input = (read ? departmentBudgetProposalSchema : review ? departmentBudgetReviewSchema : departmentBudgetExecuteSchema).parse(raw)

    await requireScopedClient(await resolveMarketingReadScope(fresh), input.clientId)

    const cacheTargets: Array<{
      period: string
      platform: string
    }> = []

    const outcome = await transactionWithoutRetry(async (db) => {
      const row = (await db.query(`SELECT * FROM ai_pending_actions WHERE id = $1 AND source = 'mcp' AND tool_name = $2 FOR UPDATE`, [input.proposalId, ACTION])).rows[0] as Proposal | undefined

      if (!row || row.resolved_payload.clientId !== input.clientId)
        deny('Budget proposal unavailable')

      if (read)
        return ok(view(row!))

      const proposal = row!, payload = proposal.resolved_payload

      if (!('expectedRevision' in input) || payload.revision !== input.expectedRevision)
        deny('Budget proposal revision changed')

      const author = await assertMarketingCapabilityAtBoundary(fresh.event, proposal.user_id, input.clientId, 'department_management')

      if (!author.permissionGroups?.includes('MARKETING_MANAGEMENT'))
        deny('Requester no longer has department authority')

      if (review) {
        if (proposal.user_id === fresh.userId || proposal.status !== 'proposed' || Date.parse(proposal.expires_at) <= Date.now())
          deny('Independent current proposal review required')

        await requireIndependentMarketingReviewer(fresh.event, { requesterId: proposal.user_id, clientId: input.clientId, reviewerId: fresh.userId })

        const decision = departmentBudgetReviewSchema.parse(input)

        if (payload.review && (payload.review.id !== fresh.userId || payload.review.decision !== decision.decision))
          deny('Proposal already reviewed')

        payload.review = { id: fresh.userId, decision: decision.decision, revision: payload.revision, reason: decision.reason }

        await db.query(`UPDATE ai_pending_actions SET resolved_payload = $2::jsonb, confirmed_by = $3 WHERE id = $1 AND status = 'proposed'`, [proposal.id, JSON.stringify(payload), fresh.userId])

        return ok(view(proposal))
      }

      if (proposal.status === 'executed' && proposal.result_payload)
        return ok({ ...proposal.result_payload, replayed: true })

      if (proposal.status !== 'proposed' || Date.parse(proposal.expires_at) <= Date.now() || payload.review?.decision !== 'approve' || payload.review.revision !== payload.revision)
        deny('Unexpired independently approved proposal required')

      const reviewer = await assertMarketingCapabilityAtBoundary(fresh.event, payload.review.id, input.clientId, 'department_management')

      if (!reviewer.permissionGroups?.includes('MARKETING_MANAGEMENT'))
        deny('Reviewer no longer has department authority')

      await requireIndependentMarketingReviewer(fresh.event, { requesterId: proposal.user_id, clientId: input.clientId, reviewerId: payload.review.id })

      const result = await setDepartmentBudgetAllocations(payload.input, fresh, key, digest, db)

      if (result.ok === false)
        throw Object.assign(new Error(result.error), { budgetResult: result })

      cacheTargets.push(...(await db.query<{
        period: string
        platform: string
      }>('SELECT DISTINCT period, platform FROM media_spend WHERE client_id = $1 AND id = ANY($2::uuid[])', [input.clientId, departmentBudgetUpdateSchema.parse(payload.input).changes.map(change => change.spendId)])).rows)

      await db.query(`UPDATE ai_pending_actions SET status = 'executed', executed_at = NOW(), result_payload = $2::jsonb WHERE id = $1 AND status = 'proposed'`, [proposal.id, JSON.stringify(result.data)])

      return result
    })

    // Cache failures cannot turn an already-committed allocation into a retryable write failure.
    if (outcome.ok && cacheTargets.length) {
      try {
        const tenant = await getOrgTenant(fresh.event)

        await Promise.all(cacheTargets.map(target => invalidateSpendPeriodCaches(fresh.event, {
          ...target, clientId: input.clientId, tenantId: tenant?.tenantId
        })))
      } catch {
        /* Fresh MCP reads remain authoritative; cached dashboards expire normally. */
      }
    }

    return outcome
  } catch (error) {
    return (error as {
      budgetResult?: ToolResult
    }).budgetResult ?? fail('Budget proposal unavailable, stale, or not independently approved', 'forbidden')
  }
}
