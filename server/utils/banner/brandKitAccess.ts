import type { H3Event } from 'h3'
import { requireAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export async function requireBrandKitWriteAccess(event: H3Event, clientId: string | null | undefined) {
  if (clientId) await requireSocialClientAccess(event, clientId)
  else await requireAllSocialClientAccess(event)
}

/** Lock ownership until all content/default mutations finish in this transaction. */
export async function lockBrandKitForWrite(event: H3Event, db: { query: (sql: string, params: unknown[]) => Promise<{ rows: { client_id: string | null }[] }> }, id: string) {
  const result = await db.query('SELECT client_id FROM brand_kits WHERE id = $1 FOR UPDATE', [id])
  const row = result.rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  await requireBrandKitWriteAccess(event, row.client_id)
  return row.client_id
}
