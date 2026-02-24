/**
 * Update a subscription's settings
 */
import { queryOne } from '~~/server/utils/db'

interface UpdateSubscriptionBody {
  events?: string[]
  notifyInapp?: boolean
  notifyEmail?: boolean
  isMuted?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const subId = getRouterParam(event, 'subId')
  const body = await readBody<UpdateSubscriptionBody>(event)

  if (!subId) {
    throw createError({ statusCode: 400, statusMessage: 'Subscription ID is required' })
  }

  // Verify ownership
  const existing = await queryOne(
    'SELECT * FROM board_subscriptions WHERE id = $1 AND user_id = $2',
    [subId, user.id]
  )

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  }

  const fields: string[] = []
  const values: any[] = []
  let idx = 1

  if (body.events !== undefined) {
    fields.push(`events = $${idx}`)
    values.push(body.events)
    idx++
  }
  if (body.notifyInapp !== undefined) {
    fields.push(`notify_inapp = $${idx}`)
    values.push(body.notifyInapp)
    idx++
  }
  if (body.notifyEmail !== undefined) {
    fields.push(`notify_email = $${idx}`)
    values.push(body.notifyEmail)
    idx++
  }
  if (body.isMuted !== undefined) {
    fields.push(`is_muted = $${idx}`)
    values.push(body.isMuted)
    idx++
  }

  if (fields.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  fields.push('updated_at = NOW()')
  values.push(subId)

  const updated = await queryOne(`
    UPDATE board_subscriptions
    SET ${fields.join(', ')}
    WHERE id = $${idx}
    RETURNING *
  `, values)

  return {
    id: updated.id,
    boardId: updated.board_id,
    itemId: updated.item_id,
    columnId: updated.column_id,
    events: updated.events,
    notifyInapp: updated.notify_inapp,
    notifyEmail: updated.notify_email,
    isMuted: updated.is_muted,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  }
})
