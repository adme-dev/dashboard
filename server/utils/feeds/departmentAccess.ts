import { createError, getHeader, type H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { resolveMcpStaffContext } from '~~/server/utils/ai/mcp/staffAuthority'
import type {
  DealerLink,
  FeedDetail,
  FeedProvider,
  FeedProviderContext
} from './types'

/** Browser permission uses fresh identity/role policy, without MCP grants or ADMIN elevation. */
export async function requireDealerFeedAccess(
  event: H3Event,
  clientId?: string,
  write = false
) {
  const user = await requireAuth(event)
  const ctx = await resolveMcpStaffContext(event, user.id, [])
  const admin = ctx.permissionGroups?.includes('ADMIN') === true
  const management
    = ctx.permissionGroups?.includes('MARKETING_MANAGEMENT') === true
  if ((!admin && !management) || (write && ctx.assistantReadOnly))
    throw createError({
      statusCode: 403,
      statusMessage: 'Dealer feed management permission required'
    })
  if (
    clientId !== undefined
    && (!/^[0-9a-f-]{36}$/i.test(clientId)
      || !(await queryOneFresh(
        'SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE',
        [clientId]
      )))
  ) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Active client not found'
    })
  }
  return { user, ctx, admin, management }
}
export function isDealerFeedSellerScoped(
  detail: FeedDetail,
  link: DealerLink
): boolean {
  const allowed = new Set(link.sellerRefs)
  const filters = detail.filters
  if (!allowed.size) return false
  if (Array.isArray(filters.rulesets)) {
    return (
      filters.rulesets.length > 0
      && !(
        Array.isArray(filters.manualIncludeIds)
        && filters.manualIncludeIds.length
      )
      && filters.rulesets.every((r: unknown) => {
        if (!r || typeof r !== 'object' || !('sellerId' in r)) return false
        return typeof r.sellerId === 'string' && allowed.has(r.sellerId)
      })
    )
  }
  const sellers = [
    ...(Array.isArray(filters.sellerIds) ? filters.sellerIds : []),
    ...(Array.isArray(filters.dealerIds) ? filters.dealerIds : [])
  ]
  return (
    sellers.length > 0
    && sellers.every(s => typeof s === 'string' && allowed.has(s))
  )
}
/** Provider org membership plus dealer seller scope must both match. */
export async function requireDealerFeedResource(
  provider: FeedProvider,
  ctx: FeedProviderContext,
  link: DealerLink,
  feedId: string
) {
  const list = await provider.listFeeds(ctx, link)
  const summary = list.find(f => f.id === feedId)
  if (!summary)
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed not found for this client'
    })
  const detail = await provider.getFeed(ctx, {
    providerId: link.providerId,
    feedId,
    platform: summary.platform
  })
  if (detail.id !== feedId || !isDealerFeedSellerScoped(detail, link))
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed not found for this client'
    })
  return detail
}

/** Browser creation is an explicit form submit; a committed hold prevents duplicate provider effects. */
export async function executeDepartmentBrowserFeedCreation<T>(
  event: H3Event,
  clientId: string,
  intent: unknown,
  create: () => Promise<T>
): Promise<T> {
  const { user } = await requireDealerFeedAccess(event, clientId, true)
  const key = getHeader(event, 'idempotency-key')
  if (!key || !/^[a-zA-Z0-9:_-]{16,128}$/.test(key))
    throw createError({
      statusCode: 400,
      statusMessage: 'Idempotency-Key is required'
    })
  const requestKey = `browser-feed:${clientId}:${key}`
  const intentHash = createHash('sha256')
    .update(JSON.stringify(intent))
    .digest('hex')
  const action = 'department_browser_feed_create'
  const claim = await transactionWithoutRetry(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `${user.id}:${requestKey}`
    ])
    const prior = (
      await db.query(
        `SELECT id, resolved_payload, result_payload FROM ai_pending_actions
      WHERE resolved_payload->>'requestKey' = $1 AND user_id = $2 AND tool_name = $3 AND source = 'chat'`,
        [requestKey, user.id, action]
      )
    ).rows[0]
    if (prior) {
      if (prior.resolved_payload.intentHash !== intentHash)
        throw createError({
          statusCode: 409,
          statusMessage: 'Idempotency key belongs to a different feed request'
        })
      return { row: prior, created: false }
    }
    const row = (
      await db.query(
        `INSERT INTO ai_pending_actions (user_id, tool_name, resolved_payload, status, source, executed_at)
      VALUES ($1, $2, $3::jsonb, 'executed', 'chat', NOW()) RETURNING id, resolved_payload, result_payload`,
        [user.id, action, JSON.stringify({ clientId, requestKey, intentHash })]
      )
    ).rows[0]
    return { row, created: true }
  })
  const held = () =>
    createError({
      statusCode: 409,
      statusMessage:
        'Feed creation requires reconciliation; do not submit another create request'
    })
  if (!claim.created) {
    if (claim.row.result_payload) return claim.row.result_payload as T
    throw held()
  }
  try {
    await requireDealerFeedAccess(event, clientId, true)
    const result = await create()
    await transactionWithoutRetry(async (db) => {
      await db.query(
        `UPDATE ai_pending_actions SET result_payload = $3::jsonb
      WHERE id = $1 AND user_id = $2 AND tool_name = $4 AND source = 'chat'`,
        [claim.row.id, user.id, JSON.stringify(result), action]
      )
    })
    return result
  } catch {
    throw held()
  }
}

/** Hosted bindings never inherit ambient local credentials, even when the binding object is empty. */
export function dealerFeedRuntimeEnv(
  event: H3Event
): Record<string, string | undefined> {
  return event.context.cloudflare?.env === undefined
    ? process.env
    : (event.context.cloudflare.env as Record<string, string | undefined>)
}
