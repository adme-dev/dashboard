import { assertFinancePermission, assertPermissionGrant } from '~~/server/utils/financeAccess'
import { isError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { getClientFinancials } from '~~/server/utils/clientFinancials'
import { parseClientFinancialRange } from '~~/server/utils/clientFinancialCalculations'
import { ClientFinancialRepositoryError } from '~~/server/utils/clientFinancialRepository'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { denyMarketingClientViewer } from '~~/server/utils/clients/marketingAccess'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CLIENTS)
  await assertPermissionGrant(event, user.id, 'CLIENTS')
  // CLIENTS alone exposes reconciled revenue, labour and invoices; the marketing department is
  // denied outright so restricted figures are never presented as zero.
  await denyMarketingClientViewer(user.id)
  const clientId = getRouterParam(event, 'id')

  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const query = getQuery(event)
  try {
    parseClientFinancialRange(query.from, query.to)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid financial date range' })
  }

  let canViewSources = false
  let canAllocate = false
  try { await assertFinancePermission(event, user.id); canViewSources = true }
  catch (error) { if ((error as { statusCode?: number }).statusCode !== 403) throw error }
  if (canViewSources) {
    try { await assertFinancePermission(event, user.id, true); canAllocate = true }
    catch (error) { if ((error as { statusCode?: number }).statusCode !== 403) throw error }
  }

  try {
    const tenantId = await getSelectedTenant(event)
    return await getClientFinancials({
      tenantId: tenantId ?? null,
      clientId,
      from: query.from,
      to: query.to,
      includeSources: canViewSources,
      canAllocate,
    })
  } catch (error) {
    if (error instanceof ClientFinancialRepositoryError && error.code === 'client_not_found') {
      throw createError({ statusCode: 404, statusMessage: 'Client not found' })
    }
    if (isError(error) && (error.statusCode === 400 || error.statusCode === 404)) {
      throw error
    }
    throw createError({ statusCode: 500, statusMessage: 'Failed to load client financials' })
  }
})
