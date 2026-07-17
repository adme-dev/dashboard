import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = Record<string, never>

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: <T>(event: unknown) => Promise<T>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockReadBody = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

testGlobal.readBody = (...args: unknown[]) => mockReadBody(...args)

const { default: createDepartmentHandler } = await import(
  '../../../../server/api/agency/departments/index.post'
)

describe('POST /api/agency/departments', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockReadBody.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'owner-1', role: 'owner' })
    mockReadBody.mockResolvedValue({
      name: 'Meta CAPI Rollout',
      slug: 'meta-capi-rollout',
      description: 'Controlled rollout board',
      color: '#00D084',
      icon: 'activity',
      managerId: 'manager-1'
    })
    mockQueryOne.mockResolvedValue({
      id: 'board-1',
      name: 'Meta CAPI Rollout',
      slug: 'meta-capi-rollout',
      description: 'Controlled rollout board',
      color: '#00D084',
      icon: 'activity',
      manager_id: 'manager-1',
      is_active: true,
      sort_order: 0,
      created_at: '2026-07-17T00:00:00.000Z',
      updated_at: '2026-07-17T00:00:00.000Z'
    })
  })

  it('requires authentication and persists the manager contract', async () => {
    const event: TestEvent = {}

    const result = await createDepartmentHandler(event)

    expect(mockRequireAuth).toHaveBeenCalledWith(event)
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('manager_id'),
      expect.arrayContaining(['manager-1'])
    )
    expect(result).toMatchObject({ id: 'board-1', managerId: 'manager-1' })
  })
})
