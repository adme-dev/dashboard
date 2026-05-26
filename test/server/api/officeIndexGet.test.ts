import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = Record<string, never>

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
}

testGlobal.defineEventHandler = fn => fn

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: handler } = await import('../../../server/api/office/index.get')

describe('GET /api/office', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'member' })
  })

  it('returns offices with the stored office role for ordinary members', async () => {
    mockQueryRows.mockResolvedValueOnce([
      { id: 'office-1', name: 'HQ', my_role: 'member' }
    ])

    const result = await handler({} satisfies TestEvent)

    expect(result.offices).toEqual([
      expect.objectContaining({ id: 'office-1', my_role: 'member' })
    ])
  })

  it('elevates platform owners to admin for the office UI contract', async () => {
    mockRequireAuth.mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
    mockQueryRows.mockResolvedValueOnce([
      { id: 'office-1', name: 'HQ', my_role: 'member' }
    ])

    const result = await handler({} satisfies TestEvent)

    expect(result.offices).toEqual([
      expect.objectContaining({ id: 'office-1', my_role: 'admin' })
    ])
  })
})
