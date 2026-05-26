import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings/[meetingId]/action-items.get'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1' } }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/meetings/:meetingId/action-items', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('lists structured meeting action items for office members', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
    mockQueryRows.mockResolvedValueOnce([
      { id: 'action-1', content: 'Send recap', status: 'open' }
    ])

    const result = await handler(fakeEvent())

    expect(result.actionItems).toEqual([
      { id: 'action-1', content: 'Send recap', status: 'open' }
    ])
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('office_meeting_action_items')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['office-1', 'meeting-1'])
  })

  it('rejects non-members', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })

    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
