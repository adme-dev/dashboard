/**
 * POST /api/portal/ai/chat — the client-portal co-pilot (portal-agent spec).
 * Customer-facing: clientAuth (NOT requireAuth). clientScope = session.clientId is the tenant key for
 * every tool. Gated behind AI_PORTAL_ENABLED — its OWN flag, so enabling the agency chat never exposes
 * this surface. Tier 1 read-only.
 */
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { processPortalMessage } from '~~/server/utils/aiPortalChatEngine'

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig() as any
  if (!cfg.aiPortalEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const clientUser = await requireClientAuth(event)

  const body = await readBody(event)
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) throw createError({ statusCode: 400, statusMessage: 'Message content required' })
  if (content.length > 10000) throw createError({ statusCode: 400, statusMessage: 'Message too long (max 10,000 characters)' })

  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : undefined

  const result = await processPortalMessage({
    conversationId,
    clientUserId: clientUser.id,
    clientId: clientUser.clientId,
    content,
    event,
  })
  return result
})
