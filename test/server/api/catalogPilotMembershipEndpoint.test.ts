import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogPilotMembershipError } from '~~/server/utils/ai/governance/catalogPilotMembership'

const RELEASE_ID = '10000000-0000-4000-8000-000000000001'
const MEMBER_ID = '30000000-0000-4000-8000-000000000001'
const ACTOR_ID = '40000000-0000-4000-8000-000000000001'

const { createCatalogPilotMembershipGetHandler } = await import(
  '~~/server/api/admin/ai/governance/releases/[id]/pilots.get'
)
const { createCatalogPilotMembershipPostHandler } = await import(
  '~~/server/api/admin/ai/governance/releases/[id]/pilots.post'
)
const { createCatalogPilotMembershipDeleteHandler } = await import(
  '~~/server/api/admin/ai/governance/releases/[id]/pilots.delete'
)

const body = (overrides: Record<string, unknown> = {}) => ({
  kind: 'pack',
  memberUserId: MEMBER_ID,
  reason: 'Approved bounded pilot cohort.',
  ...overrides
})

describe('admin catalog pilot membership endpoints', () => {
  const requirePermission = vi.fn()
  const requireWriteAccess = vi.fn()
  const getRouterParam = vi.fn()
  const getQuery = vi.fn()
  const readBody = vi.fn()
  const setResponseHeader = vi.fn()
  const listMemberships = vi.fn()
  const enrollMember = vi.fn()
  const revokeMember = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    requireWriteAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    getRouterParam.mockReturnValue(RELEASE_ID)
    getQuery.mockReturnValue({ kind: 'pack' })
    readBody.mockResolvedValue(body())
    listMemberships.mockResolvedValue({ release: { id: RELEASE_ID }, memberships: [] })
    enrollMember.mockResolvedValue({ created: true, membership: { memberUserId: MEMBER_ID } })
    revokeMember.mockResolvedValue({ removed: true, membership: { memberUserId: MEMBER_ID } })
  })

  it('lists a bounded release cohort for administrators without caching', async () => {
    const event = { context: {} } as never
    const handler = createCatalogPilotMembershipGetHandler({
      requirePermission,
      getRouterParam,
      getQuery,
      setResponseHeader,
      listMemberships
    })

    await expect(handler(event)).resolves.toEqual({ release: { id: RELEASE_ID }, memberships: [] })
    expect(requirePermission).toHaveBeenCalledWith(event, 'ADMIN')
    expect(listMemberships).toHaveBeenCalledWith({ kind: 'pack', releaseId: RELEASE_ID })
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
  })

  it('enrolls only after admin permission and current-session write access agree', async () => {
    const event = { context: {} } as never
    const handler = createCatalogPilotMembershipPostHandler({
      requirePermission,
      requireWriteAccess,
      getRouterParam,
      readBody,
      enrollMember
    })

    await expect(handler(event)).resolves.toMatchObject({ created: true })
    expect(enrollMember).toHaveBeenCalledWith({
      kind: 'pack',
      releaseId: RELEASE_ID,
      memberUserId: MEMBER_ID,
      actorUserId: ACTOR_ID,
      reason: 'Approved bounded pilot cohort.'
    })
  })

  it('revokes the exact release/member assignment through the same write boundary', async () => {
    const handler = createCatalogPilotMembershipDeleteHandler({
      requirePermission,
      requireWriteAccess,
      getRouterParam,
      readBody,
      revokeMember
    })

    await expect(handler({ context: {} } as never)).resolves.toMatchObject({ removed: true })
    expect(revokeMember).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'pack',
      releaseId: RELEASE_ID,
      memberUserId: MEMBER_ID,
      actorUserId: ACTOR_ID
    }))
  })

  it.each([
    ['invalid release id', 'post', body(), 'not-a-uuid'],
    ['unknown field', 'post', body({ activate: true }), RELEASE_ID],
    ['invalid member', 'delete', body({ memberUserId: 'not-a-uuid' }), RELEASE_ID],
    ['empty reason', 'delete', body({ reason: '   ' }), RELEASE_ID]
  ])('rejects malformed input: %s', async (_label, method, invalidBody, releaseId) => {
    getRouterParam.mockReturnValue(releaseId)
    readBody.mockResolvedValue(invalidBody)
    const dependencies = {
      requirePermission,
      requireWriteAccess,
      getRouterParam,
      readBody,
      enrollMember,
      revokeMember
    }
    const handler = method === 'post'
      ? createCatalogPilotMembershipPostHandler(dependencies)
      : createCatalogPilotMembershipDeleteHandler(dependencies)

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 422,
      data: { code: 'invalid_request' }
    })
    expect(enrollMember).not.toHaveBeenCalled()
    expect(revokeMember).not.toHaveBeenCalled()
  })

  it('does not parse or mutate when governance permission or write access is denied', async () => {
    requirePermission.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    const deniedPermission = createCatalogPilotMembershipPostHandler({
      requirePermission,
      requireWriteAccess,
      getRouterParam,
      readBody,
      enrollMember
    })
    await expect(deniedPermission({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(requireWriteAccess).not.toHaveBeenCalled()
    expect(readBody).not.toHaveBeenCalled()

    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: ACTOR_ID })
    requireWriteAccess.mockRejectedValue(Object.assign(new Error('Read-only'), { statusCode: 403 }))
    const deniedWrite = createCatalogPilotMembershipPostHandler({
      requirePermission,
      requireWriteAccess,
      getRouterParam,
      readBody,
      enrollMember
    })
    await expect(deniedWrite({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(readBody).not.toHaveBeenCalled()
  })

  it('maps stable governance errors without leaking database details', async () => {
    enrollMember.mockRejectedValue(new CatalogPilotMembershipError(
      'pilot_member_ineligible',
      422,
      'Pilot member must be an active member of the release department'
    ))
    const handler = createCatalogPilotMembershipPostHandler({
      requirePermission,
      requireWriteAccess,
      getRouterParam,
      readBody,
      enrollMember
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 422,
      data: { code: 'pilot_member_ineligible' }
    })
  })
})
