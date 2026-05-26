import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

describe('officeLobbies utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
  })

  it('normalizes public lobby handles', async () => {
    const { normalizeOfficeLobbyHandle } = await import('~~/server/utils/officeLobbies')

    expect(normalizeOfficeLobbyHandle(' Sales Team! ')).toBe('sales-team')
    expect(normalizeOfficeLobbyHandle('VIP___Support')).toBe('vip-support')
  })

  it('creates the lobby table and indexes once', async () => {
    const { ensureOfficeLobbiesTable } = await import('~~/server/utils/officeLobbies')

    await ensureOfficeLobbiesTable()
    await ensureOfficeLobbiesTable()

    expect(mockExecute).toHaveBeenCalledTimes(5)
    expect(mockExecute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS office_lobbies')
    expect(mockExecute.mock.calls[1][0]).toContain('ALTER TABLE office_lobbies')
    expect(mockExecute.mock.calls[2][0]).toContain('DROP INDEX IF EXISTS idx_office_lobbies_handle')
    expect(mockExecute.mock.calls[3][0]).toContain('idx_office_lobbies_handle')
    expect(mockExecute.mock.calls[3][0]).toContain('WHERE is_active = true')
    expect(mockExecute.mock.calls[4][0]).toContain('idx_office_lobbies_office')
  })

  it('retries table setup after a transient failure', async () => {
    const { ensureOfficeLobbiesTable } = await import('~~/server/utils/officeLobbies')
    mockExecute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(ensureOfficeLobbiesTable()).rejects.toThrow('connection reset')
    mockExecute.mockResolvedValue(undefined)
    await expect(ensureOfficeLobbiesTable()).resolves.toBeUndefined()

    expect(mockExecute).toHaveBeenCalledTimes(6)
    expect(mockExecute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS office_lobbies')
  })
})
