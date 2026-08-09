import { createError } from 'h3'
import { normalizeCrmSearchRequest } from '~~/server/utils/crm/searchRequest'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import {
  CRM_KEYWORD_POOL_LIMIT,
  runCrmKeywordSearch,
  type CrmSearchHit
} from '~~/server/utils/crm/search'

export default defineEventHandler(async (event): Promise<{ results: CrmSearchHit[] }> => {
  const request = normalizeCrmSearchRequest(await readBody(event))
  if (!request.clientId) {
    throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  }
  const context = await resolveAgencyCrmSearchContext(event, {
    clientId: request.clientId,
    surface: 'agency_global'
  })
  const keywordPool = await runCrmKeywordSearch(context, request.query, CRM_KEYWORD_POOL_LIMIT)
  return { results: keywordPool.slice(0, request.limit) }
})
