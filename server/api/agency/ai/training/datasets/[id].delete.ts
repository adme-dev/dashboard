import { execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')

  const affected = await execute(
    `UPDATE ai_training_datasets SET status = 'archived', updated_at = NOW() WHERE id = $1`,
    [id]
  )

  if (affected === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Dataset not found' })
  }

  return { archived: true }
})
