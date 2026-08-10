import { createError, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { PERMISSION_GROUPS, SYSTEM_ROLE_PERMISSIONS } from '~~/server/utils/permissions'
import type { CrmSearchAdminActor } from './contracts'

interface FreshActorRow {
  id: string
  role: string
  custom_role_id: string | null
}

interface FreshScopeRow {
  organisation_scope_id: string
  control_revision: number
}

export interface FreshCrmSearchAdminDependencies {
  getAuthenticatedActorId(event: H3Event): Promise<string>
  loadFreshAuthority(actorId: string): Promise<(CrmSearchAdminActor & { active?: boolean }) | null>
  execute?: (...args: unknown[]) => unknown
}

async function loadDefaultFreshAuthority(actorId: string): Promise<CrmSearchAdminActor | null> {
  const actor = await queryOneFresh<FreshActorRow>(`
    SELECT actor.id::TEXT AS id,
           actor.user_role::TEXT AS role,
           actor.custom_role_id::TEXT AS custom_role_id
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
    authorityRevision: `${actor.role}:${actor.custom_role_id ?? 'system'}:${scope.control_revision}`
  }
}

const defaults: FreshCrmSearchAdminDependencies = {
  async getAuthenticatedActorId(event) {
    return (await requireAuth(event)).id
  },
  loadFreshAuthority: loadDefaultFreshAuthority
}

export async function requireFreshCrmSearchAdmin(
  event: H3Event,
  overrides: Partial<FreshCrmSearchAdminDependencies> = {}
): Promise<CrmSearchAdminActor> {
  const dependencies: FreshCrmSearchAdminDependencies = {
    getAuthenticatedActorId: overrides.getAuthenticatedActorId ?? defaults.getAuthenticatedActorId,
    loadFreshAuthority: overrides.loadFreshAuthority ?? defaults.loadFreshAuthority,
    execute: overrides.execute ?? defaults.execute
  }
  const actorId = await dependencies.getAuthenticatedActorId(event)
  const authority = await dependencies.loadFreshAuthority(actorId)
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
  loadFreshAuthority?: FreshCrmSearchAdminDependencies['loadFreshAuthority']
  runTransaction<T>(work: () => Promise<T>): Promise<T>
  mutate(input: Record<string, unknown>): Promise<{ revision: number }>
  appendAudit(input: Record<string, unknown>): Promise<{ auditId: string }>
}

export async function runAuditedCrmSearchCommand(input: AuditedCommandInput) {
  const actor = await requireFreshCrmSearchAdmin(input.event, {
    getAuthenticatedActorId: input.getAuthenticatedActorId,
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
