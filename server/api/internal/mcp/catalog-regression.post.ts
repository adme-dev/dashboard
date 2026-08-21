import { createHash } from 'node:crypto'
import { getHeader } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { createBulkNotifications } from '~~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  const expected = process.env.MCP_INTERNAL_SECRET
  if (!expected || getHeader(event, 'x-mcp-secret') !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const body = await readBody(event) as { detail?: unknown }
  const detail = typeof body?.detail === 'string' ? body.detail.replace(/\s+/g, ' ').trim().slice(0, 1000) : ''
  if (!detail) throw createError({ statusCode: 400, statusMessage: 'detail is required' })
  const fingerprint = createHash('sha256').update(detail).digest('hex')
  const duplicate = await queryOne<{ id: string }>(
    `SELECT id::text
       FROM notifications
      WHERE type = 'system'
        AND metadata->>'kind' = 'mcp_catalog_regression'
        AND metadata->>'fingerprint' = $1
        AND created_at >= NOW() - interval '1 hour'
      LIMIT 1`,
    [fingerprint]
  )
  if (duplicate) return { ok: true, notified: false, duplicate: true }
  const owners = await queryRows<{ id: string }>(
    `SELECT id::text FROM team_members WHERE is_active = TRUE AND user_role = 'owner'`
  )
  await createBulkNotifications(owners.map(owner => owner.id), {
    type: 'system',
    title: 'XeroFlow MCP catalog regression blocked',
    message: detail,
    link: '/agency/ai',
    reason: 'direct',
    metadata: { kind: 'mcp_catalog_regression', fingerprint, detail },
  })
  return { ok: true, notified: true, recipients: owners.length }
})
