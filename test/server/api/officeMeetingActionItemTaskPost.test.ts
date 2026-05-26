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
const mockTransaction = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockEnsureOfficeMeetingThreadChannel = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeMeetingThreadChannel: (...args: unknown[]) => mockEnsureOfficeMeetingThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/task.post'
)

function fakeEvent(body: Record<string, unknown> = {}) {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1', actionItemId: 'action-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/meetings/:meetingId/action-items/:actionItemId/task', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockTransaction.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockEnsureOfficeMeetingThreadChannel.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingThreadChannel.mockResolvedValue({ id: 'channel-1' })
  })

  it('creates an agency task from a meeting action item', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'action-1',
        office_id: 'office-1',
        meeting_session_id: 'meeting-1',
        source_artifact_id: 'artifact-1',
        task_id: null,
        content: 'Send recap',
        status: 'open',
        assignee_user_id: 'assignee-1',
        due_at: '2026-05-26T01:00:00.000Z',
        meeting_title: 'Client Review'
      })
      .mockResolvedValueOnce({ id: 'department-1' })
      .mockResolvedValueOnce({ id: 'status-1' })

    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'task-1',
            title: 'Send recap',
            department_id: 'department-1',
            assignee_id: 'assignee-1',
            due_date: '2026-05-26'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'action-1',
            task_id: 'task-1',
            status: 'in_progress'
          }]
        })
        .mockResolvedValueOnce({ rows: [] })
    }
    mockTransaction.mockImplementation(async cb => cb(client))

    const result = await handler(fakeEvent({ priority: 'high' }))

    expect(result).toMatchObject({
      created: true,
      task: { id: 'task-1' },
      actionItem: { id: 'action-1', task_id: 'task-1' }
    })
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([null, 'assignee-1', 'user-1'])
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual(['department-1'])
    expect(client.query.mock.calls[0]?.[0]).toContain('INSERT INTO tasks')
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      'department-1',
      'status-1',
      'Send recap',
      [
        'Source: Office meeting "Client Review"',
        'Send recap',
        'Meeting ID: meeting-1',
        'Action item ID: action-1',
        'Artifact ID: artifact-1'
      ].join('\n'),
      'high',
      'assignee-1',
      'user-1',
      '2026-05-26'
    ])
    expect(client.query.mock.calls[1]?.[0]).toContain('UPDATE office_meeting_action_items')
    expect(mockEnsureOfficeMeetingThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      meetingId: 'meeting-1',
      actorId: 'user-1'
    })
    expect(mockQueryOne.mock.calls[4]?.[0]).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Created task from follow-up: Send recap\n/agency/tasks/task-1',
      JSON.stringify({
        source: 'office_meeting_action_item',
        event: 'task_created',
        meeting_id: 'meeting-1',
        action_item_id: 'action-1',
        task_id: 'task-1',
        department_id: 'department-1',
        assignee_id: 'assignee-1'
      })
    ])
  })

  it('returns the existing task without creating a duplicate', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'action-1',
        task_id: 'task-1',
        content: 'Send recap',
        meeting_title: 'Client Review'
      })
      .mockResolvedValueOnce({
        id: 'task-1',
        title: 'Send recap'
      })

    const result = await handler(fakeEvent())

    expect(result).toMatchObject({
      created: false,
      task: { id: 'task-1' }
    })
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockEnsureOfficeMeetingThreadChannel).not.toHaveBeenCalled()
  })

  it('requires a resolved department', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'action-1',
        task_id: null,
        content: 'Send recap',
        assignee_user_id: null,
        meeting_title: 'Client Review'
      })
      .mockResolvedValueOnce({ id: null })

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Choose a department before creating a task'
    })

    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
