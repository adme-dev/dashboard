import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { readyPortalTemplateCopy } from '~~/server/utils/pageStudio/portalCodeCheckpoints'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey, verifyPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

/** Private launch admission proof. A ready destination does not inherit source
 * import permission, and its editor access survives catalogue withdrawal. */
export default eventHandler(async event => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    if (!z.object({}).strict().safeParse(await readBody(event)).success) throw createError({ statusCode: 400 })
    const token = getHeader(event, 'x-page-studio-session')
    if (!token) throw createError({ statusCode: 401 })
    const claims = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    return await transactionWithoutRetry(async db => ({ ready: !!await readyPortalTemplateCopy(db, claims) }))
  } catch (error) { return pageStudioInternalHttpError(event, error) }
})
