// server/utils/adsGovernance/overview.ts
// Read model behind GET /api/agency/marketing/automation/governance. Fresh authority, client-scoped.
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { resolveAdsGovernanceConfig } from './config'
import { readAutomationControls } from './limits'
import { canManageAutomationRules, getAutomationRule, getAutomationRuleVersions, listAutomationRules } from './rules'

const Uuid = z.string().uuid()

export async function readAdsGovernanceOverview(
  event: H3Event,
  actorId: string,
  options: { clientId?: string, ruleId?: string } = {}
) {
  const config = resolveAdsGovernanceConfig(event)
  if (!config.automation) return { enabled: false as const }
  const { resolveMcpStaffContext } = await import('~~/server/utils/ai/mcp/staffAuthority')
  const ctx = await resolveMcpStaffContext(event, actorId, [])
  if (!canManageAutomationRules({ id: actorId, role: ctx.userRole, groups: ctx.permissionGroups })) {
    throw createError({ statusCode: 403, statusMessage: 'ADS_RULE_MANAGER_REQUIRED' })
  }
  const clientId = options.clientId === undefined ? undefined : Uuid.parse(options.clientId)
  const visible = ctx.userRole === 'owner' || ctx.assistantScope?.clientAccessMode === 'all_active'
    ? null
    : (ctx.assistantScope?.assignedClientIds ?? [])
  if (clientId && visible && !visible.includes(clientId)) {
    throw createError({ statusCode: 403, statusMessage: 'MARKETING_CLIENT_NOT_ASSIGNED' })
  }
  let history = null
  if (options.ruleId) {
    const rule = await getAutomationRule(Uuid.parse(options.ruleId))
    if (!rule || (visible && !visible.includes(rule.clientId))) {
      throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
    }
    history = await getAutomationRuleVersions(rule.id)
  }
  return {
    enabled: true as const,
    autoApplyEnabled: config.autoApply,
    controls: await readAutomationControls(),
    rules: await listAutomationRules(visible, clientId),
    history
  }
}
