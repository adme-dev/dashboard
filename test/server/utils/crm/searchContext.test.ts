import { describe, expect, it, vi } from 'vitest'

const {
  queryOneFresh,
  queryRowsFresh,
  queryOne,
  queryRows,
  requireAuth,
  digestPortalSessionToken
} = vi.hoisted(() => ({
  queryOneFresh: vi.fn(),
  queryRowsFresh: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  requireAuth: vi.fn(),
  digestPortalSessionToken: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh,
  queryRowsFresh,
  queryOne,
  queryRows
}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth }))
vi.mock('~~/server/utils/portalSession', () => ({ digestPortalSessionToken }))
import {
  resolveAgencyAiCrmContext,
  resolveAgencyCrmSearchContext,
  resolvePortalCrmSearchContext,
  type CrmSearchContextDependencies
} from '~~/server/utils/crm/searchContext'

const clientId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'
const portalUserId = '33333333-3333-4333-8333-333333333333'

const fakeEvent = () => ({ context: {} }) as never

function fakeAgencyContextDeps(overrides: Partial<CrmSearchContextDependencies> = {}): CrmSearchContextDependencies {
  return {
    resolveAgencyActorId: vi.fn().mockResolvedValue(actorId),
    loadAgencyActor: vi.fn().mockResolvedValue({ id: actorId, role: 'account_manager', customRoleId: null }),
    loadPermissionSet: vi.fn().mockResolvedValue(['CLIENTS']),
    loadClient: vi.fn().mockResolvedValue({ id: clientId, name: 'Acme', recordVisibility: 'team' }),
    loadAgencyAssignment: vi.fn().mockResolvedValue(true),
    loadAssistantAssignments: vi.fn().mockResolvedValue({ clientIds: [clientId], sourceRevision: 'assignment-revision' }),
    loadPortalSession: vi.fn(),
    loadPortalEntitlement: vi.fn().mockResolvedValue(true),
    createCorrelationId: vi.fn().mockReturnValue('server-generated-correlation-id'),
    runKeyword: vi.fn(),
    ...overrides
  }
}

