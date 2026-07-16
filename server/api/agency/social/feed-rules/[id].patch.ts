import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** PATCH /api/agency/social/feed-rules/:id — toggle/update a rule. */
export default eventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ enabled?: boolean; captionTemplate?: string }>(event)
  const rule = await queryOne(
    `UPDATE feed_post_rules
        SET enabled = COALESCE($2, enabled),
            caption_template = COALESCE($3, caption_template),
            updated_at = NOW()
      WHERE id = $1
      RETURNING id, enabled, caption_template`,
    [id, body.enabled ?? null, body.captionTemplate ?? null],
  )
  if (!rule) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
  return { rule }
})
