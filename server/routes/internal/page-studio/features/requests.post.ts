import { createError, eventHandler, getHeader, setHeader } from 'h3'
import { readPageStudioJson } from '~~/server/utils/pageStudio/boundedJson'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey, verifyPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'
import { updatePageStudioFeatureRequest } from '~~/server/utils/pageStudio/featureRequestRecovery'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    const token = getHeader(event, 'x-page-studio-session')
    if (!token || token.length > 8192) throw createError({ statusCode: 401, statusMessage: 'Page Studio session required' })
    const claims = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    const body = await readPageStudioJson(event, 4096, ['Recovery requires JSON', 'Recovery request exceeds byte limit', 'Recovery request required', 'Invalid recovery request', 'Invalid recovery JSON'])
    return await updatePageStudioFeatureRequest(body, claims, event.context.cloudflare?.env?.PAGE_STUDIO_CONTENT_ENVIRONMENT)
  } catch (error) { return pageStudioInternalHttpError(event, error) }
})
