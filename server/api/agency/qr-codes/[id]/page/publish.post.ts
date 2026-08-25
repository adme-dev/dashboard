import { z } from 'zod'
import { requireQrCodeAccess } from '~~/server/utils/qr/access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { invalidateQrPageCache } from '~~/server/utils/qr/pages'
import { invalidateQrCache } from '~~/server/utils/qr/resolve'

const Body = z.object({ published: z.boolean() }).strict()

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  const page = await executeQrMutation(event, 'page-publish', async (db) => {
    const r = await db.query(
      `UPDATE qr_pages SET is_published = $2, published_at = CASE WHEN $2 THEN COALESCE(published_at, NOW()) ELSE published_at END, updated_at = NOW()
       WHERE qr_code_id = $1 RETURNING *`, [row.id, parsed.data.published])
    if (!r.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Save the page before publishing' })
    // Publishing switches the code to page mode; unpublishing falls back to the URL so scans never dead-end.
    await db.query(`UPDATE qr_codes SET destination_mode = $2, updated_at = NOW() WHERE id = $1`, [row.id, parsed.data.published ? 'page' : 'url'])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_pages WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed page no longer exists')
    return r.rows[0]
  })
  await invalidateQrPageCache(event, row.code)
  await invalidateQrCache(event, row.code)
  return { page }
})
