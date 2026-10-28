import { createError, type H3Event } from 'h3'
import { requireAuth, requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { queryOneFresh } from '~~/server/utils/db'
import { isMarketingManagementContext } from '~~/server/utils/marketingManagement'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

async function resolveStaff(event: H3Event, userId: string): Promise<ToolContext> {
  const { resolveMcpStaffContext } = await import('~~/server/utils/ai/mcp/staffAuthority')
  return resolveMcpStaffContext(event, userId, [])
}
async function coversClient(ctx: ToolContext, clientId: string): Promise<boolean> {
  if (ctx.clientScope && ctx.clientScope !== clientId) return false
  const scope = ctx.assistantScope
  if (!scope) return false
  if (scope.clientAccessMode === 'assigned') return scope.assignedClientIds.includes(clientId)
  if (scope.clientAccessMode !== 'all_active') return false
  return !!(await queryOneFresh('SELECT id FROM agency_clients WHERE id=$1 AND is_active=TRUE', [clientId]))
}
export async function resolveMarketingLeadBrowserScope(
  event: H3Event,
  clientId?: string,
  options: { write?: boolean, legacyRoles?: readonly string[], legacyWrite?: boolean } = {}
): Promise<{ user: { id: string }, marketing: ToolContext | null }> {
  const user = await requireAuth(event)
  const marketing = await hasFreshMarketingManagementPermission(user.id)
  if (!marketing) {
    if (options.legacyRoles) await requireRole(event, options.legacyRoles)
    if (options.legacyWrite) await requireWriteAccess(event)
    return { user, marketing: null }
  }
  if (options.write) await requireWriteAccess(event)
  const ctx = await resolveStaff(event, user.id)
  if (!isMarketingManagementContext(ctx) || (options.write && ctx.assistantReadOnly)) {
    throw createError({ statusCode: 403, statusMessage: 'Marketing lead access is not currently available' })
  }
  if (clientId && !await coversClient(ctx, clientId)) {
    throw createError({ statusCode: 404, statusMessage: 'Lead client not found in active marketing scope' })
  }
  return { user, marketing: ctx }
}
export async function resolveMarketingLeadRuleScope(
  event: H3Event,
  ruleId: string,
  options: { write?: boolean, legacyRoles?: readonly string[], legacyWrite?: boolean } = {}
) {
  const scope = await resolveMarketingLeadBrowserScope(event, undefined, options)
  if (!scope.marketing) return { ...scope, rule: null }
  const rule = await queryOneFresh<{ id: string, client_id: string }>(`SELECT r.id,r.client_id
    FROM lead_form_rules r JOIN agency_clients c ON c.id=r.client_id AND c.is_active=TRUE WHERE r.id=$1`, [ruleId])
  if (!rule || !await coversClient(scope.marketing, rule.client_id)) {
    throw createError({ statusCode: 404, statusMessage: 'Lead rule not found in active marketing scope' })
  }
  return { ...scope, rule }
}
export async function requireLeadAssigneeAuthority(
  event: H3Event,
  clientId: string,
  assigneeId: string
): Promise<ToolContext> {
  const assignee = await resolveStaff(event, assigneeId)
  if (!await coversClient(assignee, clientId)) {
    throw createError({ statusCode: 403, statusMessage: 'Assignee must be active staff with current client authority' })
  }
  return assignee
}
