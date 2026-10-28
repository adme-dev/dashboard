// server/utils/socialInbox/departmentScope.ts
// Browser social-inbox scope for staff admitted through the dedicated MARKETING_MANAGEMENT
// department grant. Legacy staff (every other session, including ADMIN/MANAGEMENT) keep the
// established all-clients inbox behaviour unchanged. Department staff are re-verified against
// current storage on every request and only reach conversations that belong to an ACTIVE client
// through an ACTIVE social account owned by that same client.
//
// The predicate is SQL so list routes apply it before ORDER/LIMIT (no post-limit filtering, no
// counts over foreign rows) and mutation routes can bind it into the same statement they mutate.
import { createError, type H3Event } from 'h3'
import { requireAuth, type User } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { hasAllSocialClientAccess, isSocialClientId } from '~~/server/utils/social/clientAccess'
import { departmentConversationScopeSql } from './departmentScopeSql'

export interface SocialInboxScope {
  user: User
  /** True when the caller is department-scoped; false means legacy all-clients behaviour. */
  department: boolean
}

/** Department scope applies only to the dedicated grant; ADMIN/MANAGEMENT keep legacy all-client access. */
export function isDepartmentInboxUser(user: Pick<User, 'role' | 'permissionGroups'>): boolean {
  return !!user.permissionGroups?.includes('MARKETING_MANAGEMENT') && !hasAllSocialClientAccess(user)
}

/** Authenticate and, for department staff, require the grant to still exist in current storage. */
export async function resolveSocialInboxScope(event: H3Event): Promise<SocialInboxScope> {
  const user = await requireAuth(event)
  if (!isDepartmentInboxUser(user)) return { user, department: false }
  if (!await hasFreshMarketingManagementPermission(String(user.id))) {
    throw createError({ statusCode: 403, statusMessage: 'No current inbox access' })
  }
  return { user, department: true }
}

/**
 * Department staff may only name an active client. Legacy staff are unchanged. Returns the scope so
 * routes do not authenticate twice.
 */
export async function requireSocialInboxClient(event: H3Event, clientId: string | null | undefined): Promise<SocialInboxScope> {
  const scope = await resolveSocialInboxScope(event)
  if (!scope.department || !clientId) return scope
  if (!isSocialClientId(clientId)) throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
  const row = await queryOneFresh('SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE', [clientId])
  if (!row) throw createError({ statusCode: 403, statusMessage: 'No current access to this client' })
  return scope
}

/**
 * Conversation-level guard. Department staff get a 404 (no existence leak) for conversations outside
 * scope: inactive client, inactive account, or an account owned by a different client.
 */
export async function requireSocialInboxConversation(event: H3Event, conversationId: string | undefined): Promise<SocialInboxScope> {
  const scope = await resolveSocialInboxScope(event)
  if (!scope.department) return scope
  if (!isSocialClientId(conversationId)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const row = await queryOneFresh(
    `SELECT c.id FROM social_conversations c WHERE c.id = $1 AND ${departmentConversationScopeSql('c')}`,
    [conversationId]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return scope
}
