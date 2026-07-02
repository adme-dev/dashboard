import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
  params?: Record<string, string>
  body?: unknown
}
type TestGlobal = typeof globalThis & {
  defineEventHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

const g = globalThis as TestGlobal
g.defineEventHandler = fn => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: { statusCode: number, statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireAuth = vi.fn()
const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockTransaction = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockRequireAllSocialClientAccess = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireRole: (...a: unknown[]) => mockRequireRole(...a)
}))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  execute: (...a: unknown[]) => mockExecute(...a),
  transaction: (...a: unknown[]) => mockTransaction(...a)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a),
  requireAllSocialClientAccess: (...a: unknown[]) => mockRequireAllSocialClientAccess(...a),
  requireSocialClientScope: (event: unknown, clientId?: string) =>
    clientId
      ? mockRequireSocialClientAccess(event, clientId)
      : mockRequireAllSocialClientAccess(event)
}))
vi.mock('~~/server/utils/socialPublishing/plannerGate', () => ({
  isPlannerEnabled: () => true,
  isPlannerAiEnabled: () => true
}))

const { default: boardH } = await import('../../server/api/agency/social/publishing/board.get')
const { default: queueListH } = await import('../../server/api/agency/social/publishing/queue/index.get')
const { default: queueFillH } = await import('../../server/api/agency/social/publishing/queue/fill.post')
const { default: queueReorderH } = await import('../../server/api/agency/social/publishing/queue/reorder.post')
const { default: slotsListH } = await import('../../server/api/agency/social/publishing/slots/index.get')
const { default: slotsCreateH } = await import('../../server/api/agency/social/publishing/slots/index.post')
const { default: slotsPatchH } = await import('../../server/api/agency/social/publishing/slots/[id]/index.patch')
const { default: slotsDeleteH } = await import('../../server/api/agency/social/publishing/slots/[id]/index.delete')
const { default: campaignsListH } = await import('../../server/api/agency/social/publishing/campaigns/index.get')
const { default: campaignsCreateH } = await import('../../server/api/agency/social/publishing/campaigns/index.post')
const { default: campaignsPatchH } = await import('../../server/api/agency/social/publishing/campaigns/[id]/index.patch')
const { default: campaignsDeleteH } = await import('../../server/api/agency/social/publishing/campaigns/[id]/index.delete')
const { default: approvalsListH } = await import('../../server/api/agency/social/publishing/approvals/index.get')
const { default: approvalsBadgeH } = await import('../../server/api/agency/social/publishing/approvals/badge.get')
const { default: navCountsH } = await import('../../server/api/agency/social/publishing/nav-counts.get')

function event(input: TestEvent) {
  return input as never
}

describe('social publishing client-scoped routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'U1' })
    mockRequireRole.mockResolvedValue({ id: 'U1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({ count: 0 })
    mockExecute.mockResolvedValue(1)
    mockTransaction.mockImplementation(async (cb: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => cb({ query: vi.fn() }))
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
    mockRequireAllSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it.each([
    ['board', () => boardH(event({ query: { clientId: 'C1' } }))],
    ['queue list', () => queueListH(event({ query: { clientId: 'C1' } }))],
    ['queue fill', () => queueFillH(event({ body: { clientId: 'C1' } }))],
    ['queue reorder', () => queueReorderH(event({ body: { clientId: 'C1', orderedIds: ['P1'] } }))],
    ['slots list', () => slotsListH(event({ query: { clientId: 'C1' } }))],
    ['slots create', () => slotsCreateH(event({ body: { clientId: 'C1', dayOfWeek: 2, timeOfDay: '09:00' } }))],
    ['campaigns list', () => campaignsListH(event({ query: { clientId: 'C1' } }))],
    ['campaigns create', () => campaignsCreateH(event({ body: { clientId: 'C1', name: 'Launch' } }))],
    ['approvals list', () => approvalsListH(event({ query: { clientId: 'C1' } }))],
    ['approvals badge', () => approvalsBadgeH(event({ query: { clientId: 'C1' } }))],
    ['nav counts', () => navCountsH(event({ query: { clientId: 'C1' } }))]
  ])('%s requires access to the requested client', async (_name, run) => {
    await run()
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
  })

  it.each([
    ['approvals list', () => approvalsListH(event({ query: {} }))],
    ['approvals badge', () => approvalsBadgeH(event({ query: {} }))],
    ['nav counts', () => navCountsH(event({ query: {} }))]
  ])('%s requires all-client access when no clientId is supplied', async (_name, run) => {
    await run()
    expect(mockRequireAllSocialClientAccess).toHaveBeenCalledWith(expect.anything())
  })

  it('scopes slot patch by the slot client', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'S1', client_id: 'C1' })
      .mockResolvedValueOnce({ id: 'S1', client_id: 'C1' })

    await slotsPatchH(event({ params: { id: 'S1' }, body: { name: 'Morning' } }))

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
    const [sql, params] = mockQueryOne.mock.calls[1]
    expect(sql).toContain('WHERE id = $2 AND client_id = $3')
    expect(params).toEqual(['Morning', 'S1', 'C1'])
  })

  it('scopes slot delete by the slot client', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'S1', client_id: 'C1' })

    await slotsDeleteH(event({ params: { id: 'S1' } }))

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
    expect(mockExecute).toHaveBeenCalledWith(
      'DELETE FROM social_slot_schedules WHERE id = $1 AND client_id = $2',
      ['S1', 'C1']
    )
  })

  it('scopes campaign patch by the campaign client', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'CMP1', client_id: 'C1' })
      .mockResolvedValueOnce({ id: 'CMP1', client_id: 'C1' })

    await campaignsPatchH(event({ params: { id: 'CMP1' }, body: { name: 'Launch' } }))

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
    const [sql, params] = mockQueryOne.mock.calls[1]
    expect(sql).toContain('WHERE id = $2 AND client_id = $3')
    expect(params).toEqual(['Launch', 'CMP1', 'C1'])
  })

  it('scopes campaign delete by the campaign client', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'CMP1', client_id: 'C1' })

    await campaignsDeleteH(event({ params: { id: 'CMP1' } }))

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
    expect(mockExecute).toHaveBeenCalledWith(
      'DELETE FROM social_campaigns WHERE id = $1 AND client_id = $2',
      ['CMP1', 'C1']
    )
  })
})
