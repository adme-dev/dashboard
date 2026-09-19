import { z } from 'zod'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { assertPageStudioSessionAuthority } from '~~/server/utils/pageStudio/sessionAuthority'
import {
  PageStudioSessionCapabilitySchema, PageStudioSessionError,
  resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey,
  verifyPageStudioSessionToken
} from '~~/server/utils/pageStudio/sessions'

const Request = z.object({ capability: PageStudioSessionCapabilitySchema }).strict()

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const input = Request.safeParse(await readBody(event))
    if (!input.success) throw createError({ statusCode: 400, statusMessage: 'Invalid session authority request' })
    const token = getHeader(event, 'x-page-studio-session')
    if (!token || token.length > 8192) throw new PageStudioSessionError('SESSION_TOKEN_INVALID', 401, 'Page Studio session required')
    const session = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    await assertPageStudioSessionAuthority(session, input.data.capability)
    return { authorized: true, sessionId: session.nonce, capability: input.data.capability }
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
