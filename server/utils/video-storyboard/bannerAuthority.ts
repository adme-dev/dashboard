import { createError, type H3Event } from 'h3'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'
import { resolveMcpStaffContext } from '~~/server/utils/ai/mcp/staffAuthority'
import { freshContextCoversClient } from '~~/server/utils/ai/marketing/reviewAuthority'
import { hasSocialClientPermission, hasAllSocialClientAccess } from '~~/server/utils/social/clientAccess'

/** Banner read policy, using current role/assignment records in the caller's transaction.
 * No connector scopes or marketing grants confer browser/reference authority.
 */
export async function requireStoryboardBannerAccess(
  db: GodModeTransactionDb,
  event: H3Event | undefined,
  actor: MediaProjectActor,
  kind: 'banner_project' | 'brand_kit',
  row: { client_id: string | null, created_by: string }
) {
  const denied = () => createError({ statusCode: 403, statusMessage: 'No current access to this reference' })
  if (!event) throw denied()
  const context = await resolveMcpStaffContext(event, actor.id, [], {
    db: {
      queryOne: async <T>(sql: string, params?: unknown[]) => (await db.query(sql, params)).rows[0] as T ?? null,
      queryRows: async <T>(sql: string, params?: unknown[]) => (await db.query(sql, params)).rows as T[]
    }
  })
  // Empty legacy role prevents static defaults from restoring a freshly revoked group.
  const authority = { role: '', permissionGroups: context.permissionGroups }
  if (kind === 'brand_kit' || row.client_id) {
    if (!hasSocialClientPermission(authority)) throw denied()
    if (row.client_id && !await freshContextCoversClient(context, row.client_id, async clientId =>
      !!(await db.query('SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE', [clientId])).rows[0]
    )) throw denied()
  } else if (row.created_by !== actor.id && !hasAllSocialClientAccess(authority)) {
    throw denied()
  }
}
