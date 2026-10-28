import { queryOneFresh } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'
import type { GooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'
import { isExactNativeFeedScope } from './departmentCatalogSchemas'
import { campaignDenied, departmentRuntimeEnv } from './departmentCampaignSupport'
import type { ToolContext } from '../toolContext'

/** A review binds source/seller ownership as well as the normalized Google request. */
export async function departmentPmaxBindingHash(ctx: ToolContext, launch: Pick<GooglePmaxLaunch, 'clientId' | 'connectionId' | 'normalizedConfig'>): Promise<string> {
  const source = launch.normalizedConfig.inventorySource as { providerId?: string, feedId?: string, linkId?: string } | undefined
  if (!source?.feedId || !source.linkId || source.providerId !== 'social-dashboard') campaignDenied('binding_changed')
  const identity = await queryOneFresh<{ id: string }>(`SELECT id FROM client_feed_links WHERE id=$1 AND client_id=$2 AND provider_id=$3 AND status='active'`, [source.linkId, launch.clientId, source.providerId])
  const link = await getDealerLink(launch.clientId, source.providerId, { queryOne: queryOneFresh })
  if (!identity || !link) campaignDenied('binding_changed')
  const env = departmentRuntimeEnv(ctx)
  if (env.DEALER_FEEDS_ENABLED !== 'true') campaignDenied('disabled')
  const client = await getSocialDashboardClient({ env, runtimeEnv: env, queryOne: queryOneFresh })
  if (!client) campaignDenied('not_ready')
  const provider = getFeedProvider(link.providerId, { socialDashboardClient: client })
  const context = linkToContext(link, ctx.userEmail ?? '')
  if (!(await provider.listFeeds(context, link)).some(f => f.id === source.feedId && f.platform === 'google' && f.isActive)) campaignDenied('binding_changed')
  const feed = await provider.getFeed(context, { providerId: link.providerId, feedId: source.feedId, platform: 'google' })
  if (feed.id !== source.feedId || !feed.isActive || feed.platform !== 'google' || !isExactNativeFeedScope(feed, link)) campaignDenied('binding_changed')
  return hashCanonicalLaunchJson({ clientId: launch.clientId, connectionId: launch.connectionId, customerId: launch.normalizedConfig.customerId, linkId: source.linkId, link, feed })
}
