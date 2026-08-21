import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

const { default: boardHandler } = await import('../../../../server/api/portal/board.get')

describe('client portal linked board', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      clientId: 'client-1',
      permissions: { canViewProjects: true },
    })
    mockQueryOne.mockResolvedValue({ id: 'board-1', name: 'Campaign delivery', description: null, color: '#123456' })
    mockQueryRows.mockResolvedValue([])
  })

  it('scopes every visible task through a project owned by the authenticated client', async () => {
    await boardHandler({})

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('JOIN projects p ON p.id = t.project_id AND p.client_id = $2')
    expect(sql).toContain('WHERE t.department_id = $1')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['board-1', 'client-1', 251])
  })

  it('returns an unlinked state without querying board tasks', async () => {
    mockQueryOne.mockResolvedValueOnce(null)
    const result = await boardHandler({})
    expect(result).toMatchObject({ linked: false, board: null, total: 0 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('rejects portal users without project visibility', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({ clientId: 'client-1', permissions: { canViewProjects: false } })
    await expect(boardHandler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})

