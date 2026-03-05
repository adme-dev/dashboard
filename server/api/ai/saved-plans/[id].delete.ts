import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  await execute(
    `DELETE FROM saved_action_plans WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  )

  return { success: true }
})
