import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

describe('officeAudit utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
  })

  it('creates audit table and indexes once', async () => {
    const { ensureOfficeAuditEventsTable } = await import('~~/server/utils/officeAudit')

    await ensureOfficeAuditEventsTable()
    await ensureOfficeAuditEventsTable()

    expect(mockExecute).toHaveBeenCalledTimes(4)
    expect(mockExecute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS office_audit_events')
    expect(mockExecute.mock.calls[1][0]).toContain('ALTER TABLE office_audit_events')
    expect(mockExecute.mock.calls[2][0]).toContain('idx_office_audit_events_office')
    expect(mockExecute.mock.calls[3][0]).toContain('idx_office_audit_events_target')
  })

  it('retries table setup after a transient failure', async () => {
    const { ensureOfficeAuditEventsTable } = await import('~~/server/utils/officeAudit')
    mockExecute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(ensureOfficeAuditEventsTable()).rejects.toThrow('connection reset')
    mockExecute.mockResolvedValue(undefined)
    await expect(ensureOfficeAuditEventsTable()).resolves.toBeUndefined()

    expect(mockExecute).toHaveBeenCalledTimes(5)
    expect(mockExecute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS office_audit_events')
  })

  it('writes audit metadata as json', async () => {
    const { logOfficeAuditEvent } = await import('~~/server/utils/officeAudit')

    await logOfficeAuditEvent({
      officeId: 'office-1',
      actorId: 'user-1',
      action: 'settings.updated',
      targetType: 'office_settings',
      metadata: { changed: { recording_enabled: false } }
    })

    expect(mockExecute.mock.calls[4][0]).toContain('INSERT INTO office_audit_events')
    expect(mockExecute.mock.calls[4][1]).toEqual([
      'office-1',
      'user-1',
      'settings.updated',
      'office_settings',
      null,
      JSON.stringify({ changed: { recording_enabled: false } })
    ])
  })
})
