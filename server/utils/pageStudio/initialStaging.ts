import type { H3Event } from 'h3'
import type { DomainManagementActor } from '~~/shared/pageStudio/domainManagement'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { requestPageStudioStaging } from './stagingHttp'

/** Called only after site creation commits. A provider/transport failure cannot
 * undo the site or turn its successful creation into a reported save failure.
 * The workspace can check the same idempotent ensure operation afterwards. */
export async function prepareCreatedSiteStaging(event: H3Event, actor: DomainManagementActor, siteId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const work = requestPageStudioStaging(event, {
      operation: 'ensure', actor, siteId,
      expectedEnvironment: event.context.cloudflare?.env?.PAGE_STUDIO_RELEASE_ENVIRONMENT
    }).catch(() => null)
    // Retain request lifetime after the response deadline; never leak provider
    // exception details through the shared background logger.
    runAfterResponse(event, work, 'page-studio-initial-staging')
    return await Promise.race([
      work,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 5000) })
    ])
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
