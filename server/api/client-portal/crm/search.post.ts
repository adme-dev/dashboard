import { createError } from 'h3'
import { requireClientCrmAccess } from '~~/server/utils/crm/clientCrmAccess'
import { normalizeCrmSearchRequest } from '~~/server/utils/crm/searchRequest'
import { resolvePortalCrmSearchContext } from '~~/server/utils/crm/searchContext'
import {
  CRM_KEYWORD_POOL_LIMIT,
  runCrmKeywordSearch,
  type CrmSearchHit
} from '~~/server/utils/crm/search'

export default defineEventHandler(async (event): Promise<{ results: CrmSearchHit[] }> => {
  await requireClientCrmAccess(event, 'view')
  const request = normalizeCrmSearchRequest(await readBody(event))
  if (request.clientId) {
    throw createError({ statusCode: 400, statusMessage: 'clientId is not accepted on portal search' })
  }
  const context = await resolvePortalCrmSearchContext(event, { surface: 'portal_global' })
  const keywordPool = await runCrmKeywordSearch(context, request.query, CRM_KEYWORD_POOL_LIMIT)
  return { results: keywordPool.slice(0, request.limit) }
})
