import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockEnsureArtifacts = vi.fn()
const mockEnsureRecordings = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureArtifacts(...args)
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureRecordings(...args)
}))

const { default: meetingsHandler } = await import(
  '../../../../server/api/portal/meetings/index.get'
)

describe('portal meetings API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'meeting-1',
        office_id: 'office-1',
        office_name: 'Client Office',
        title: 'Monthly review',
        status: 'planned',
        source: 'scheduled',
        started_at: null,
        ended_at: null,
        created_at: '2026-05-28T00:00:00Z',
        scheduled_start_at: '2026-06-01T00:00:00Z',
        duration_minutes: '30',
        zone_name: 'Boardroom',
        zone_slug: 'boardroom',
        ready_recording_count: '1',
        latest_recording_token: 'recording-token',
        summary_count: '1',
        action_item_artifact_count: '1',
        notes_count: '0',
        transcript_count: '1'
      }
    ])
    mockQueryOne.mockResolvedValue({
      total_visible: '3',
      live: '1',
      planned: '1',
      ended: '1',
      recordings: '2',
      recordings_last_30: '1',
      summaries: '2',
      action_items: '3',
      notes: '4',
      transcripts: '1',
      completed_last_30: '2',
      missing_follow_up: '1',
      next_meeting_at: '2026-06-01T00:00:00Z'
    })
  })

  it('returns client-scoped meetings with recording and join metadata', async () => {
    const result = await meetingsHandler({ query: { view: 'upcoming', limit: '20' } })

    expect(mockEnsureArtifacts).toHaveBeenCalledOnce()
    expect(mockEnsureRecordings).toHaveBeenCalledOnce()
    expect(result.stats).toEqual({
      totalVisible: 3,
      live: 1,
      planned: 1,
      ended: 1,
      recordings: 2,
      recordingsLast30: 1,
      summaries: 2,
      actionItems: 3,
      notes: 4,
      transcripts: 1,
      completedLast30: 2,
      missingFollowUp: 1,
      nextMeetingAt: '2026-06-01T00:00:00Z'
    })
    expect(result.meetings[0]).toMatchObject({
      id: 'meeting-1',
      joinPath: '/lobby/office-1?meeting=meeting-1',
      durationMinutes: 30,
      readyRecordingCount: 1,
      latestRecordingToken: 'recording-token',
      artifacts: {
        summaries: 1,
        actionItems: 1,
        notes: 0,
        transcripts: 1
      }
    })
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('om.client_user_id = $1'),
      ['client-user-1', 20]
    )
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('SUM(artifact_summary.action_item_artifact_count)')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('FROM office_meeting_artifacts')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('recordings_last_30')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('completed_last_30')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('missing_follow_up')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('next_meeting_at')
  })

  it('filters history meetings away from live and planned sessions', async () => {
    await meetingsHandler({ query: { view: 'history' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('oms.status NOT IN (\'live\', \'planned\')')
  })
})
