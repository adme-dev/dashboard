import { requireAuth } from '~~/server/utils/auth'
import { processFeedback } from '~~/server/utils/aiFeedbackProcessor'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const messageId = getRouterParam(event, 'id')

  if (!messageId) {
    throw createError({ statusCode: 400, statusMessage: 'Message ID is required' })
  }

  const body = await readBody(event)

  if (body.rating !== 1 && body.rating !== -1) {
    throw createError({ statusCode: 400, statusMessage: 'Rating must be 1 or -1' })
  }

  await processFeedback(
    messageId,
    user.id,
    body.rating,
    body.correction || undefined,
    body.category || undefined
  )

  return { success: true }
})
