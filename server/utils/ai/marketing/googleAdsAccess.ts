import { createError } from 'h3'
import { queryOneFresh, queryRows } from '~~/server/utils/db'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { getGoogleAdsActionPlanForActor } from '~~/server/utils/googleAds/actionStore'

/** Only the authenticated owner path stays direct. Ordinary ADMIN is delegated. */
export function delegatedAdsContext(ctx: ToolContext): boolean {
  return (
    ctx.mcpStaffAuthority === 'fresh'
    || (ctx.userRole !== 'owner' && !ctx.godModeExecutionKey)
  )
}
export async function assertGoogleAdsClientAccess(
  ctx: ToolContext,
  clientId: string,
  mode: 'read' | 'plan' | 'review' | 'execute' = 'read'
) {
  if (ctx.clientScope && ctx.clientScope !== clientId)
    throw createError({
      statusCode: 403,
      statusMessage: 'Client scope mismatch'
    })
  const { assertMarketingCapabilityAtBoundary, freshContextCoversClient }
    = await import('./reviewAuthority')
  const { resolveMcpStaffContext }
    = await import('~~/server/utils/ai/mcp/staffAuthority')
  if (!delegatedAdsContext(ctx)) {
    if (ctx.clientScope && ctx.clientScope !== clientId)
      throw createError({ statusCode: 403, statusMessage: 'Client mismatch' })
    return
  }
  if (mode === 'plan') {
    await assertMarketingCapabilityAtBoundary(
      ctx.event,
      ctx.userId,
      clientId,
      'ads_plan',
      { scopes: ctx.mcpScopes, requireWriteScope: true }
    )
    return
  }
  const fresh = await resolveMcpStaffContext(ctx.event, ctx.userId, [
    ...(ctx.mcpScopes ?? [])
  ])
  if (
    !(await freshContextCoversClient(
      { ...fresh, clientScope: ctx.clientScope },
      clientId
    ))
    || !(fresh.marketingCapabilities ?? []).some(
      c => c === 'reporting' || c === 'ads_plan'
    )
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Google Ads client access denied'
    })
  }
}
export async function listGoogleAdsConnections(
  ctx: ToolContext,
  clientId: string
) {
  await assertGoogleAdsClientAccess(ctx, clientId)
  return queryRows<{
    connectionId: string
    clientId: string
    customerId: string
    status: string
    accountRole: string | null
    loginCustomerId: string | null
  }>(
    `
    SELECT sc.id AS "connectionId", sc.client_id AS "clientId", b.operating_customer_id AS "customerId",
           sc.status, b.account_role AS "accountRole", b.login_customer_id AS "loginCustomerId"
      FROM social_connections sc JOIN google_ads_account_bindings b
        ON b.connection_id=sc.id AND b.client_id=sc.client_id
       AND b.operating_customer_id=REPLACE(sc.account_id,'-','')
      WHERE sc.client_id=$1 AND sc.platform='google' AND sc.status='active' LIMIT 100`,
    [clientId]
  )
}
/** No credential columns are selected until the exact active mapping is proven. */
export async function assertGoogleAdsConnection(
  ctx: ToolContext,
  clientId: string,
  connectionId: string,
  customerId?: string,
  mode: 'read' | 'plan' = 'read'
) {
  await assertGoogleAdsClientAccess(ctx, clientId, mode)
  const row = await queryOneFresh<{ customerId: string }>(
    `
    SELECT b.operating_customer_id AS "customerId" FROM social_connections sc
      JOIN google_ads_account_bindings b ON b.connection_id=sc.id AND b.client_id=sc.client_id
        AND b.operating_customer_id=REPLACE(sc.account_id,'-','')
      WHERE sc.client_id=$1 AND sc.id=$2 AND sc.platform='google' AND sc.status='active'
        AND ($3::text IS NULL OR b.operating_customer_id=$3)`,
    [clientId, connectionId, customerId ?? null]
  )
  if (!row)
    throw createError({
      statusCode: 403,
      statusMessage: 'Exact Google Ads account mapping required'
    })
  return row
}
export async function loadGoogleAdsPlanInScope(ctx: ToolContext, id: string) {
  const plan = await getGoogleAdsActionPlanForActor(id, ctx.userId, {
    queryOne: queryOneFresh
  })
  if (!plan)
    throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
  await assertGoogleAdsConnection(
    ctx,
    plan.clientId,
    plan.connectionId,
    plan.customerId
  )
  return plan
}

export async function replayGoogleAdsPlan(
  ctx: ToolContext,
  clientId: string,
  key: string
) {
  const row = await queryOneFresh<{ id: string }>(
    'SELECT id FROM google_ads_action_plans WHERE client_id=$1 AND actor_id=$2 AND idempotency_key=$3',
    [clientId, ctx.userId, key]
  )
  return row ? loadGoogleAdsPlanInScope(ctx, row.id) : null
}

/** Inspect every nested resource reference before entering a credential-capable runtime. */
export function assertGoogleAdsResourceCustomers(value: unknown, customerId: string): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/customers\/([^/\s]+)(?=\/|$)/g)) {
      if (match[1]!.replace(/-/g, '') !== customerId)
        throw createError({ statusCode: 403, statusMessage: 'Cross-customer Google Ads resource denied' })
    }
  } else if (Array.isArray(value)) {
    for (const child of value) assertGoogleAdsResourceCustomers(child, customerId)
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) assertGoogleAdsResourceCustomers(child, customerId)
  }
}
