import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'token_required' })
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM lead_webhook_endpoints WHERE url_token = $1`, [token],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { ok: true, ready: true }
})
