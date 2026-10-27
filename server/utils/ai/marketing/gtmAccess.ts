import { createError } from 'h3'
import { queryOneFresh, queryRows } from '~~/server/utils/db'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

export async function gtmScope(ctx: ToolContext) {
  const { resolveMcpStaffContext }
    = await import('~~/server/utils/ai/mcp/staffAuthority')
  const fresh = await resolveMcpStaffContext(ctx.event, ctx.userId, [
    ...(ctx.mcpScopes ?? [])
  ])
  if (!fresh.marketingCapabilities?.includes('tracking_plan'))
    throw createError({
      statusCode: 403,
      statusMessage: 'Tracking capability required'
    })
  return { ...fresh, clientScope: ctx.clientScope }
}
export async function assertGtmSite(
  ctx: ToolContext,
  siteId: string,
  write = false
) {
  const { assertMarketingCapabilityAtBoundary, freshContextCoversClient }
    = await import('./reviewAuthority')
  const fresh = await gtmScope(ctx)
  const site = await queryOneFresh<{
    id: string
    client_id: string
    allowed_origins: string[]
    name: string
  }>(
    'SELECT id,client_id,allowed_origins,name FROM tracking_sites WHERE id=$1 AND is_active=TRUE',
    [siteId]
  )
  if (!site || !(await freshContextCoversClient(fresh, site.client_id)))
    throw createError({
      statusCode: 403,
      statusMessage: 'Tracking site access denied'
    })
  if (write)
    await assertMarketingCapabilityAtBoundary(
      ctx.event,
      ctx.userId,
      site.client_id,
      'tracking_plan',
      { scopes: ctx.mcpScopes, requireWriteScope: true }
    )
  return site
}
export interface GtmBindingScope {
  id: string
  tracking_site_id: string
  client_id: string
  connection_id: string
  account_path: string
  container_path: string
  container_public_id: string
}
export async function assertGtmBindingForSite(
  ctx: ToolContext,
  siteId: string
) {
  const site = await assertGtmSite(ctx, siteId)
  const binding = await queryOneFresh<GtmBindingScope>(
    `SELECT b.id,b.tracking_site_id,$2::uuid AS client_id,b.connection_id,b.account_path,b.container_path,b.container_public_id FROM gtm_container_bindings b JOIN gtm_connections c ON c.id=b.connection_id AND c.status='active' WHERE b.tracking_site_id=$1`,
    [siteId, site.client_id]
  )
  if (!binding)
    throw createError({
      statusCode: 403,
      statusMessage: 'Active client-bound container required'
    })
  return binding
}
export async function assertGtmConnectionForClient(
  ctx: ToolContext,
  connectionId: string,
  clientId: string
) {
  const { freshContextCoversClient } = await import('./reviewAuthority')
  const fresh = await gtmScope(ctx)
  if (!(await freshContextCoversClient(fresh, clientId)))
    throw createError({
      statusCode: 403,
      statusMessage: 'Client access denied'
    })
  const row = await queryOneFresh(
    `SELECT c.id FROM gtm_connections c JOIN gtm_container_bindings b ON b.connection_id=c.id JOIN tracking_sites s ON s.id=b.tracking_site_id WHERE c.id=$1 AND s.client_id=$2 AND c.status='active' LIMIT 1`,
    [connectionId, clientId]
  )
  if (!row)
    throw createError({
      statusCode: 403,
      statusMessage:
        'Connection is not assigned to this client; an owner must establish the initial mapping'
    })
}
export async function listGtmConnectionsInScope(ctx: ToolContext) {
  const fresh = await gtmScope(ctx)
  return queryRows(
    `SELECT DISTINCT c.id,c.google_email AS "googleEmail",c.status,b.account_path,b.container_path,s.id AS "siteId",s.client_id AS "clientId" FROM gtm_connections c JOIN gtm_container_bindings b ON b.connection_id=c.id JOIN tracking_sites s ON s.id=b.tracking_site_id JOIN agency_clients ac ON ac.id=s.client_id AND ac.is_active=TRUE WHERE ($1::uuid[] IS NULL OR s.client_id=ANY($1)) AND ($2::uuid IS NULL OR s.client_id=$2) ORDER BY c.id LIMIT 100`,
    [
      fresh.assistantScope?.clientAccessMode === 'all_active'
        ? null
        : (fresh.assistantScope?.assignedClientIds ?? []),
      ctx.clientScope ?? null
    ]
  )
}
