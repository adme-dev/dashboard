import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = Record<string, never>

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
}

testGlobal.defineEventHandler = fn => fn

const mockRequireRole = vi.fn()
const mockExecute = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/leads/endpoints/list.get'
)

describe('GET /api/leads/endpoints/list', () => {
  beforeEach(() => {
    mockRequireRole.mockReset()
    mockExecute.mockReset()
    mockQueryRows.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockExecute.mockResolvedValue(0)
  })

  it('requires owner or admin access', async () => {
    mockQueryRows.mockResolvedValueOnce([])

    await handler({} satisfies TestEvent)

    expect(mockRequireRole).toHaveBeenCalledWith({}, ['owner', 'admin'])
  })

  it('returns Google and all-routable lead counts for connection setup', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'endpoint-1',
        client_id: 'client-1',
        client_name: 'Brighton Auto Group',
        url_token: 'token',
        secret_key: 'secret',
        lead_count: '2',
        google_lead_count: '2',
        routable_lead_count: '5'
      }
    ])

    const result = await handler({} satisfies TestEvent)

    expect(result.items[0]).toMatchObject({
      google_lead_count: '2',
      routable_lead_count: '5'
    })
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('l.source = \'google\'')
    expect(sql).toContain('l.source IN (\'google\', \'meta\', \'webhook\', \'csv\')')
  })
})
