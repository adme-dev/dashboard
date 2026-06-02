/**
 * Mint an analytics export token
 * POST /api/agency/analytics/export-tokens  body: { label, clientId? }
 * Returns the plaintext token ONCE — only the hash is stored.
 */
import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { generateExportToken, sha256Hex } from '~~/server/utils/exportTokens'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const body = await readBody(event).catch(() => null)
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  const clientId = typeof body?.clientId === 'string' && body.clientId ? body.clientId : null
  if (!label) {
    throw createError({ statusCode: 400, statusMessage: 'label is required' })
  }
  if (label.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'label must be under 100 characters' })
  }

  const token = generateExportToken()
  const tokenHash = await sha256Hex(token)
  const row = await queryOne<{ id: string, created_at: string }>(
    `INSERT INTO analytics_export_tokens (token_hash, label, client_id, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [tokenHash, label, clientId, user.id]
  )

  // Plaintext token returned once; never retrievable again.
  return { id: row?.id, label, clientId, createdAt: row?.created_at, token }
})
