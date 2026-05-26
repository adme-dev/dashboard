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
const mockEnsureOfficeRecordingsTables = vi.fn()

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

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureOfficeRecordingsTables(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings.get'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1' } }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/meetings', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockEnsureOfficeRecordingsTables.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({ id: 'member-1', role: 'admin' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
  })

  it('returns meeting artifact summary fields', async () => {
    mockQueryRows.mockResolvedValue([
      {
        id: 'meeting-1',
        title: 'Client review',
        zone_name: 'Meeting Room A',
        zone_slug: 'meeting-room-a',
        artifact_count: 3,
        artifact_types: ['notes', 'summary', 'action_items'],
        has_notes: true,
        has_summary: true,
        has_action_items: true,
        has_guest_intake: true,
        recording_count: 2,
        ready_recording_count: 1,
        draft_recording_count: 1,
        latest_recording_status: 'ready'
      }
    ])

    const result = await handler(fakeEvent())

    expect(result.meetings[0]).toMatchObject({
      id: 'meeting-1',
      zone_slug: 'meeting-room-a',
      artifact_count: 3,
      artifact_types: ['notes', 'summary', 'action_items'],
      has_notes: true,
      has_summary: true,
      has_action_items: true,
      has_guest_intake: true,
      recording_count: 2,
      ready_recording_count: 1,
      draft_recording_count: 1,
      latest_recording_status: 'ready'
    })
    expect(mockEnsureOfficeRecordingsTables).toHaveBeenCalled()
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('office_meeting_artifacts')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('office_recordings')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('artifact_count')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('recording_count')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('zone_slug')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('oms.status = \'live\'')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('scheduled_start_at')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('COALESCE(BOOL_OR')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('guest_intake')
  })

  it('rejects users who are not members before preparing summary tables', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })

    expect(mockEnsureOfficeMeetingArtifactsTables).not.toHaveBeenCalled()
    expect(mockEnsureOfficeRecordingsTables).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
