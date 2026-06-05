import { createError, type H3Event } from 'h3'
import type { User } from '~~/server/utils/auth'
import { getAssignedClientIds } from '~~/server/utils/clientScoping'
import { PERMISSIONS } from '~~/server/utils/permissions'

export type EmailClientScope = 'all' | string[]

export function isAgencyEmailUser(user: Pick<User, 'role' | 'permissionGroups'>): boolean {
  return (PERMISSIONS.MANAGEMENT as readonly string[]).includes(user.role)
    || user.permissionGroups?.includes('ADMIN') === true
    || user.permissionGroups?.includes('MANAGEMENT') === true
}

export async function resolveEmailClientScope(event: H3Event, user: User): Promise<EmailClientScope> {
  if (isAgencyEmailUser(user)) return 'all'
  return getAssignedClientIds(event, user.id)
}

export function assertEmailClientIdInScope(scope: EmailClientScope, clientId: string | null | undefined): void {
  if (scope === 'all') return
  if (!clientId) {
    throw createError({ statusCode: 403, statusMessage: 'email_client_scope_required' })
  }
  if (!scope.includes(clientId)) {
    throw createError({ statusCode: 403, statusMessage: 'email_client_forbidden' })
  }
}

export async function assertEmailClientAccess(event: H3Event, user: User, clientId: string | null | undefined): Promise<void> {
  const scope = await resolveEmailClientScope(event, user)
  assertEmailClientIdInScope(scope, clientId)
}

export async function resolveEmailWriteClientId(
  event: H3Event,
  user: User,
  requestedClientId?: string | null
): Promise<string | null> {
  const scope = await resolveEmailClientScope(event, user)
  if (scope === 'all') return requestedClientId ?? null
  if (requestedClientId) {
    assertEmailClientIdInScope(scope, requestedClientId)
    return requestedClientId
  }
  if (scope.length === 1) return scope[0]
  throw createError({ statusCode: 403, statusMessage: 'email_client_scope_required' })
}

export function addEmailClientScopeCondition(
  conditions: string[],
  params: unknown[],
  column: string,
  scope?: EmailClientScope
): void {
  if (!scope || scope === 'all') return
  params.push(scope)
  conditions.push(`${column} = ANY($${params.length}::uuid[])`)
}

export function assertScopedCampaignLists(
  user: User,
  campaignClientId: string | null | undefined,
  lists: Array<{ client_id: string | null }>
): void {
  if (isAgencyEmailUser(user)) return
  if (!campaignClientId) {
    throw createError({ statusCode: 403, statusMessage: 'email_client_scope_required' })
  }
  if (lists.some(list => list.client_id !== campaignClientId)) {
    throw createError({ statusCode: 403, statusMessage: 'campaign_mixed_client_lists' })
  }
}
