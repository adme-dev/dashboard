import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { isSocialClientId, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const MAX_CAPTION_LENGTH = 4000

/** PATCH /api/agency/social/feed-rules/:id — toggle/update a rule. */
export default eventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const id = getRouterParam(event, 'id')
  if (!isSocialClientId(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid rule id' })
  const existing = await queryOne<{ id: string, client_id: string }>(
    'SELECT id, client_id FROM feed_post_rules WHERE id = $1',
    [id]
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
  await requireSocialClientAccess(event, existing.client_id)

  const rawBody = await readBody<unknown>(event)
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be an object' })
  }
  const body = rawBody as { enabled?: boolean, captionTemplate?: string | null }
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'enabled must be a boolean' })
  }
  if (body.captionTemplate !== undefined && body.captionTemplate !== null && typeof body.captionTemplate !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'captionTemplate must be a string or null' })
  }
  if (typeof body.captionTemplate === 'string' && body.captionTemplate.length > MAX_CAPTION_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `captionTemplate must be ${MAX_CAPTION_LENGTH} characters or fewer` })
  }

  const sets: string[] = []
  const params: unknown[] = []
  if (body.enabled !== undefined) {
    params.push(body.enabled)
    sets.push(`enabled = $${params.length}`)
  }
  if (body.captionTemplate !== undefined) {
    params.push(typeof body.captionTemplate === 'string' ? body.captionTemplate.trim() || null : null)
    sets.push(`caption_template = $${params.length}`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No updatable fields provided' })
  sets.push('updated_at = NOW()')
  params.push(id, existing.client_id)
  const rule = await queryOne(
    `UPDATE feed_post_rules
        SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND client_id = $${params.length}
      RETURNING id, client_id, enabled, caption_template`,
    params
  )
  if (!rule) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
  return { rule }
})
