import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

describe('officePresenceLocations utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
  })

  it('creates office presence location table and indexes once', async () => {
    const { ensureOfficePresenceLocationsTable } = await import('~~/server/utils/officePresenceLocations')

    await ensureOfficePresenceLocationsTable()
    await ensureOfficePresenceLocationsTable()

    expect(mockExecute).toHaveBeenCalledTimes(4)
    expect(mockExecute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS office_presence_locations')
    expect(mockExecute.mock.calls[1][0]).toContain('ALTER TABLE office_presence_locations')
    expect(mockExecute.mock.calls[2][0]).toContain('idx_office_presence_locations_zone')
    expect(mockExecute.mock.calls[3][0]).toContain('idx_office_presence_locations_actor')
  })

  it('retries table setup after a transient failure', async () => {
    const { ensureOfficePresenceLocationsTable } = await import('~~/server/utils/officePresenceLocations')
    mockExecute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(ensureOfficePresenceLocationsTable()).rejects.toThrow('connection reset')
    mockExecute.mockResolvedValue(undefined)
    await expect(ensureOfficePresenceLocationsTable()).resolves.toBeUndefined()

    expect(mockExecute).toHaveBeenCalledTimes(5)
    expect(mockExecute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS office_presence_locations')
  })
})
