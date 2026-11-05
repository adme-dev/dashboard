import { createError, getHeader, getRequestURL, getRouterParam, type H3Event } from 'h3'
import { requireAgencyPageStudioAccess } from './access'
import { readPageStudioJson } from './boundedJson'
import { requestPageStudioStaging } from './stagingHttp'
import { PageStudioStagingVisibilitySchema } from '~~/shared/pageStudio/staging'

export async function handleAgencyStagingVisibility(event: H3Event, operation: 'suspend' | 'resume') {
  if (getHeader(event, 'origin') !== getRequestURL(event).origin || getHeader(event, 'sec-fetch-site') === 'cross-site') throw createError({ statusCode: 403 })
  const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
  const body = PageStudioStagingVisibilitySchema.parse(await readPageStudioJson(event, 2048, ['JSON required', 'Request too large', 'Request required', 'Invalid request', 'Invalid JSON']))
  return requestPageStudioStaging(event, { operation, actor: { kind: 'agency', actorId: user.id, tenantId },
    siteId: getRouterParam(event, 'siteId'), expectedEnvironment: event.context.cloudflare?.env?.PAGE_STUDIO_RELEASE_ENVIRONMENT, body })
}
