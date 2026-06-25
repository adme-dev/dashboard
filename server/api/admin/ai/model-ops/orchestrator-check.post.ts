import { requireRole } from '~~/server/utils/auth'
import manualCheckHandler from '~~/server/api/internal/ai-orchestrator/manual-check.post'

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const expectedKey = process.env.INTERNAL_API_KEY?.trim()
  if (!expectedKey) {
    throw createError({ statusCode: 503, statusMessage: 'INTERNAL_API_KEY is not configured' })
  }

  const body = await readBody(event).catch(() => ({}))

  return await manualCheckHandler({
    headers: {
      authorization: `Bearer ${expectedKey}`,
    },
    body,
  } as any)
})
