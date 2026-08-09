import { describe, expect, it, vi } from 'vitest'
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
  })
})
