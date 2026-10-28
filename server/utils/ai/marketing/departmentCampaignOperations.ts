import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { getGooglePmaxLaunch, approveGooglePmaxLaunch, type GooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'
import { departmentPmaxBindingHash } from './departmentCampaignInventory'
import { requireMarketingDepartment } from './departmentAuthority'
import { requireIndependentMarketingReviewer, assertMarketingCapabilityAtBoundary } from './reviewAuthority'
import { campaignDenied, requireDepartmentClient, departmentRuntimeEnv, departmentGoogleRuntime } from './departmentCampaignSupport'
import { resolveMcpRuntimeConfig } from '../mcp/runtimeConfig'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { departmentCampaignContracts } from './departmentCampaignSchemas'
import { resolveMarketingProviderConfig } from '~~/server/utils/marketingProviderConfig'

function launchView(l: GooglePmaxLaunch) {
  const c = l.normalizedConfig as unknown as GooglePmaxInventoryLaunchConfig
  const safeText = (v: unknown) => typeof v === 'string' && !/bearer\s|(?:token|secret|password|api_key)[=:]/i.test(v) ? v.slice(0, 2048) : null
  const safeUrls = (Array.isArray(c.finalUrls) ? c.finalUrls : []).slice(0, 20).map((v: unknown) => {
    try {
      const u = new URL(String(v))
      return { origin: u.origin, path: u.pathname, queryPresent: !!u.search }
    } catch { return null }
  })
  const preview = {
    campaignName: safeText(c.campaignName), customerId: safeText(c.customerId), merchantCenterId: safeText(c.merchantCenterId),
    budget: { currency: safeText(c.budget?.currency), period: safeText(c.budget?.period), allocatedTotal: c.budget?.allocatedTotal ?? null,
      startDate: safeText(c.budget?.startDate), endDate: safeText(c.budget?.endDate), totalAmountMicros: safeText(c.budget?.provider?.totalAmountMicros) },
    bidding: { strategy: safeText(c.bidding?.strategy), targetCpaMicros: safeText(c.bidding?.targetCpaMicros), targetRoas: c.bidding?.targetRoas ?? null },
    locations: (Array.isArray(c.locations) ? c.locations : []).slice(0, 100).map(x => ({ criterionId: safeText(x.criterionId), displayName: safeText(x.displayName) })),
    finalUrls: safeUrls,
    assetGroup: { mode: safeText(c.assetGroup?.mode), businessName: safeText(c.assetGroup?.businessName),
      headlines: (c.assetGroup?.headlines ?? []).map(safeText), descriptions: (c.assetGroup?.descriptions ?? []).map(safeText), longHeadlines: (c.assetGroup?.longHeadlines ?? []).map(safeText) },
    inventorySource: { feedId: safeText(c.inventorySource?.feedId), linkId: safeText(c.inventorySource?.linkId) },
    conversionActionIds: (Array.isArray(c.conversionGoals) ? c.conversionGoals : []).map(g => safeText(g.conversionActionId))
  }
  return { launchId: l.id, clientId: l.clientId, briefId: l.briefId, connectionId: l.connectionId, configVersion: l.configVersion, configHash: l.configHash, state: l.state,
    preview,
    ready: l.preflightResult?.ready === true, blockerCount: l.preflightResult?.blockerCount ?? null,
    campaignId: typeof l.providerResources?.campaignId === 'string' && /^\d+$/.test(l.providerResources.campaignId) ? l.providerResources.campaignId : null,
    reconciliationRequired: ['EXECUTING', 'ENABLING', 'RECOVERY_REQUIRED'].includes(l.state), providerServingVerified: false }
}
async function currentBinding(ctx: ToolContext, l: GooglePmaxLaunch) {
  await requireDepartmentClient(ctx, l.clientId)
  const config = l.normalizedConfig
  if (config.clientId !== l.clientId || config.connectionId !== l.connectionId) campaignDenied('binding_changed')
  const connection = await queryOneFresh<{ account_id: string }>(`SELECT id, client_id, account_id, status FROM social_connections
 WHERE id=$1 AND client_id=$2 AND platform='google' AND status='active'`, [l.connectionId, l.clientId])
  if (!connection || connection.account_id.replace(/[\s-]/g, '') !== config.customerId) campaignDenied('binding_changed')
}
async function requester(ctx: ToolContext, l: GooglePmaxLaunch) {
  const fresh = await assertMarketingCapabilityAtBoundary(ctx.event, l.createdBy, l.clientId, 'department_management')
  if (!fresh.permissionGroups?.includes('MARKETING_MANAGEMENT')) campaignDenied()
}
async function authorize(ctx: ToolContext, l: GooglePmaxLaunch, kind: 'create' | 'activate') {
  ctx = await requireMarketingDepartment(ctx, true)
  await currentBinding(ctx, l)
  await requester(ctx, l)
  const approval = await queryOneFresh<{ approved_by: string, binding_hash: string }>(`SELECT a.approved_by,e.payload->>'departmentBindingHash' AS binding_hash FROM campaign_launch_approvals a
 JOIN campaign_launch_events e ON e.launch_id=a.launch_id AND e.config_hash=a.config_hash AND e.config_version=a.config_version AND e.actor_id=a.approved_by
 AND e.event_type=CASE WHEN a.approval_kind='create' THEN 'CREATE_APPROVED' ELSE 'ACTIVATION_APPROVED' END
 WHERE a.launch_id=$1 AND a.config_version=$2 AND a.config_hash=$3 AND a.approval_kind=$4`, [l.id, l.configVersion, l.configHash, kind])
  if (!approval) campaignDenied('approval_required')
  if (approval.binding_hash !== await departmentPmaxBindingHash(ctx, l)) campaignDenied('binding_changed')
  await requireIndependentMarketingReviewer(ctx.event, { requesterId: l.createdBy, clientId: l.clientId, reviewerId: approval.approved_by })
  const flags = resolveMcpRuntimeConfig(ctx.event)
  if (!flags.serverEnabled || !flags.suiteFlags.writes || !flags.suiteFlags.googleAdsWrite) campaignDenied('disabled')
  const provider = resolveMarketingProviderConfig(departmentRuntimeEnv(ctx))
  if (!provider.pmaxProviderWrites || (kind === 'activate' && !provider.pmaxActivation)) campaignDenied('disabled')
}
export async function runDepartmentCampaignOperation(name: string, raw: unknown, original: ToolContext, _key?: string, _digest?: string): Promise<ToolResult> {
  try {
    const contract = departmentCampaignContracts.find(c => c[0] === name)
    if (!contract) campaignDenied('not_found')
    const parsed = contract[1].safeParse(raw)
    if (!parsed.success) campaignDenied('bad_args')
    const input = parsed.data as { clientId: string, briefId?: string, launchId?: string, expectedConfigHash?: string, expectedConfigVersion?: number, reason?: string }
    const ctx = await requireMarketingDepartment(original, contract[2])
    const flags = resolveMcpRuntimeConfig(ctx.event)
    if (!flags.serverEnabled || !flags.suiteFlags.googleAdsRead || (contract[2] && (!flags.suiteFlags.writes || !flags.suiteFlags.googleAdsWrite))) campaignDenied('disabled')
    await requireDepartmentClient(ctx, input.clientId)
    // Tenant is resolved from the canonical agency binding, never model arguments or browser cookies.
    const tenant = await queryOneFresh<{ tenant_id: string }>('SELECT tenant_id FROM xero_org_connection WHERE tenant_id <> \'__default__\' ORDER BY updated_at DESC LIMIT 1')
    if (!tenant) campaignDenied('not_ready')
    if (name === 'marketing_list_pmax_briefs' || name === 'marketing_prepare_pmax_launch') {
      const { createGooglePmaxLaunchPreparation } = await import('~~/server/utils/googlePmaxLaunchPreparation')
      const { createGooglePmaxRemoteDecisionEngine } = await import('~~/server/utils/googlePmaxRemoteDecisionEngine')
      const { loadGooglePmaxProviderConnection } = await import('~~/server/utils/googlePmaxProviderConnection')
      const engine = createGooglePmaxRemoteDecisionEngine(ctx.event)
      const prep = createGooglePmaxLaunchPreparation({ queryOne: queryOneFresh, queryRows: queryRowsFresh,
        readConnection: config => loadGooglePmaxProviderConnection(config, { queryOne: queryOneFresh, getRuntimeConfig: () => departmentGoogleRuntime(ctx) }),
        prepareProvider: engine.prepareProvider, normalize: engine.normalize })
      if (name === 'marketing_list_pmax_briefs') {
        const rows = await prep.list({ tenantId: tenant.tenant_id, clientId: input.clientId, limit: 50 })
        return ok({ items: rows.map(r => ({ briefId: r.id, clientId: r.clientId, configVersion: r.configVersion })), limit: 50, truncated: rows.length === 50 })
      }
      const result = await prep.prepare({ tenantId: tenant.tenant_id, briefId: input.briefId!, expectedClientId: input.clientId, actorId: ctx.userId })
      return ok({ ...launchView(result.launch), replay: result.isReplay })
    }
    const l = await getGooglePmaxLaunch({ launchId: input.launchId!, tenantId: tenant.tenant_id, fresh: true })
    if (!l || l.clientId !== input.clientId) campaignDenied('not_found')
    await currentBinding(ctx, l)
    if (name === 'marketing_get_pmax_launch') return ok(launchView(l))
    if (input.expectedConfigHash !== l.configHash || input.expectedConfigVersion !== l.configVersion) campaignDenied('revision_conflict')
    await requester(ctx, l)
    if (name === 'marketing_preflight_pmax_launch') {
      const { runGooglePmaxLaunchPreflight } = await import('~~/server/utils/googlePmaxLaunchPreflightService')
      const result = await runGooglePmaxLaunchPreflight({ event: ctx.event, launchId: l.id, tenantId: l.tenantId, actorId: ctx.userId, actorEmail: ctx.userEmail ?? '', runtimeEnv: departmentRuntimeEnv(ctx), googleRuntimeConfig: departmentGoogleRuntime(ctx) })
      return ok(launchView(result.launch))
    }
    const activation = name.includes('activation') || name === 'marketing_activate_pmax_launch'
    if (name.startsWith('marketing_approve_')) {
      await requireIndependentMarketingReviewer(ctx.event, { requesterId: l.createdBy, reviewerId: ctx.userId, clientId: l.clientId })
      const result = await approveGooglePmaxLaunch({ launchId: l.id, tenantId: l.tenantId, approvalKind: activation ? 'activate' : 'create', expectedConfigVersion: l.configVersion, expectedConfigHash: l.configHash, actorId: ctx.userId, reason: input.reason!, beforeApprove: async (current) => {
        await requireMarketingDepartment(ctx, true)
        await currentBinding(ctx, current)
        await requester(ctx, current)
        await requireIndependentMarketingReviewer(ctx.event, { requesterId: current.createdBy, reviewerId: ctx.userId, clientId: current.clientId })
        return { departmentBindingHash: await departmentPmaxBindingHash(ctx, current) }
      } })
      return ok(launchView(result))
    }
    if (l.state !== (activation ? 'ACTIVATION_APPROVED' : 'APPROVED')) campaignDenied('reconciliation_required')
    await authorize(ctx, l, activation ? 'activate' : 'create')
    const service = await import('~~/server/utils/googlePmaxExecutionService')
    const run = activation ? service.executeGooglePmaxActivation : service.executeGooglePmaxPausedCreate
    const result = await run({ event: ctx.event, launchId: l.id, tenantId: l.tenantId, actorId: ctx.userId }, {
      env: () => departmentRuntimeEnv(ctx), runtimeConfig: departmentGoogleRuntime(ctx), authorize: async (current, kind) => {
        if (current.configHash !== input.expectedConfigHash || current.configVersion !== input.expectedConfigVersion || current.clientId !== input.clientId) campaignDenied('revision_conflict')
        await authorize(ctx, current, kind)
      }
    })
    return ok(launchView(result.launch))
  } catch (error) {
    const code = (error as { campaignCode?: string }).campaignCode
    return fail('Campaign operation unavailable; inspect the exact launch state before retrying any provider action.', code ?? 'unavailable')
  }
}
