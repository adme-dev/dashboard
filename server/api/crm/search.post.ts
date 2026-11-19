import { createError } from 'h3'
import { normalizeCrmSearchRequest } from '~~/server/utils/crm/searchRequest'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireActiveCrmSearchScope } from '~~/server/utils/crm/searchDormancy'
import type { CrmSearchHit } from '~~/server/utils/crm/search'
import {
  createCrmRetrievalDependencies,
  retrieveCrm
} from '~~/server/utils/crm/retrieval'

export default defineEventHandler(async (event): Promise<{ results: CrmSearchHit[] }> => {
  const request = normalizeCrmSearchRequest(await readBody(event))
  if (!request.clientId) {
    throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  }
  const context = await resolveAgencyCrmSearchContext(event, {
    clientId: request.clientId,
    surface: 'agency_global'
  })
  // Authorization above is unchanged; a dormant search scope is an explicit
  // "not enabled" response, never empty or synthesized results.
  requireActiveCrmSearchScope(context)
  const result = await retrieveCrm(
    context,
    request,
    createCrmRetrievalDependencies(event)
  )
  return { results: result.results }
})
