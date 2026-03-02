/**
 * Update an A/B test (status, traffic split, winner)
 * PATCH /api/agency/banner-studio/ab-tests/:id
 * Body: { status?, variants?, winnerId? }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const VALID_STATUSES = ['draft', 'running', 'paused', 'completed']

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Test ID is required' })
  }

  const body = await readBody(event)
  const { status, variants, winnerId } = body as {
    status?: string
    variants?: Array<{ variantId: string; label: string; weight: number }>
    winnerId?: string
  }

  const sets: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` })
    }
    sets.push(`status = $${paramIndex}`)
    params.push(status)
    paramIndex++
  }

  if (variants !== undefined) {
    sets.push(`variants = $${paramIndex}`)
    params.push(JSON.stringify(variants))
    paramIndex++
  }

  if (winnerId !== undefined) {
    sets.push(`winner_id = $${paramIndex}`)
    params.push(winnerId)
    paramIndex++
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  sets.push('updated_at = NOW()')

  const row = await queryOne(`
    UPDATE banner_ab_tests
    SET ${sets.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING
      id, project_id AS "projectId", format_key AS "formatKey",
      name, status, variants, winner_id AS "winnerId",
      created_at AS "createdAt", updated_at AS "updatedAt"
  `, [...params, id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'A/B test not found' })
  }

  return row
})
