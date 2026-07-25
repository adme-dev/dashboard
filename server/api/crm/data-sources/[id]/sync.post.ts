import { queryOne } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { CatalogFeedError, syncCatalogSource } from '~~/server/utils/crm/catalogFeed'

export default defineEventHandler(async event => {
  const user = await requireRole(event, PERMISSIONS.CLIENTS)
  const sourceId = getRouterParam(event, 'id')
  const body = await readBody<Record<string, unknown>>(event)
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  if (!clientId || !sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'client_id and source ID are required' })
  }

  const source = await queryOne<{ source_type: string }>(
    'SELECT source_type FROM crm_catalog_sources WHERE client_id = $1 AND id = $2',
    [clientId, sourceId]
  )
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Data source not found' })

  let loadRows
  if (source.source_type === 'dealer_feed') {
    if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
      throw createError({ statusCode: 503, statusMessage: 'Dealer feeds are not enabled' })
    }
    const link = await getDealerLink(clientId)
    if (!link) throw createError({ statusCode: 409, statusMessage: 'Dealer Feed is not connected for this client' })
    const socialDashboardClient = await getSocialDashboardClient({ runtimeEnv: cloudflareRuntimeEnv(event) })
    if (!socialDashboardClient) {
      throw createError({ statusCode: 503, statusMessage: 'Dealer Feed provider is not configured' })
    }
    const provider = getFeedProvider(link.providerId, { socialDashboardClient })
    loadRows = async () => {
      const rows: Array<Record<string, unknown>> = []
      const pageSize = 100
      for (let offset = 0; offset < 10_000; offset += pageSize) {
        const page = await provider.previewInventory(
          linkToContext(link, user.email),
          link,
          { name: 'CRM Inventory', platform: 'google', filters: { onlyActive: true } },
          { limit: pageSize, offset }
        )
        rows.push(...page.items.map(item => ({
          id: item.id,
          vin: item.vin,
          make: item.make,
          model: item.model,
          year: item.year,
          price: item.price,
          condition: item.condition,
          stock_number: item.stockNumber,
          url: item.url,
          image_url: item.image,
          availability: 'available'
        })))
        if (page.items.length < pageSize || rows.length >= page.total) break
      }
      return rows
    }
  }

  try {
    return await syncCatalogSource(clientId, sourceId, { loadRows })
  } catch (error) {
    if (error instanceof CatalogFeedError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    console.error({
      event: 'crm_data_source_sync_failed',
      clientId,
      sourceId,
      sourceType: source.source_type,
      errorClass: error instanceof Error ? error.name : 'unknown'
    })
    throw createError({ statusCode: 500, statusMessage: 'Data source sync failed' })
  }
})
