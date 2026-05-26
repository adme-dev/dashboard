import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

describe('officeSettings utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
  })

  it('creates office settings table and index once', async () => {
    const { ensureOfficeSettingsTable } = await import('~~/server/utils/officeSettings')

    await ensureOfficeSettingsTable()
    await ensureOfficeSettingsTable()

    expect(mockExecute).toHaveBeenCalledTimes(5)
    expect(mockExecute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS office_settings')
    expect(mockExecute.mock.calls[1][0]).toContain('ALTER TABLE office_settings')
    expect(mockExecute.mock.calls[2][0]).toContain('DROP CONSTRAINT IF EXISTS')
    expect(mockExecute.mock.calls[3][0]).toContain('ADD CONSTRAINT office_settings_default_meeting_retention_days_check')
    expect(mockExecute.mock.calls[4][0]).toContain('idx_office_settings_updated')
  })

  it('retries table setup after a transient failure', async () => {
    const { ensureOfficeSettingsTable } = await import('~~/server/utils/officeSettings')
    mockExecute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(ensureOfficeSettingsTable()).rejects.toThrow('connection reset')
    mockExecute.mockResolvedValue(undefined)
    await expect(ensureOfficeSettingsTable()).resolves.toBeUndefined()

    expect(mockExecute).toHaveBeenCalledTimes(6)
    expect(mockExecute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS office_settings')
  })

  it('identifies externally shareable recording access modes', async () => {
    const { isPublicRecordingAccess } = await import('~~/server/utils/officeSettings')

    expect(isPublicRecordingAccess('public')).toBe(true)
    expect(isPublicRecordingAccess('password')).toBe(true)
    expect(isPublicRecordingAccess('workspace')).toBe(false)
    expect(isPublicRecordingAccess('private')).toBe(false)
  })
})
