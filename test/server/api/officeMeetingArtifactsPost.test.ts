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
const mockCreateMeetingActionItemsFromArtifact = vi.fn()
const mockEnsureOfficeMeetingThreadChannel = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  createMeetingActionItemsFromArtifact: (...args: unknown[]) => mockCreateMeetingActionItemsFromArtifact(...args),
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeMeetingThreadChannel: (...args: unknown[]) => mockEnsureOfficeMeetingThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings/[meetingId]/artifacts.post'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/meetings/:meetingId/artifacts', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockCreateMeetingActionItemsFromArtifact.mockReset()
    mockEnsureOfficeMeetingThreadChannel.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockCreateMeetingActionItemsFromArtifact.mockResolvedValue([])
    mockEnsureOfficeMeetingThreadChannel.mockResolvedValue({ id: 'channel-1' })
  })

  it('creates an artifact scoped to the office meeting', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'artifact-1',
        artifact_type: 'notes',
        title: 'Meeting notes',
        content: 'Decision log',
        metadata: { status: 'edited' }
      })
      .mockResolvedValueOnce({ id: 123 })

    const result = await handler(fakeEvent({
      artifact_type: 'notes',
      title: 'Meeting notes',
      content: 'Decision log',
      metadata: { status: 'edited' }
    }))

    expect(result.artifact).toMatchObject({
      id: 'artifact-1',
      title: 'Meeting notes'
    })
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('INSERT INTO office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      'meeting-1',
      'notes',
      'Meeting notes',
      'Decision log',
      JSON.stringify({ status: 'edited' }),
      'user-1',
      'office-1'
    ])
    expect(mockEnsureOfficeMeetingThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      meetingId: 'meeting-1',
      actorId: 'user-1'
    })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Saved notes: Meeting notes\n\nDecision log',
      JSON.stringify({
        source: 'office_meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        artifact_type: 'notes',
        action_item_count: 0
      })
    ])
  })

  it('extracts structured follow-up actions for action-item artifacts', async () => {
    mockCreateMeetingActionItemsFromArtifact.mockResolvedValue(['Send recap', 'Create tasks'])
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'artifact-1',
        meeting_session_id: 'meeting-1',
        artifact_type: 'action_items',
        title: 'Follow-up',
        content: '- Send recap\n- Create tasks',
        metadata: { status: 'edited' },
        created_by: 'user-1'
      })
      .mockResolvedValueOnce({ id: 123 })

    await handler(fakeEvent({
      artifact_type: 'action_items',
      title: 'Follow-up',
      content: '- Send recap\n- Create tasks',
      metadata: { status: 'edited' }
    }))

    expect(mockCreateMeetingActionItemsFromArtifact).toHaveBeenCalledWith({
      officeId: 'office-1',
      artifact: expect.objectContaining({
        id: 'artifact-1',
        artifact_type: 'action_items',
        content: '- Send recap\n- Create tasks'
      }),
      actorId: 'user-1'
    })
    expect(mockQueryOne.mock.calls[2]?.[1][3]).toBe(JSON.stringify({
      source: 'office_meeting_artifact',
      meeting_id: 'meeting-1',
      artifact_id: 'artifact-1',
      artifact_type: 'action_items',
      action_item_count: 2
    }))
  })

  it('rejects attempts to create system artifacts through the public endpoint', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })

    await expect(handler(fakeEvent({
      artifact_type: 'notes',
      title: 'Closeout',
      metadata: {
        status: 'system',
        system_event: 'meeting_closeout'
      }
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'System artifacts cannot be created through this endpoint'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockEnsureOfficeMeetingThreadChannel).not.toHaveBeenCalled()
  })
})
