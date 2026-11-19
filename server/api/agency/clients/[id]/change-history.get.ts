/**
 * GET /api/agency/clients/:id/change-history
 * Per-client change timeline (who changed what, when, approved by whom, with before/after and the
 * provider request id where the source records one). Dormant: returns `{ enabled: false }` until the
 * committed switch in shared/changeHistoryDefaults.ts is turned on.
 *
 * Query: connectionId?, sources? (comma-separated origins), startDate? / endDate? (YYYY-MM-DD, inclusive, agency-local), cursor?, limit? (1–100)
 */
import { requirePermission } from '~~/server/utils/auth'
import { resolveBrowserMarketingReadScope } from '~~/server/utils/ai/marketing/readScope'
import { clientChangeHistoryEnabled } from '~~/server/utils/changeHistory/config'
import { readScopedClientChangeHistory } from '~~/server/utils/changeHistory/access'
import { CHANGE_HISTORY_ORIGINS, ChangeHistoryInputError, type ChangeHistoryOrigin } from '~~/server/utils/changeHistory/clientTimeline'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const optionalString = (value: unknown): string | null => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'CLIENTS')
  setHeader(event, 'Cache-Control', 'private, no-store')
  const clientId = getRouterParam(event, 'id')
  if (!clientId || !UUID.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid client ID is required' })
  }
  if (!clientChangeHistoryEnabled()) {
    return { enabled: false, entries: [], nextCursor: null, more: false }
  }
  const query = getQuery(event)
  const limitRaw = optionalString(query.limit)
  const limit = limitRaw ? Number(limitRaw) : undefined
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw createError({ statusCode: 400, statusMessage: 'limit must be an integer from 1 to 100' })
  }
  const sourcesRaw = optionalString(query.sources)
  const origins = sourcesRaw ? sourcesRaw.split(',').map(value => value.trim()) : []
  if (origins.some(origin => !(CHANGE_HISTORY_ORIGINS as readonly string[]).includes(origin))) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown change history source' })
  }
  const scope = await resolveBrowserMarketingReadScope(event)
  try {
    const page = await readScopedClientChangeHistory(scope, {
      clientId: clientId.toLowerCase(),
      connectionId: optionalString(query.connectionId),
      startDate: optionalString(query.startDate),
      endDate: optionalString(query.endDate),
      cursor: optionalString(query.cursor),
      limit,
      ...(origins.length ? { origins: origins as ChangeHistoryOrigin[] } : {})
    })
    return { enabled: true, ...page }
  } catch (error) {
    if (error instanceof ChangeHistoryInputError) throw createError({ statusCode: 400, statusMessage: error.message })
    throw error
  }
})
