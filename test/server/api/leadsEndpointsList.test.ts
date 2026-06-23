import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONS } from '~~/server/utils/permissions'

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

  it('requires media-buying access (owner/admin/lead/PM/buyer/AM)', async () => {
    mockQueryRows.mockResolvedValue([])

    await handler({} satisfies TestEvent)

    expect(mockRequireRole).toHaveBeenCalledWith({}, PERMISSIONS.MEDIA_BUYING)
  })

  it('returns Google and all-routable lead counts for connection setup', async () => {
    // The handler first runs a backfill query (clients missing a 'google'
    // endpoint), then the data query. Mock both: no missing clients, then rows.
    mockQueryRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
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
    // calls[0] is the backfill query; calls[1] is the data query with the counts.
    const sql = String(mockQueryRows.mock.calls[1]?.[0])
    expect(sql).toContain('l.source = \'google\'')
    expect(sql).toContain('l.source IN (\'google\', \'meta\', \'webhook\', \'csv\')')
  })
})
