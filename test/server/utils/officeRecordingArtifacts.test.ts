import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OfficeRecordingRow } from '~~/app/types/office'

const mockQueryOne = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

const { attachReadyRecordingArtifact } = await import('../../../server/utils/officeRecordingArtifacts')

function recording(overrides: Partial<OfficeRecordingRow> = {}): OfficeRecordingRow {
  return {
    id: 'recording-1',
    office_id: 'office-1',
    meeting_session_id: 'meeting-1',
    title: 'Client walkthrough',
    description: '',
    status: 'ready',
    access: 'public',
    storage_key: 'recording.webm',
    thumbnail_key: null,
    duration_seconds: 120,
    transcript: '',
    summary: 'Summary text',
    chapters: [],
    retention_days: 180,
    share_token: 'share-token-1',
    password_hash: null,
    view_count: 0,
    created_by: 'user-1',
    created_at: '2026-05-25T00:00:00.000Z',
    updated_at: '2026-05-25T00:00:00.000Z',
    ...overrides
  }
}

describe('attachReadyRecordingArtifact', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue({ id: 'artifact-1' })
  })

  it('creates a recording artifact for ready meeting recordings', async () => {
    await attachReadyRecordingArtifact(recording(), 'user-1')

    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('INSERT INTO office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([
      'meeting-1',
      'Client walkthrough recording',
      'Summary text\nShared link: /recordings/share-token-1',
      JSON.stringify({
        status: 'generated',
        source: 'office_recording',
        recording_id: 'recording-1',
        recording_status: 'ready',
        recording_access: 'public',
        share_token: 'share-token-1',
        duration_seconds: 120
      }),
      'user-1',
      'recording-1'
    ])
  })

  it('ignores draft and standalone recordings', async () => {
    await attachReadyRecordingArtifact(recording({ status: 'draft' }), 'user-1')
    await attachReadyRecordingArtifact(recording({ meeting_session_id: null }), 'user-1')

    expect(mockEnsureOfficeMeetingArtifactsTables).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
