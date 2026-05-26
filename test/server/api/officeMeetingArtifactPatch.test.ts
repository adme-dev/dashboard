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
  '../../../../server/api/office/[officeId]/meetings/[meetingId]/artifacts/[artifactId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1', artifactId: 'artifact-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/meetings/:meetingId/artifacts/:artifactId', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('updates an artifact scoped to the office meeting', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'artifact-1', metadata: { status: 'placeholder' } })
      .mockResolvedValueOnce({
        id: 'artifact-1',
        title: 'Updated notes',
        content: 'Follow up with client.',
        metadata: { status: 'edited' }
      })

    const result = await handler(fakeEvent({
      title: 'Updated notes',
      content: 'Follow up with client.',
      metadata: { status: 'edited' }
    }))

    expect(result.artifact).toMatchObject({
      id: 'artifact-1',
      title: 'Updated notes'
    })
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('FROM office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      'artifact-1',
      'meeting-1',
      'office-1'
    ])
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('UPDATE office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'Updated notes',
      'Follow up with client.',
      JSON.stringify({ status: 'edited' }),
      'artifact-1',
      'meeting-1',
      'office-1'
    ])
  })

  it('rejects artifacts outside the office meeting', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({ content: 'Nope' }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting artifact not found'
    })
  })

  it('rejects edits to existing system artifacts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'artifact-1',
        metadata: {
          status: 'system',
          system_event: 'meeting_closeout'
        }
      })

    await expect(handler(fakeEvent({ content: 'Nope' }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'System artifacts cannot be edited'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
  })

  it('rejects attempts to set system metadata through the patch endpoint', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })

    await expect(handler(fakeEvent({
      metadata: {
        status: 'system',
        system_event: 'meeting_closeout'
      }
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'System artifact metadata cannot be set through this endpoint'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
  })
})
