import { readBody, createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const updates: string[] = []
  const params: any[] = [id, user.id]
  let idx = 3

  if (body.status) {
    const allowed = ['active', 'in_progress', 'resolved', 'dismissed']
    if (!allowed.includes(body.status)) {
      throw createError({ statusCode: 400, statusMessage: `status must be one of: ${allowed.join(', ')}` })
    }
    updates.push(`status = $${idx}`)
    params.push(body.status)
    idx++
  }

  if (typeof body.note === 'string') {
    updates.push(`note = $${idx}`)
    params.push(body.note || null)
    idx++
  }

  if (updates.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields to update' })
  }

  updates.push('updated_at = NOW()')

  const row = await queryOne(
    `UPDATE saved_action_plans SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2
     RETURNING id, source_title, status, note, updated_at`,
    params
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Saved plan not found' })
  }

  return row
})
