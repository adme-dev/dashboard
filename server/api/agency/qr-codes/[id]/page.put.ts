import { z } from 'zod'
import { requireQrCodeAccess } from '~~/server/utils/qr/access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { invalidateQrPageCache } from '~~/server/utils/qr/pages'
import { invalidateQrCache } from '~~/server/utils/qr/resolve'
import { QR_PAGE_TEMPLATES, QrPageConfigSchema } from '~~/shared/qr/page'

const Body = z.object({
  template: z.enum(QR_PAGE_TEMPLATES),
  config: QrPageConfigSchema,
  /** Switch the code to render this page (or back to its URL). */
  destinationMode: z.enum(['url', 'page']).optional()
}).strict()

export default defineEventHandler(async (event) => {
  const { user, row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid page' })
  const b = parsed.data
  const page = await executeQrMutation(event, 'page-save', async (db) => {
    const r = await db.query(
      `INSERT INTO qr_pages (qr_code_id, template, config, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (qr_code_id) DO UPDATE SET template = EXCLUDED.template, config = EXCLUDED.config, updated_at = NOW()
       RETURNING *`,
      [row.id, b.template, JSON.stringify(b.config), user.id])
    if (b.destinationMode) await db.query(`UPDATE qr_codes SET destination_mode = $2, updated_at = NOW() WHERE id = $1`, [row.id, b.destinationMode])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_pages WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed page no longer exists')
    return r.rows[0]
  })
  await invalidateQrPageCache(event, row.code)
  if (b.destinationMode) await invalidateQrCache(event, row.code)
  return { page }
})
