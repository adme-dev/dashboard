import { execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID is required' })
  }

  const deleted = await execute(
    `DELETE FROM ai_training_knowledge WHERE id = $1`,
    [id],
  )

  if (deleted === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Knowledge entry not found' })
  }

  return { deleted: true }
})
