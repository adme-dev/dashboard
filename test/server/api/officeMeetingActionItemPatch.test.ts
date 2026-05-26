import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
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
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1', actionItemId: 'action-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/meetings/:meetingId/action-items/:actionItemId', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('updates action lifecycle fields for office members', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'action-1',
        content: 'Send recap',
        status: 'done',
        assignee_user_id: '11111111-1111-4111-8111-111111111111',
        due_at: '2026-05-26T01:00:00.000Z'
      })

    const result = await handler(fakeEvent({
      status: 'done',
      assignee_user_id: '11111111-1111-4111-8111-111111111111',
      due_at: '2026-05-26T01:00:00.000Z',
      metadata: { source: 'manual' }
    }))

    expect(result.actionItem).toMatchObject({ id: 'action-1', status: 'done' })
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('UPDATE office_meeting_action_items')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      'action-1',
      'office-1',
      'meeting-1',
      null,
      'done',
      true,
      '11111111-1111-4111-8111-111111111111',
      true,
      '2026-05-26T01:00:00.000Z',
      JSON.stringify({ source: 'manual' })
    ])
  })

  it('allows explicit clearing of assignee and due date', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'action-1',
        assignee_user_id: null,
        due_at: null
      })

    await handler(fakeEvent({
      assignee_user_id: null,
      due_at: null
    }))

    expect(mockQueryOne.mock.calls[1]?.[1][5]).toBe(true)
    expect(mockQueryOne.mock.calls[1]?.[1][6]).toBeNull()
    expect(mockQueryOne.mock.calls[1]?.[1][7]).toBe(true)
    expect(mockQueryOne.mock.calls[1]?.[1][8]).toBeNull()
  })

  it('rejects non-members', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({ status: 'done' }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })

    expect(mockEnsureOfficeMeetingArtifactsTables).not.toHaveBeenCalled()
  })

  it('returns 404 when the row is missing or assignee is outside the office', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      assignee_user_id: '11111111-1111-4111-8111-111111111111'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Action item not found or assignee is not in this office'
    })
  })
})
