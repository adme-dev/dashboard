import { requireAuth } from '~~/server/utils/auth'
import { loadSocialInboxAiContext } from '~~/server/utils/socialInbox/aiContext'
import { generateSocialInboxAiTriage } from '~~/server/utils/socialInbox/aiTriage'
import { executeSocialInboxExternalMutation } from '~~/server/utils/socialInbox/godModeMutations'

type Triage = Awaited<ReturnType<typeof generateSocialInboxAiTriage>>

/**
 * POST /api/agency/social/inbox/conversations/:id/ai-triage
 *
 * God mode: external-ledger family (model inference). Only the triage verdict is stored for
 * replay — the context is reloaded fresh because it can be large.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const context = await loadSocialInboxAiContext(id)
  if (!context) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  const triage = await executeSocialInboxExternalMutation<Triage>(event, 'ai-triage', async (run) => {
    if (run.replay && run.replayResult) return run.replayResult
    const generated = await generateSocialInboxAiTriage(context)
    await run.markDispatched()
    return generated
  })
  return { context, triage }
})
