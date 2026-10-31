import { createError, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { requireAllSocialClientAccess, requireSocialClientAccess, hasSocialClientPermission, hasAllSocialClientAccess } from '~~/server/utils/social/clientAccess'

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

/** Shared kits are readable by creative/client staff; assigned kits require client access. */
export async function requireBrandKitReadAccess(event: H3Event, clientId: string | null | undefined) {
  const user = await requireAuth(event)
  if (!hasSocialClientPermission(user)) throw createError({ statusCode: 403, statusMessage: 'Creative client access required' })
  if (clientId) await requireSocialClientAccess(event, clientId)
  return user
}

/** Scoped list predicate also applies when no client filter is supplied. */
export async function brandKitReadScope(event: H3Event, clientId: unknown) {
  const user = await requireBrandKitReadAccess(event, null)
  const params: unknown[] = []
  if (clientId !== undefined && typeof clientId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
  if (clientId === '__agency__') return { where: 'WHERE bk.client_id IS NULL', params }
  if (clientId !== undefined) {
    await requireSocialClientAccess(event, clientId as string)
    return { where: 'WHERE (bk.client_id = $1::uuid OR bk.client_id IS NULL)', params: [clientId] }
  }
  if (hasAllSocialClientAccess(user)) return { where: '', params }
  if (user.permissionGroups?.includes('MARKETING_MANAGEMENT')) {
    if (!await hasFreshMarketingManagementPermission(user.id)) throw createError({ statusCode: 403, statusMessage: 'Marketing permission revoked' })
    return { where: 'WHERE (bk.client_id IS NULL OR EXISTS (SELECT 1 FROM agency_clients c WHERE c.id = bk.client_id AND c.is_active = TRUE))', params }
  }
  return {
    where: 'WHERE (bk.client_id IS NULL OR EXISTS (SELECT 1 FROM client_team_assignments a WHERE a.client_id = bk.client_id AND a.team_member_id = $1))',
    params: [user.id]
  }
}
