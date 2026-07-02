import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
  params?: Record<string, string>
  body?: unknown
}
interface TestGlobal {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
type TestHandler<T = unknown> = (event: TestEvent) => Promise<T>
type TransactionCallback = (db: { query: ReturnType<typeof vi.fn> }) => unknown | Promise<unknown>

const g = globalThis as typeof globalThis & TestGlobal
g.defineEventHandler = <T>(fn: T) => fn
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
const mockCreateNotification = vi.fn()
const mockCreateBulk = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockRequireAllSocialClientAccess = vi.fn()
const mockStartSocialPublishingWorkflow = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireRole: (...a: unknown[]) => mockRequireRole(...a)
}))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'], MANAGEMENT: ['owner', 'admin'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  execute: (...a: unknown[]) => mockExecute(...a),
  transaction: (...a: unknown[]) => mockTransaction(...a)
}))
vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...a: unknown[]) => mockCreateNotification(...a),
  createBulkNotifications: (...a: unknown[]) => mockCreateBulk(...a)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a),
  requireAllSocialClientAccess: (...a: unknown[]) => mockRequireAllSocialClientAccess(...a),
  requireSocialClientScope: (event: unknown, clientId?: string) =>
    clientId
      ? mockRequireSocialClientAccess(event, clientId)
      : mockRequireAllSocialClientAccess(event)
}))
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  startSocialPublishingWorkflow: (...a: unknown[]) => mockStartSocialPublishingWorkflow(...a)
}))

const { nextOptimalSlots } = await import('../../server/utils/socialSlots')
const { default: slotsPost } = await import('../../server/api/agency/social/publishing/slots/index.post')
const { default: queueReorder } = await import('../../server/api/agency/social/publishing/queue/reorder.post')
const { default: requestApproval } = await import('../../server/api/agency/social/publishing/posts/[id]/request-approval.post')
const { default: approve } = await import('../../server/api/agency/social/publishing/posts/[id]/approve.post')
const { default: reject } = await import('../../server/api/agency/social/publishing/posts/[id]/reject.post')
const { default: schedule } = await import('../../server/api/agency/social/publishing/posts/[id]/schedule.post')
const { default: approvalsBadge } = await import('../../server/api/agency/social/publishing/approvals/badge.get')
const slotsPostH = slotsPost as TestHandler
const queueReorderH = queueReorder as TestHandler
const requestApprovalH = requestApproval as TestHandler
const approveH = approve as TestHandler
const rejectH = reject as TestHandler
const scheduleH = schedule as TestHandler
const approvalsBadgeH = approvalsBadge as TestHandler

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'U1' })
  mockRequireRole.mockResolvedValue({ id: 'U1' })
  mockQueryRows.mockResolvedValue([])
  mockQueryOne.mockResolvedValue({ id: 'P1' })
  mockExecute.mockResolvedValue(1)
  mockTransaction.mockImplementation(async (cb: TransactionCallback) => cb({ query: vi.fn() }))
  mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  mockRequireAllSocialClientAccess.mockResolvedValue({ id: 'U1' })
  mockStartSocialPublishingWorkflow.mockResolvedValue({ ok: false, enabled: false, reason: 'disabled' })
})

describe('nextOptimalSlots', () => {
  it('returns N future slots on the configured weekday, ascending', async () => {
    // Tuesday (2) 09:00 Sydney slot, weekly.
    mockQueryRows.mockResolvedValueOnce([
      { day_of_week: 2, time_of_day: '09:00:00', timezone: 'Australia/Sydney', capacity: 1 }
    ])
    const from = new Date('2026-06-01T00:00:00Z') // a Monday
    const slots = await nextOptimalSlots('C1', 3, from)
    expect(slots).toHaveLength(3)
    // each strictly after `from`, ascending, and ~7 days apart
    expect(slots[0].getTime()).toBeGreaterThan(from.getTime())
    expect(slots[1].getTime()).toBeGreaterThan(slots[0].getTime())
    // Sydney Tuesday 09:00 in June (AEST, UTC+10) → 23:00 UTC Monday
    expect(slots[0].toISOString()).toBe('2026-06-01T23:00:00.000Z')
    expect(slots[1].toISOString()).toBe('2026-06-08T23:00:00.000Z')
  })

  it('returns [] when the client has no slots', async () => {
    mockQueryRows.mockResolvedValueOnce([])
    expect(await nextOptimalSlots('C1', 3)).toEqual([])
  })
})

describe('slots create', () => {
  it('requires dayOfWeek + timeOfDay', async () => {
    await expect(slotsPostH({ body: { clientId: 'C1' } })).rejects.toThrow('dayOfWeek and timeOfDay required')
  })
  it('inserts a slot', async () => {
    await slotsPostH({ body: { clientId: 'C1', dayOfWeek: 2, timeOfDay: '09:00' } })
    expect(mockQueryOne).toHaveBeenCalled()
  })
})

describe('queue reorder', () => {
  it('writes queue_position per index inside a transaction', async () => {
    const inner = vi.fn()
    mockTransaction.mockImplementationOnce(async (cb: TransactionCallback) => cb({ query: inner }))
    const res = await queueReorderH({ body: { clientId: 'C1', orderedIds: ['a', 'b', 'c'] } })
    expect(res).toEqual({ ok: true, count: 3 })
    expect(inner).toHaveBeenCalledTimes(3)
    expect(inner.mock.calls[0][1]).toEqual([0, 'a', 'C1'])
    expect(inner.mock.calls[2][1]).toEqual([2, 'c', 'C1'])
  })
  it('rejects empty orderedIds', async () => {
    await expect(queueReorderH({ body: { clientId: 'C1', orderedIds: [] } })).rejects.toThrow('orderedIds required')
  })
})