describe('CRM search context', () => {
  it('uses only fresh DB helpers for the default agency resolver and enforces active actor, client, membership, and custom-role predicates', async () => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue({ id: actorId })
    queryRowsFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('role_permission_groups')) {
        return sql.includes('role.id = $1') && params[0] === 'custom-role-1'
          ? [{ permission_group: 'CLIENTS' }]
          : []
      }
      return []
    })
    queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM team_members')) {
        return sql.includes('is_active = TRUE') && params[0] === actorId
          ? { id: actorId, role: 'custom', custom_role_id: 'custom-role-1' }
          : null
      }
      if (sql.includes('FROM agency_clients client')) {
        return sql.includes('client.is_active = TRUE') && params[0] === clientId
          ? { id: clientId, name: 'Acme', record_visibility: 'owner' }
          : null
      }
      if (sql.includes('FROM client_team_assignments')) {
        return sql.includes('client.is_active = TRUE') && params[0] === actorId && params[1] === clientId
          ? { '?column?': 1 }
          : null
      }
      return null
    })

    const context = await resolveAgencyCrmSearchContext(fakeEvent(), { clientId, surface: 'agency_global' })

    expect(context).toMatchObject({ actorId, permissionSet: ['CLIENTS'], visibility: { ownerScoped: true } })
    expect(queryOneFresh).toHaveBeenCalled()
    expect(queryRowsFresh).toHaveBeenCalled()
    expect(queryOne).not.toHaveBeenCalled()
    expect(queryRows).not.toHaveBeenCalled()
  })

  it('uses only fresh DB helpers for the default portal resolver and rejects a query missing active session, portal-user, client, entitlement, or CRM-view predicates', async () => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { getCookie: ReturnType<typeof vi.fn> }).getCookie = vi.fn(() => 'portal-token')
    digestPortalSessionToken.mockResolvedValue('session-digest')
    queryRowsFresh.mockResolvedValue([])
    queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM client_sessions session')) {
        const requiresFreshPortalAuthority = [
          'session.expires_at > NOW()',
          "portal_user.status = 'active'",
          'client.is_active = TRUE'
        ].every(predicate => sql.includes(predicate))
        return requiresFreshPortalAuthority && params[0] === 'session-digest'
          ? {
              id: portalUserId,
              client_id: clientId,
              client_name: 'Acme',
              lead_capture_mode: 'full_crm',
              is_primary_contact: false,
              can_view_crm: true,
              can_edit_crm: false,
              can_admin_crm: false,
              record_visibility: 'team'
            }
          : null
      }
      if (sql.includes('client_entitlement_overrides')) {
        const requiresEntitlementPolicy = sql.includes("feature_key = 'crm.core'")
          && sql.includes('starts_at <= NOW()')
          && sql.includes('expires_at IS NULL OR expires_at > NOW()')
        return requiresEntitlementPolicy && params[0] === clientId ? { status: 'active' } : null
      }
      return null
    })

    await expect(resolvePortalCrmSearchContext(fakeEvent(), { surface: 'portal_global' }))
      .resolves.toMatchObject({ actorId: portalUserId, actorType: 'portal', clientId })
    expect(queryOneFresh).toHaveBeenCalledTimes(2)
    expect(queryRowsFresh).not.toHaveBeenCalled()
    expect(queryOne).not.toHaveBeenCalled()
    expect(queryRows).not.toHaveBeenCalled()

    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { getCookie: ReturnType<typeof vi.fn> }).getCookie = vi.fn(() => 'portal-token')
    digestPortalSessionToken.mockResolvedValue('session-digest')
    queryOneFresh.mockImplementation(async (sql: string) => sql.includes('FROM client_sessions session')
      ? {
          id: portalUserId,
          client_id: clientId,
          client_name: 'Acme',
          lead_capture_mode: 'full_crm',
          is_primary_contact: false,
          can_view_crm: false,
          can_edit_crm: false,
          can_admin_crm: false,
          record_visibility: 'team'
        }
      : null)

    await expect(resolvePortalCrmSearchContext(fakeEvent(), { surface: 'portal_global' }))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Client not found' })
    expect(queryOneFresh).toHaveBeenCalledOnce()
    expect(queryOne).not.toHaveBeenCalled()
    expect(queryRows).not.toHaveBeenCalled()
  })

  it('returns the same denial for a missing and inaccessible client before retrieval', async () => {
    const missing = fakeAgencyContextDeps({ loadClient: vi.fn().mockResolvedValue(null) })
    const inaccessible = fakeAgencyContextDeps({ loadAgencyAssignment: vi.fn().mockResolvedValue(false) })

    for (const deps of [missing, inaccessible]) {
      await expect(resolveAgencyCrmSearchContext(fakeEvent(), {
        clientId,
        surface: 'agency_global',
        correlationId: 'caller-controlled'
      }, deps)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Client not found' })
      expect(deps.runKeyword).not.toHaveBeenCalled()
      expect(deps.createCorrelationId).toHaveBeenCalledOnce()
    }
  })

  it('uses fresh server-owned permissions and ignores caller-supplied identity and correlation claims', async () => {
    const deps = fakeAgencyContextDeps()
    const context = await resolveAgencyCrmSearchContext(fakeEvent(), {
      clientId,
      surface: 'agency_global',
      correlationId: 'caller-controlled',
      actorId: 'caller-controlled'
    }, deps)

    expect(context).toMatchObject({
      organisationScopeId: clientId,
      clientId,
      actorType: 'staff',
      actorId,
      correlationId: 'server-generated-correlation-id',
      permissionSet: ['CLIENTS'],
      visibility: { ownerScoped: false }
    })
    expect(deps.resolveAgencyActorId).toHaveBeenCalledWith(expect.anything())
    expect(deps.loadAgencyActor).toHaveBeenCalledWith(actorId)
  })

  it('sets owner visibility only after the fresh client and role policy checks pass', async () => {
    const deps = fakeAgencyContextDeps({
      loadClient: vi.fn().mockResolvedValue({ id: clientId, name: 'Acme', recordVisibility: 'owner' })
    })

    await expect(resolveAgencyCrmSearchContext(fakeEvent(), { clientId, surface: 'agency_global' }, deps))
      .resolves.toMatchObject({ visibility: { ownerScoped: true } })
  })

  it('denies an inactive portal session/client or a portal user without CRM view access before retrieval', async () => {
    const deniedSession = fakeAgencyContextDeps({ loadPortalSession: vi.fn().mockResolvedValue(null) })
    const deniedPermission = fakeAgencyContextDeps({
      loadPortalSession: vi.fn().mockResolvedValue({
        id: portalUserId,
        clientId,
        clientName: 'Acme',
        leadCaptureMode: 'full_crm',
        isPrimaryContact: false,
        canViewCrm: false,
        canEditCrm: false,
        canAdminCrm: false,
        recordVisibility: 'team'
      })
    })

    for (const deps of [deniedSession, deniedPermission]) {
      await expect(resolvePortalCrmSearchContext(fakeEvent(), { surface: 'portal_global' }, deps))
        .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Client not found' })
      expect(deps.runKeyword).not.toHaveBeenCalled()
      expect(deps.createCorrelationId).toHaveBeenCalledOnce()
    }
  })

  it('returns an explicit ambiguity result for an AI client-name match and never executes retrieval', async () => {
    const deps = fakeAgencyContextDeps({
      findActiveClientsByName: vi.fn().mockResolvedValue([
        { id: clientId, name: 'Acme' },
        { id: '44444444-4444-4444-8444-444444444444', name: 'Acme' }
      ])
    })

    await expect(resolveAgencyAiCrmContext({ userId: actorId, userRole: 'owner', event: fakeEvent() }, {
      clientName: 'Acme',
      correlationId: 'caller-controlled'
    }, deps)).resolves.toEqual({ status: 'ambiguous' })
    expect(deps.runKeyword).not.toHaveBeenCalled()
    expect(deps.createCorrelationId).toHaveBeenCalledOnce()
  })

  it('uses fresh default authority for agency AI client-name resolution and intersects active assignments', async () => {
    vi.clearAllMocks()
    queryOne.mockRejectedValue(new Error('cached authority must not run'))
    queryRows.mockRejectedValue(new Error('cached authority must not run'))
    queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM team_members')) {
        return sql.includes('is_active = TRUE') && params[0] === actorId
          ? { id: actorId, role: 'custom', custom_role_id: 'custom-role-1' }
          : null
      }
      if (sql.includes('FROM agency_clients client')) {
        return sql.includes('client.is_active = TRUE') && params[0] === clientId
          ? { id: clientId, name: 'Acme', record_visibility: 'team' }
          : null
      }
      if (sql.includes('FROM client_team_assignments')) {
        return sql.includes('assignment.team_member_id = $1') && sql.includes('assignment.client_id = $2')
          && sql.includes('client.is_active = TRUE') && params[0] === actorId && params[1] === clientId
          ? { '?column?': 1 }
          : null
      }
      return null
    })
    queryRowsFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('role_permission_groups')) {
        return sql.includes('role.id = $1') && params[0] === 'custom-role-1'
          ? [{ permission_group: 'CLIENTS' }]
          : []
      }
      if (sql.includes('lower(name) = lower($1)')) {
        return sql.includes('is_active = TRUE') && params[0] === 'Acme'
          ? [{ id: clientId, name: 'Acme' }]
          : []
      }
      if (sql.includes('FROM client_team_assignments assignment')) {
        return sql.includes('assignment.team_member_id = $1') && sql.includes('client.is_active = TRUE')
          && params[0] === actorId
          ? [{ id: clientId, source_revision: 'assignment-revision' }]
          : []
      }
      return []
    })

    await expect(resolveAgencyAiCrmContext({ userId: actorId, event: fakeEvent() }, { clientName: 'Acme' }))
      .resolves.toMatchObject({ status: 'resolved', context: { actorId, clientId, surface: 'agency_ai', permissionSet: ['CLIENTS'] } })
    expect(queryOne).not.toHaveBeenCalled()
    expect(queryRows).not.toHaveBeenCalled()
  })

  it('keeps unresolved default agency-AI authority from reaching client or assignment work', async () => {
    vi.clearAllMocks()
    queryOne.mockRejectedValue(new Error('cached authority must not run'))
    queryRows.mockRejectedValue(new Error('cached authority must not run'))
    queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => sql.includes('FROM team_members')
      && sql.includes('is_active = TRUE') && params[0] === actorId
      ? { id: actorId, role: 'custom', custom_role_id: 'custom-role-without-clients' }
      : null)
    queryRowsFresh.mockImplementation(async (sql: string, params: unknown[]) => sql.includes('role_permission_groups')
      && sql.includes('role.id = $1') && params[0] === 'custom-role-without-clients'
      ? []
      : [])

    await expect(resolveAgencyAiCrmContext({ userId: actorId, event: fakeEvent() }, { clientName: 'Acme' }))
      .resolves.toEqual({ status: 'scope_unavailable' })
    expect(queryOneFresh).toHaveBeenCalledOnce()
    expect(queryRowsFresh).toHaveBeenCalledOnce()
    expect(queryOne).not.toHaveBeenCalled()
    expect(queryRows).not.toHaveBeenCalled()
  })
})
