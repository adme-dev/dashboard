/**
 * POST /api/agency/invoicing/tracking-categories/sync
 * Sync tracking categories from Xero API into the local DB.
 *
 * Fetches all tracking categories + options from Xero, upserts into
 * xero_tracking_categories / xero_tracking_options tables.
 * Preserves ADME enrichment (COA code, GST type) for existing options.
 *
 * Returns: { synced, added, categories[] }
 */
import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { syncXeroTrackingCategories } from '~~/server/utils/invoicing/tracking-categories'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  try {
    const result = await syncXeroTrackingCategories(event)
    return result
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to sync tracking categories from Xero',
    })
  }
})
