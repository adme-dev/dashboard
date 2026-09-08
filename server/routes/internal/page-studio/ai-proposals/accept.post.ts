import { acceptPageStudioAiProposal } from '~~/server/utils/pageStudio/controlStore'
import {
  PageStudioAiProposalAcceptanceSchema,
  PageStudioIdempotencyKeySchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { queryOne } from '~~/server/utils/db'
import {
  assertPageStudioSessionActive,
  authorizePageStudioSession,
  resolvePageStudioSessionEnvironment,
  resolvePageStudioSessionPublicKey,
  verifyPageStudioSessionToken
} from '~~/server/utils/pageStudio/sessions'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioAiProposalAcceptanceSchema.safeParse(await readBody(event))
    const idempotency = PageStudioIdempotencyKeySchema.safeParse(
      getHeader(event, 'idempotency-key')
    )
    if (!parsed.success || !idempotency.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid AI proposal acceptance',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid AI proposal acceptance' } }
      })
    }
    const sessionToken = getHeader(event, 'x-page-studio-session')
    if (!sessionToken) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Page Studio session required',
        data: { error: { code: 'SESSION_REQUIRED', message: 'Page Studio session required' } }
      })
    }
    const sessionEnvironment = resolvePageStudioSessionEnvironment(event)
    const session = await verifyPageStudioSessionToken(
      sessionToken,
      resolvePageStudioSessionPublicKey(event),
      sessionEnvironment.issuer
    )
    authorizePageStudioSession(session, parsed.data)
    await assertPageStudioSessionActive(session, queryOne)
    setResponseStatus(event, 201)
    return await acceptPageStudioAiProposal({
      ...parsed.data,
      idempotencyKey: idempotency.data
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
