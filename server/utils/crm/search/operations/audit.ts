import { createError, getCookie, getHeader, type H3Event } from 'h3'
import { verifyJwt } from '~~/server/utils/auth'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { PERMISSION_GROUPS, SYSTEM_ROLE_PERMISSIONS } from '~~/server/utils/permissions'
import type { CrmSearchAdminActor } from './contracts'

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu

interface FreshActorRow {
  id: string
  role: string
  custom_role_id: string | null
  sessions_invalidated_at: string | null
}

interface FreshScopeRow {
  organisation_scope_id: string
  control_revision: number
}

export interface FreshCrmSearchAdminDependencies {
  getAuthenticatedSession(event: H3Event): Promise<{
    actorId: string
    issuedAt: string
  } | null>
  getAuthenticatedActorId?: (event: H3Event) => Promise<string>
  loadFreshAuthority(actorId: string): Promise<(CrmSearchAdminActor & {
    active?: boolean
    sessionsInvalidatedAt?: string | null
  }) | null>
  execute?: (...args: unknown[]) => unknown
}

async function loadDefaultFreshAuthority(actorId: string): Promise<(CrmSearchAdminActor & {
  sessionsInvalidatedAt: string | null
}) | null> {
  const actor = await queryOneFresh<FreshActorRow>(`
    SELECT actor.id::TEXT AS id,
           actor.user_role::TEXT AS role,
           actor.custom_role_id::TEXT AS custom_role_id,
           actor.sessions_invalidated_at
      FROM team_members actor
     WHERE actor.id = $1::UUID
       AND actor.is_active = TRUE
     LIMIT 1
  `, [actorId])
  if (!actor) return null

  // This application has one agency-wide CRM search authority scope. Fail closed
  // if fresh storage contains no active primary scope instead of guessing a tenant.
  const scopes = await queryRowsFresh<FreshScopeRow>(`
    SELECT scope.id::TEXT AS organisation_scope_id,
           control.revision::INT AS control_revision
      FROM crm_search_organisation_scopes scope
      JOIN crm_search_global_control control
        ON control.organisation_scope_id = scope.id
     WHERE scope.is_primary = TRUE
       AND scope.is_active = TRUE
     ORDER BY scope.id
     LIMIT 2
  `)
  if (scopes.length !== 1) return null
  const scope = scopes[0]!

  const permissions = actor.custom_role_id
    ? (await queryRowsFresh<{ permission_group: string, is_read_only: boolean }>(`
        SELECT assignment.permission_group, role.is_read_only
          FROM role_permission_groups assignment
          JOIN custom_roles role ON role.id = assignment.role_id
         WHERE role.id = $1::UUID
      `, [actor.custom_role_id]))
        .filter(row => row.is_read_only !== true)
        .map(row => row.permission_group)
        .filter(group => (PERMISSION_GROUPS as readonly string[]).includes(group))
    : [...(SYSTEM_ROLE_PERMISSIONS[actor.role] ?? [])]

  return {
    actorId: actor.id,
    orgId: scope.organisation_scope_id,
    permissions,
    authorityRevision: `${actor.role}:${actor.custom_role_id ?? 'system'}:${scope.control_revision}`,
    sessionsInvalidatedAt: actor.sessions_invalidated_at
  }
}

const defaults: FreshCrmSearchAdminDependencies = {
  async getAuthenticatedSession(event) {
    const cookieToken = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
    const authorization = getHeader(event, 'authorization')
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null
    const token = cookieToken || bearerToken
    if (!token) return null
    const payload = await verifyJwt(token)
    if (!payload || typeof payload.userId !== 'string' || !uuidPattern.test(payload.userId)
      || typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return null
    let issuedAt: string
    try {
      issuedAt = new Date(payload.iat).toISOString()
    } catch {
      return null
    }
    if (!Number.isFinite(Date.parse(issuedAt))) return null
    return { actorId: payload.userId, issuedAt }
  },
  loadFreshAuthority: loadDefaultFreshAuthority
}

export async function requireFreshCrmSearchAdmin(
  event: H3Event,
  overrides: Partial<FreshCrmSearchAdminDependencies> = {}
): Promise<CrmSearchAdminActor> {
  const dependencies: FreshCrmSearchAdminDependencies = {
    getAuthenticatedSession: overrides.getAuthenticatedSession
      ?? (overrides.getAuthenticatedActorId
        ? async event => ({
            actorId: await overrides.getAuthenticatedActorId!(event),
            issuedAt: new Date().toISOString()
          })
        : defaults.getAuthenticatedSession),
    getAuthenticatedActorId: overrides.getAuthenticatedActorId,
    loadFreshAuthority: overrides.loadFreshAuthority ?? defaults.loadFreshAuthority,
    execute: overrides.execute ?? defaults.execute
  }
  const session = await dependencies.getAuthenticatedSession(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized - Staff session required' })
  }
  if (!Number.isFinite(Date.parse(session.issuedAt))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized - Invalid session issuance' })
  }
  const actorId = session.actorId
  const authority = await dependencies.loadFreshAuthority(actorId)
  const invalidatedAt = authority?.sessionsInvalidatedAt
  if (invalidatedAt && (!Number.isFinite(Date.parse(invalidatedAt))
    || Date.parse(session.issuedAt) < Date.parse(invalidatedAt))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized - Session invalidated' })
  }
  if (!authority || authority.actorId !== actorId || authority.active === false
    || !authority.permissions.includes('ADMIN')) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Fresh ADMIN authority required' })
  }
  return Object.freeze({
    actorId: authority.actorId,
    orgId: authority.orgId,
    permissions: Object.freeze([...authority.permissions]),
    authorityRevision: authority.authorityRevision
  })
}

interface AuditedCommandInput {
  event: H3Event
  command: string
  reason: string
  expectedRevision: number
  confirmation: string
  getAuthenticatedActorId?: FreshCrmSearchAdminDependencies['getAuthenticatedActorId']
  getAuthenticatedSession?: FreshCrmSearchAdminDependencies['getAuthenticatedSession']
  loadFreshAuthority?: FreshCrmSearchAdminDependencies['loadFreshAuthority']
  runTransaction<T>(work: () => Promise<T>): Promise<T>
  mutate(input: Record<string, unknown>): Promise<{ revision: number }>
  appendAudit(input: Record<string, unknown>): Promise<{ auditId: string }>
}

export async function runAuditedCrmSearchCommand(input: AuditedCommandInput) {
  const actor = await requireFreshCrmSearchAdmin(input.event, {
    getAuthenticatedActorId: input.getAuthenticatedActorId,
    getAuthenticatedSession: input.getAuthenticatedSession,
    loadFreshAuthority: input.loadFreshAuthority
  })
  return await input.runTransaction(async () => {
    const mutation = await input.mutate({
      actorId: actor.actorId,
      orgId: actor.orgId,
      expectedRevision: input.expectedRevision,
      reason: input.reason,
      confirmation: input.confirmation
    })
    const audit = await input.appendAudit({
      actorId: actor.actorId,
      orgId: actor.orgId,
      command: input.command,
      reason: input.reason,
      beforeRevision: input.expectedRevision,
      afterRevision: mutation.revision
    })
    return { ...mutation, ...audit }
  })
}
