import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/**
 * PATCH /api/agency/social/inbox/conversations/:id
 * Update status and/or mark the conversation read. Body: { status?, markRead? }.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  if (body.status && ['open', 'snoozed', 'closed'].includes(body.status)) {
    params.push(body.status)
    sets.push(`status = $${params.length}`)
  }
  if (body.markRead === true) sets.push(`unread_count = 0`)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  params.push(id)
  await execute(`UPDATE social_conversations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
  return { ok: true }
})
