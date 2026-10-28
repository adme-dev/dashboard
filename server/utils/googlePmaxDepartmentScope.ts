import { createError, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { hasAllSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * Browser PMax portfolio scope for dedicated marketing department staff.
 * Returns null for users who keep the legacy MEDIA_BUYING / all-social path. Department scope is
 * resolved from fresh role policy and client assignment, is active-client-only, and never sets the
 * legacy all-social sentinel. `clientIds` undefined means every current active client.
 */
export async function resolvePmaxDepartmentPortfolio(event: H3Event, clientId?: string): Promise<{ userId: string, clientIds?: string[] } | null> {
  const user = await requireAuth(event)
  if (!user.permissionGroups?.includes('MARKETING_MANAGEMENT') || hasAllSocialClientAccess(user)) return null
  const [{ resolveMcpStaffContext }, { freshContextCoversClient }] = await Promise.all([
    import('~~/server/utils/ai/mcp/staffAuthority'), import('~~/server/utils/ai/marketing/reviewAuthority')
  ])
  const ctx = await resolveMcpStaffContext(event, user.id, [])
  const scope = ctx.assistantScope
  if (!ctx.permissionGroups?.includes('MARKETING_MANAGEMENT') || !scope) {
    throw createError({ statusCode: 403, statusMessage: 'No current marketing department access' })
  }
  if (clientId) {
    if (!await freshContextCoversClient(ctx, clientId)) throw createError({ statusCode: 403, statusMessage: 'No current access to this client' })
    return { userId: user.id, clientIds: [clientId] }
  }
  return { userId: user.id, clientIds: scope.clientAccessMode === 'all_active' ? undefined : [...scope.assignedClientIds] }
}
