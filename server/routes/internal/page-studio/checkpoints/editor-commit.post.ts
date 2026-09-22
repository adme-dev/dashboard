import { commitPageStudioEditorCheckpoint } from '~~/server/utils/pageStudio/controlStore'
import { PageStudioCheckpointCommitSchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { assertPageStudioSessionAuthority } from '~~/server/utils/pageStudio/sessionAuthority'
import { authorizePageStudioSession, resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey,
  verifyPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioCheckpointCommitSchema.safeParse(await readBody(event))
    const idempotencyKey = getHeader(event, 'idempotency-key')
    if (!parsed.success || idempotencyKey !== parsed.data.checkpoint.checkpointId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid checkpoint commit request',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid checkpoint commit request' } }
      })
    }
    const token = getHeader(event, 'x-page-studio-session')
    if (!token) throw createError({ statusCode: 401, statusMessage: 'Page Studio session required' })
    const session = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event),
      resolvePageStudioSessionEnvironment(event).issuer)
    authorizePageStudioSession(session, { checkpoint: parsed.data.checkpoint, authorRole: session.role,
      requiredCapabilities: ['workspace:checkpoint'] })
    await assertPageStudioSessionAuthority(session, 'workspace:checkpoint')
    return await commitPageStudioEditorCheckpoint({ ...parsed.data,
      expectedCheckpointId: parsed.data.expectedCheckpointId ?? null }, session, { env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown> })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
