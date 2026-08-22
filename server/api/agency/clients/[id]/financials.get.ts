import { requireRole } from '~~/server/utils/auth'
import { getClientFinancials } from '~~/server/utils/clientFinancials'
import { parseClientFinancialRange } from '~~/server/utils/clientFinancialCalculations'
import { ClientFinancialRepositoryError } from '~~/server/utils/clientFinancialRepository'
import { isReadOnlyRole, PERMISSIONS, roleHasPermission } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'

function isTypedHttpError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CLIENTS)
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

  const canViewSources = roleHasPermission(user.role, 'FINANCE')
    || user.permissionGroups?.includes('FINANCE') === true
  const canAllocate = canViewSources
    && !isReadOnlyRole(user.role)
    && user.isCustomReadOnly !== true
  const tenantId = await getSelectedTenant(event)

  try {
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
    if (isTypedHttpError(error) && (error.statusCode === 400 || error.statusCode === 404)) {
      throw error
    }
    throw createError({ statusCode: 500, statusMessage: 'Failed to load client financials' })
  }
})
