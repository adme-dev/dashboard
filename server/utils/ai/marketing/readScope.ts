import { createError, type H3Event } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import type { PermissionGroup } from '~~/server/utils/permissions'
import { resolveGodModeAuthority, isActiveGodModeAuthority } from '~~/server/utils/godMode/authority'
import type { ToolContext } from '../toolContext'

export type MarketingReadScope = Readonly<{
  actorUserId: string
  clientIds: readonly string[] | null
  activeClientsOnly: boolean
  ownerVerified: boolean
  permissionGroups: readonly PermissionGroup[]
  reportingGranted: boolean
  financialReadAllowed: boolean
  ownerRefreshAllowed: boolean
}>
type Family = 'campaigns' | 'ads' | 'creatives' | 'search_terms' | 'pacing' | 'social' | 'clients' | 'lead_summary'
export async function resolveMarketingReadScope(ctx: ToolContext): Promise<MarketingReadScope> {
  const application = ctx.source !== 'mcp'
  let authority = ctx
  const ownerVerified = ctx.userRole === 'owner' && isActiveGodModeAuthority(await resolveGodModeAuthority(ctx.event, ctx.userId), ctx.userId)
  if (application && !ownerVerified) {
    const { requireAuth } = await import('~~/server/utils/auth')
    const user = await requireAuth(ctx.event)
    if (user.id !== ctx.userId) throw createError({ statusCode: 403, statusMessage: 'Reporting actor mismatch' })
  }
  if (application && !ownerVerified) {
    // Reuse the uncached identity/role/active-assignment reads, not MCP consent or enrollment.
    // The returned MCP tags/scopes/grants never authorize an application read.
    const { resolveMcpStaffContext } = await import('../mcp/staffAuthority')
    authority = await resolveMcpStaffContext(ctx.event, ctx.userId, [])
  }
  if (!ownerVerified && (authority.mcpStaffAuthority !== 'fresh' || !authority.assistantScope || !Array.isArray(authority.permissionGroups))) {
    throw createError({ statusCode: 403, statusMessage: 'Fresh reporting authority required' })
  }
  const groups = (authority.permissionGroups ?? []).filter(group =>
    !application || !ctx.permissionGroups || ctx.permissionGroups.includes(group))
  const allActive = !ownerVerified && authority.assistantScope?.clientAccessMode === 'all_active'
  if (allActive && !(authority.permissionGroups ?? []).some(g => g === 'ADMIN' || g === 'MANAGEMENT')) throw createError({ statusCode: 403, statusMessage: 'Invalid client scope' })
  let clientIds: readonly string[] | null = ownerVerified || allActive ? null : [...(authority.assistantScope?.assignedClientIds ?? [])]
  if (application && ctx.assistantScope?.clientAccessMode === 'assigned') {
    const personalIds = ctx.assistantScope.assignedClientIds
    clientIds = clientIds === null ? [...personalIds] : clientIds.filter(id => personalIds.includes(id))
  }
  if (ctx.clientScope) clientIds = clientIds === null || clientIds.includes(ctx.clientScope) ? [ctx.clientScope] : []
  return Object.freeze({ actorUserId: ctx.userId, clientIds, activeClientsOnly: allActive, ownerVerified,
    permissionGroups: [...groups], reportingGranted: !application && (authority.marketingCapabilities ?? []).includes('reporting'),
    financialReadAllowed: ownerVerified || groups.includes('FINANCE'), ownerRefreshAllowed: ownerVerified && ctx.assistantReadOnly !== true })
}
export async function resolveBrowserMarketingReadScope(event: H3Event): Promise<MarketingReadScope> {
  const { requireAuth } = await import('~~/server/utils/auth')
  const user = await requireAuth(event)
  const owner = isActiveGodModeAuthority(await resolveGodModeAuthority(event, user.id), user.id)
  return resolveMarketingReadScope({ userId: user.id, userRole: owner ? 'owner' : '', event })
}
export function requireMarketingReadPermission(scope: MarketingReadScope, family: Family): void {
  const groups: PermissionGroup[] = family === 'lead_summary'
    ? ['CLIENTS', 'ADMIN', 'MANAGEMENT']
    : family === 'pacing'
      ? ['MEDIA_BUYING', 'FINANCE', 'ADMIN', 'MANAGEMENT']
      : family === 'social'
        ? ['CREATIVE', 'CLIENTS', 'ADMIN', 'MANAGEMENT']
        : family === 'clients' ? ['CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'ADMIN', 'MANAGEMENT'] : ['MEDIA_BUYING', 'ADMIN', 'MANAGEMENT']
  if (!scope.ownerVerified && !(family !== 'lead_summary' && scope.reportingGranted) && !groups.some(g => scope.permissionGroups.includes(g))) {
    throw createError({ statusCode: 403, statusMessage: 'Reporting permission required' })
  }
}
/** Column names are source constants, never request input. */
export function clientScopeSql(scope: MarketingReadScope, column: string, params: unknown[]): string {
  if (!/^[a-z_]+\.[a-z_]+$/.test(column)) throw new Error('Invalid scope column')
  const conditions: string[] = []
  if (scope.clientIds !== null) {
    if (!scope.clientIds.length) return 'FALSE'
    params.push([...scope.clientIds])
    conditions.push(`${column} = ANY($${params.length}::uuid[])`)
  }
  if (scope.activeClientsOnly) conditions.push(`EXISTS (SELECT 1 FROM agency_clients authorized_client WHERE authorized_client.id = ${column} AND authorized_client.is_active = true)`)
  return conditions.length ? conditions.join(' AND ') : 'TRUE'
}
export async function requireScopedClient(scope: MarketingReadScope, clientId: string): Promise<void> {
  const params: unknown[] = [clientId]
  const predicate = clientScopeSql(scope, 'c.id', params)
  if (predicate === 'FALSE' || !await queryOneFresh(`SELECT c.id FROM agency_clients c WHERE c.id = $1 AND ${predicate}`, params)) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  }
}
export async function resolveStoredReportingTenant(scope: MarketingReadScope, family: 'campaigns' | 'pacing'): Promise<string | null> {
  requireMarketingReadPermission(scope, family)
  if (scope.clientIds?.length === 0) return null
  const row = await queryOneFresh<{ tenant_id: string }>(`SELECT tenant_id FROM xero_org_connection WHERE tenant_id <> '__default__' ORDER BY updated_at DESC, tenant_id ASC LIMIT 1`)
  return row?.tenant_id ?? null
}
export async function loadMarketingCoverageDelta(scope: MarketingReadScope) {
  if (!scope.ownerVerified || scope.clientIds !== null) return null
  const { getSpendCoverageDeltas } = await import('~~/server/utils/spendSyncJobs')
  return getSpendCoverageDeltas()
}
export async function requireOwnerRefresh(ctx: ToolContext): Promise<MarketingReadScope> {
  const scope = await resolveMarketingReadScope(ctx)
  if (!scope.ownerRefreshAllowed) throw createError({ statusCode: 403, statusMessage: 'MARKETING_REFRESH_REQUIRES_REVIEW' })
  return scope
}
