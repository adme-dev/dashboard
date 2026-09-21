import { readPageStudioJson } from '~~/server/utils/pageStudio/boundedJson'
import { createError, eventHandler, getHeader, setHeader, type H3Event } from 'h3'
import { PageStudioAiUsageRequestSchema } from '~~/shared/pageStudio/aiUsage'
import { updatePageStudioAiUsage } from '~~/server/utils/pageStudio/aiUsage'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey, verifyPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

async function boundedRequest(event: H3Event) {
  const value = await readPageStudioJson(event, 4096, [
    'AI usage requires JSON',
    'AI usage request exceeds byte limit',
    'AI usage request required',
    'Invalid AI usage body',
    'Invalid AI usage request'
  ])
  try {
    return PageStudioAiUsageRequestSchema.parse(value)
  } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid AI usage request' }) }
}

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const token = getHeader(event, 'x-page-studio-session')
    if (!token || token.length > 8192) throw createError({ statusCode: 401, statusMessage: 'Page Studio session required' })
    const session = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    const body = await boundedRequest(event)
    return await updatePageStudioAiUsage(body, session, event.context.cloudflare?.env?.PAGE_STUDIO_CONTENT_ENVIRONMENT)
  } catch (error) { return pageStudioInternalHttpError(event, error) }
})
