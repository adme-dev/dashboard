import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import {
  listGtmAccounts,
  listGtmContainers
} from '~~/server/utils/googleTagManagerClient'
import {
  listGtmConnections,
  reserveGtmApiQuota,
  resolveGtmAccessToken
} from '~~/server/utils/googleTagManagerStore'
import {
  getGtmSiteStatus,
  getStoredGtmSiteStatus,
  installXeroFlowViaGtm,
  publishGtmChangeSet,
  rollbackGtmChangeSet,
  upsertGtmContainerBinding
} from '~~/server/utils/googleTagManagerInstaller'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'

export type GtmReadToolName
  = | 'list_gtm_connections'
    | 'get_gtm_site_status'
    | 'list_gtm_accounts'
    | 'list_gtm_containers'

export type GtmMutationToolName
  = | 'bind_gtm_container'
    | 'create_gtm_install_draft'
    | 'publish_gtm_change_set'
    | 'verify_gtm_installation'
    | 'rollback_gtm_change_set'

async function assertSiteAccess(ctx: ToolContext, siteId: string): Promise<void> {
  await requireSiteTrackingAccess(ctx.event, siteId)
}

function toolFailure(error: unknown, fallback: string): ToolResult {
  const candidate = error as { statusMessage?: string, message?: string, data?: { statusMessage?: string } }
  return {
    ok: false,
    error: String(candidate?.data?.statusMessage || candidate?.statusMessage || candidate?.message || fallback).slice(0, 300),
    code: 'handler_error'
  }
}

export async function runGtmReadTool(name: GtmReadToolName, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  try {
    if (name === 'list_gtm_connections') {
      return { ok: true, data: { connections: await listGtmConnections() } }
    }
    if (name === 'get_gtm_site_status') {
      const { siteId } = args as { siteId: string }
      await assertSiteAccess(ctx, siteId)
      return { ok: true, data: await getStoredGtmSiteStatus(siteId) }
    }
    if (name === 'list_gtm_accounts') {
      const { connectionId } = args as { connectionId: string }
      const credential = await resolveGtmAccessToken(ctx.event, connectionId)
      await reserveGtmApiQuota(1)
      return { ok: true, data: { accounts: await listGtmAccounts(credential.token) } }
    }
    const { connectionId, accountPath } = args as { connectionId: string, accountPath: string }
    const credential = await resolveGtmAccessToken(ctx.event, connectionId)
    await reserveGtmApiQuota(1)
    const containers = await listGtmContainers(credential.token, accountPath)
    return {
      ok: true,
      data: {
        containers: containers.filter(container => !container.usageContext?.length || container.usageContext.includes('web'))
      }
    }
  } catch (error) {
    return toolFailure(error, 'Google Tag Manager read failed')
  }
}

export async function runGtmMutationTool(
  name: GtmMutationToolName,
  args: unknown,
  ctx: ToolContext,
  services: TrustedSupplementalExecutionServices
): Promise<ToolResult> {
  try {
    if (name === 'bind_gtm_container') {
      const input = args as { siteId: string, connectionId: string, accountPath: string, containerPath: string }
      await assertSiteAccess(ctx, input.siteId)
      const credential = await resolveGtmAccessToken(ctx.event, input.connectionId)
      await reserveGtmApiQuota(2)
      const accounts = await listGtmAccounts(credential.token)
      const account = accounts.find(item => item.path === input.accountPath)
      if (!account) return { ok: false, error: 'Selected GTM account is not accessible.', code: 'forbidden' }
      const containers = await listGtmContainers(credential.token, account.path)
      const container = containers.find(item => item.path === input.containerPath)
      if (!container) return { ok: false, error: 'Selected GTM container is not accessible.', code: 'forbidden' }
      await services.markDispatched()
      const binding = await upsertGtmContainerBinding({
        siteId: input.siteId,
        userId: ctx.userId,
        connectionId: input.connectionId,
        account: { path: account.path, name: account.name },
        container
      })
      return { ok: true, data: { binding } }
    }

    const input = args as { siteId: string, changeSetId?: string }
    await assertSiteAccess(ctx, input.siteId)
    await services.markDispatched()

    if (name === 'create_gtm_install_draft') {
      return { ok: true, data: await installXeroFlowViaGtm(ctx.event, { siteId: input.siteId, userId: ctx.userId, publish: false }) }
    }
    if (name === 'verify_gtm_installation') {
      return { ok: true, data: await getGtmSiteStatus(ctx.event, input.siteId) }
    }
    if (!input.changeSetId) return { ok: false, error: 'changeSetId is required.', code: 'bad_args' }
    if (name === 'publish_gtm_change_set') {
      return { ok: true, data: await publishGtmChangeSet(ctx.event, { siteId: input.siteId, changeSetId: input.changeSetId, userId: ctx.userId }) }
    }
    return { ok: true, data: await rollbackGtmChangeSet(ctx.event, { siteId: input.siteId, changeSetId: input.changeSetId, userId: ctx.userId }) }
  } catch (error) {
    return toolFailure(error, 'Google Tag Manager operation failed')
  }
}
