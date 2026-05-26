import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

describe('officeRecordings utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('generates URL-safe share tokens', async () => {
    const { generateOfficeRecordingShareToken } = await import('~~/server/utils/officeRecordings')

    expect(generateOfficeRecordingShareToken()).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('creates recording and view tables once', async () => {
    const { ensureOfficeRecordingsTables } = await import('~~/server/utils/officeRecordings')

    await ensureOfficeRecordingsTables()
    await ensureOfficeRecordingsTables()

    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(mockExecute).toHaveBeenCalledTimes(13)
    expect(mockExecute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS office_recordings')
    expect(mockExecute.mock.calls[1][0]).toContain('ADD COLUMN IF NOT EXISTS retention_days')
    expect(mockExecute.mock.calls[1][0]).toContain('ADD COLUMN IF NOT EXISTS share_token')
    expect(mockExecute.mock.calls[3][0]).toContain('office_recordings_retention_days_check')
    expect(mockExecute.mock.calls[7][0]).toContain('idx_office_recordings_share_unique')
    expect(mockExecute.mock.calls[8][0]).toContain('CREATE TABLE IF NOT EXISTS office_recording_views')
    expect(mockExecute.mock.calls[9][0]).toContain('ADD COLUMN IF NOT EXISTS viewer_key')
    expect(mockExecute.mock.calls[9][0]).toContain('ADD COLUMN IF NOT EXISTS percent_watched')
    expect(mockExecute.mock.calls[10][0]).toContain('idx_office_recording_views_recording')
    expect(mockExecute.mock.calls[11][0]).toContain('idx_office_recording_views_email')
    expect(mockExecute.mock.calls[12][0]).toContain('idx_office_recording_views_viewer_key')
  })

  it('retries table setup after a transient failure', async () => {
    const { ensureOfficeRecordingsTables } = await import('~~/server/utils/officeRecordings')
    mockExecute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(ensureOfficeRecordingsTables()).rejects.toThrow('connection reset')
    mockExecute.mockResolvedValue(undefined)
    await expect(ensureOfficeRecordingsTables()).resolves.toBeUndefined()

    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledTimes(2)
    expect(mockExecute).toHaveBeenCalledTimes(14)
    expect(mockExecute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS office_recordings')
  })
})
