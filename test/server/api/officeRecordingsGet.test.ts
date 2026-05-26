import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getQuery = event => event.context?.params?.query as Record<string, string> ?? {}
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
const mockEnsureOfficeRecordingsTables = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureOfficeRecordingsTables(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/recordings.get'
)

function fakeEvent(query?: Record<string, string>) {
  return {
    context: { params: { officeId: 'office-1', ...(query ? { query } : {}) } }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/recordings', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficeRecordingsTables.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
  })

  it('lists active recordings with office-scoped meeting titles', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'recording-1',
        office_id: 'office-1',
        meeting_session_id: 'meeting-1',
        title: 'Client walkthrough',
        meeting_title: 'Client review',
        recent_views: [
          {
            viewer_email: 'client@example.com',
            viewer_key: null,
            percent_watched: 75,
            watched_seconds: 420,
            created_at: '2026-05-25T07:00:00.000Z'
          }
        ]
      }
    ])

    const result = await handler(fakeEvent())

    expect(result.recordings).toHaveLength(1)
    expect(result.recordings[0]).toMatchObject({
      id: 'recording-1',
      meeting_title: 'Client review'
    })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('oms.office_id = r.office_id')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('office_recording_views')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('viewer_key')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('$2::boolean OR r.status <> \'archived\'')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('LIMIT 5')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['office-1', false])
  })

  it('includes archived recordings when requested', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
    mockQueryRows.mockResolvedValueOnce([])

    await handler(fakeEvent({ includeArchived: 'true' }))

    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['office-1', true])
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
