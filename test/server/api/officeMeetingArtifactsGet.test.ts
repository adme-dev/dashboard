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
  '../../../../server/api/office/[officeId]/meetings/[meetingId]/artifacts.get'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1' } }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/meetings/:meetingId/artifacts', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('returns artifacts for an office meeting session', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'meeting-1' })
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'artifact-1',
        meeting_session_id: 'meeting-1',
        artifact_type: 'notes',
        title: 'Client review notes',
        content: 'Agenda',
        metadata: {}
      }
    ])

    const result = await handler(fakeEvent())

    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts[0]).toMatchObject({
      id: 'artifact-1',
      artifact_type: 'notes',
      title: 'Client review notes'
    })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('office_meeting_artifacts')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('system_event')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('guest_intake')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('meeting_closeout')
  })

  it('rejects meetings outside the office', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting session not found'
    })
  })
})