describe('approval workflow', () => {
  it('request-approval notifies managers (excluding the requester)', async () => {
    const event: TestEvent = { params: { id: 'P1' } }
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
      .mockResolvedValueOnce({ id: 'P1', content: 'hi', client_id: 'C1' })
    mockQueryRows.mockResolvedValueOnce([{ id: 'U1' }, { id: 'MGR' }]) // U1 is requester, excluded
    await requestApprovalH(event)
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(mockQueryOne.mock.calls[1][0]).toContain('WHERE id = $1 AND client_id = $3')
    expect(mockCreateBulk).toHaveBeenCalledOnce()
    expect(mockCreateBulk.mock.calls[0][0]).toEqual(['MGR'])
    expect(mockCreateBulk.mock.calls[0][1].type).toBe('approval_requested')
  })

  it('approve sets approved + notifies requester', async () => {
    const event: TestEvent = { params: { id: 'P1' } }
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
      .mockResolvedValueOnce({ id: 'P1', content: 'hi', approval_requested_by: 'REQ' })
    await approveH(event)
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    const sql = mockQueryOne.mock.calls[1][0] as string
    expect(sql).toMatch(/status = CASE/)
    expect(sql).toMatch(/scheduled_at IS NOT NULL/)
    expect(sql).toContain('WHERE id = $1 AND client_id = $3')
    expect(mockCreateNotification).toHaveBeenCalledOnce()
    expect(mockCreateNotification.mock.calls[0][0].userId).toBe('REQ')
    expect(mockStartSocialPublishingWorkflow).not.toHaveBeenCalled()
  })

  it('approve starts the publishing workflow when a future scheduled post becomes scheduled', async () => {
    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString()
    const event: TestEvent = { params: { id: 'P1' } }
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
      .mockResolvedValueOnce({
        id: 'P1',
        content: 'hi',
        approval_requested_by: null,
        status: 'scheduled',
        scheduled_at: scheduledAt
      })

    await approveH(event)

    expect(mockStartSocialPublishingWorkflow).toHaveBeenCalledWith(event, {
      postId: 'P1',
      clientId: 'C1',
      scheduledAt,
      trigger: 'schedule',
      requestedBy: 'U1'
    })
  })

  it('schedule marks approved posts as scheduled with a future datetime', async () => {
    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString()
    const event: TestEvent = { params: { id: 'P1' }, body: { scheduledAt, timezone: 'Australia/Melbourne' } }
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'approved' })
      .mockResolvedValueOnce({ id: 'P1', status: 'scheduled', scheduled_at: scheduledAt })
    const res = await scheduleH(event)
    expect(res).toEqual({ id: 'P1', status: 'scheduled', scheduled_at: scheduledAt })
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    const [sql, params] = mockQueryOne.mock.calls[1]
    expect(sql).toMatch(/status = 'scheduled'/)
    expect(sql).toContain('status IN (\'approved\',\'scheduled\')')
    expect(params).toEqual(['P1', scheduledAt, 'Australia/Melbourne', 'C1'])
    expect(mockStartSocialPublishingWorkflow).toHaveBeenCalledWith(event, {
      postId: 'P1',
      clientId: 'C1',
      scheduledAt,
      trigger: 'schedule',
      requestedBy: 'U1'
    })
  })

  it('schedule still succeeds when workflow kickoff is not configured', async () => {
    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString()
    const event: TestEvent = { params: { id: 'P1' }, body: { scheduledAt } }
    mockStartSocialPublishingWorkflow.mockResolvedValueOnce({ ok: false, enabled: true, reason: 'not_configured' })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'approved' })
      .mockResolvedValueOnce({ id: 'P1', status: 'scheduled', scheduled_at: scheduledAt })

    const res = await scheduleH(event)

    expect(res).toEqual({ id: 'P1', status: 'scheduled', scheduled_at: scheduledAt })
    expect(mockStartSocialPublishingWorkflow).toHaveBeenCalledOnce()
  })

  it('schedule rejects drafts and invalid scheduledAt values', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'draft' })
    await expect(scheduleH({ params: { id: 'P1' }, body: { scheduledAt: new Date(Date.now() + 86_400_000).toISOString() } }))
      .rejects.toThrow('approved before scheduling')

    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'approved' })
    await expect(scheduleH({ params: { id: 'P1' }, body: { scheduledAt: 'tomorrow' } }))
      .rejects.toThrow('scheduledAt must be a valid ISO datetime')

    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'approved' })
    await expect(scheduleH({ params: { id: 'P1' }, body: { scheduledAt: '2020-01-01T00:00:00.000Z' } }))
      .rejects.toThrow('scheduledAt must be in the future')
  })

  it('reject sets draft + reason + notifies requester', async () => {
    const event: TestEvent = { params: { id: 'P1' }, body: { reason: 'fix the copy' } }
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
      .mockResolvedValueOnce({ id: 'P1', content: 'hi', approval_requested_by: 'REQ' })
    await rejectH(event)
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    const [sql, params] = mockQueryOne.mock.calls[1]
    expect(sql).toMatch(/status = 'draft'/)
    expect(sql).toMatch(/approval_requested_at = NULL/)
    expect(sql).toMatch(/approval_requested_by = NULL/)
    expect(sql).toContain('WHERE id = $1 AND client_id = $3')
    expect(sql).toContain('p.client_id = $3')
    expect(params[1]).toBe('fix the copy')
    expect(mockCreateNotification.mock.calls[0][0].message).toContain('fix the copy')
  })

  it('badge returns the pending count', async () => {
    mockQueryOne.mockResolvedValueOnce({ count: 4 })
    expect(await approvalsBadgeH({ query: {} })).toEqual({ count: 4 })
    expect(mockRequireAllSocialClientAccess).toHaveBeenCalledWith(expect.anything())
  })
})
