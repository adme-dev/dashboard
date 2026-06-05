import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listSubscribers } from '~~/server/utils/email-marketing/db'

const queryRowsMock = vi.fn()
const queryCountMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => queryRowsMock(...args),
  queryCount: (...args: unknown[]) => queryCountMock(...args),
  queryOne: vi.fn(),
  execute: vi.fn()
}))

describe('listSubscribers', () => {
  beforeEach(() => {
    queryRowsMock.mockReset()
    queryCountMock.mockReset()
    queryRowsMock.mockResolvedValue([])
    queryCountMock.mockResolvedValue(0)
  })

  it('returns deliverability columns for list rows', async () => {
    await listSubscribers({ page: 1, pageSize: 50 })

    const sql = String(queryRowsMock.mock.calls[0]?.[0])
    expect(sql).toContain('LEFT JOIN suppression_list sup ON sup.email = s.email')
    expect(sql).toContain('s.soft_bounce_count::int AS soft_bounce_count')
    expect(sql).toContain('s.last_soft_bounce_at')
    expect(sql).toContain('sup.reason::text AS suppression_reason')
    expect(sql).toContain('sup.created_at AS suppressed_at')
  })
})
