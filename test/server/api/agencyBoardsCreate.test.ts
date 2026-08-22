import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = Record<string, never>

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: <T>(event: unknown) => Promise<T>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & { statusCode: number, statusMessage: string }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireWriteAccess = vi.fn()
const mockQueryOne = vi.fn()
const mockReadBody = vi.fn()
const mockCacheDelete = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))
vi.mock('~~/server/utils/cache', () => ({
  workspaceCache: { delete: (...args: unknown[]) => mockCacheDelete(...args) }
}))
testGlobal.readBody = (...args: unknown[]) => mockReadBody(...args)

const { default: handler } = await import('../../../../server/api/agency/boards/index.post')

const WS = '11111111-1111-4111-8111-111111111111'

describe('POST /api/agency/boards', () => {
  beforeEach(() => {
    mockRequireWriteAccess.mockReset()
    mockQueryOne.mockReset()
    mockReadBody.mockReset()
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'owner' })
  })

  it('creates a board inside the given workspace and returns its slug', async () => {
    mockReadBody.mockResolvedValue({ name: 'Q1 Campaign', description: 'desc', workspaceId: WS })
    mockQueryOne
      .mockResolvedValueOnce({ id: WS }) // workspace lookup
      .mockResolvedValueOnce(null) // slug free
      .mockResolvedValueOnce({ id: 'dept-1', name: 'Q1 Campaign', slug: 'q1-campaign', workspace_id: WS })

    const result = await handler({} as TestEvent)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    const insert = mockQueryOne.mock.calls[2]
    expect(insert[0]).toMatch(/INSERT INTO departments/)
    expect(insert[0]).toMatch(/workspace_id/)
    expect(insert[1]).toEqual(expect.arrayContaining(['Q1 Campaign', 'q1-campaign', WS]))
    expect(result).toMatchObject({ id: 'dept-1', slug: 'q1-campaign', workspaceId: WS })
    expect(mockCacheDelete).toHaveBeenCalledWith('workspaces:list')
  })

  it('dedupes the slug when it is already taken', async () => {
    mockReadBody.mockResolvedValue({ name: 'Main' })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'x' }) // slug taken
      .mockResolvedValueOnce(null) // main-2 free
      .mockResolvedValueOnce({ id: 'dept-2', name: 'Main', slug: 'main-2', workspace_id: null })

    const result = await handler({} as TestEvent)
    expect(result.slug).toBe('main-2')
  })

  it('rejects an empty name', async () => {
    mockReadBody.mockResolvedValue({ name: '   ' })
    await expect(handler({} as TestEvent)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an unknown workspace', async () => {
    mockReadBody.mockResolvedValue({ name: 'X', workspaceId: WS })
    mockQueryOne.mockResolvedValueOnce(null)
    await expect(handler({} as TestEvent)).rejects.toMatchObject({ statusCode: 404 })
  })
})
