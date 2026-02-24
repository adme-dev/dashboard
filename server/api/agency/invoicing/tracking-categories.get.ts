/**
 * GET /api/agency/invoicing/tracking-categories
 * Returns media tracking categories with COA mapping.
 * Optional ?coa= filter to show categories for a specific COA code.
 * Optional ?source=db|xero|static to force a specific data source.
 *
 * Data priority: DB → static fallback
 * Use POST /api/agency/invoicing/tracking-categories/sync to sync from Xero.
 */
import { requireAuth } from '~~/server/utils/auth'
import { fetchDbTrackingCategories, TRACKING_CATEGORIES } from '~~/server/utils/invoicing/tracking-categories'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const coaFilter = query.coa as string | undefined
  const source = query.source as string | undefined

  let categories: Array<{
    name: string
    coaCode: string
    gstType: string
    description: string
    vendors: string[]
    xeroOptionId?: string
  }>
  let dataSource: 'db' | 'static'

  if (source === 'static') {
    categories = TRACKING_CATEGORIES.map(t => ({
      name: t.name,
      coaCode: t.coaCode,
      gstType: t.gstType,
      description: t.description,
      vendors: t.vendors || [],
    }))
    dataSource = 'static'
  } else {
    // Try DB first, fall back to static
    try {
      const dbCategories = await fetchDbTrackingCategories()
      if (dbCategories.length > 0) {
        categories = dbCategories.map(t => ({
          name: t.name,
          coaCode: t.coaCode,
          gstType: t.gstType,
          description: t.description,
          vendors: t.vendors || [],
          xeroOptionId: t.xeroOptionId,
        }))
        dataSource = 'db'
      } else {
        categories = TRACKING_CATEGORIES.map(t => ({
          name: t.name,
          coaCode: t.coaCode,
          gstType: t.gstType,
          description: t.description,
          vendors: t.vendors || [],
        }))
        dataSource = 'static'
      }
    } catch {
      categories = TRACKING_CATEGORIES.map(t => ({
        name: t.name,
        coaCode: t.coaCode,
        gstType: t.gstType,
        description: t.description,
        vendors: t.vendors || [],
      }))
      dataSource = 'static'
    }
  }

  if (coaFilter) {
    categories = categories.filter(c => c.coaCode === coaFilter)
  }

  return { categories, total: categories.length, source: dataSource }
})
