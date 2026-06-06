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

  it('filters subscriber rows by suppression state', async () => {
    await listSubscribers({ page: 1, pageSize: 50, deliverability: 'suppressed' })

    const rowsSql = String(queryRowsMock.mock.calls[0]?.[0])
    const countSql = String(queryCountMock.mock.calls[0]?.[0])
    expect(rowsSql).toContain('LEFT JOIN suppression_list sup ON sup.email = s.email')
    expect(rowsSql).toContain('sup.email IS NOT NULL')
    expect(countSql).toContain('LEFT JOIN suppression_list sup ON sup.email = s.email')
    expect(countSql).toContain('sup.email IS NOT NULL')
  })

  it('filters subscriber rows by soft-bounce count', async () => {
    await listSubscribers({ page: 1, pageSize: 50, deliverability: 'soft_bounced' })

    const rowsSql = String(queryRowsMock.mock.calls[0]?.[0])
    const countSql = String(queryCountMock.mock.calls[0]?.[0])
    expect(rowsSql).toContain('s.soft_bounce_count > 0')
    expect(countSql).toContain('s.soft_bounce_count > 0')
  })

  it('filters subscriber rows down to mailable subscribers', async () => {
    await listSubscribers({ page: 1, pageSize: 50, deliverability: 'mailable' })

    const rowsSql = String(queryRowsMock.mock.calls[0]?.[0])
    const countSql = String(queryCountMock.mock.calls[0]?.[0])
    expect(rowsSql).toContain('s.status = \'enabled\'')
    expect(rowsSql).toContain('sup.email IS NULL')
    expect(countSql).toContain('LEFT JOIN suppression_list sup ON sup.email = s.email')
    expect(countSql).toContain('s.status = \'enabled\'')
    expect(countSql).toContain('sup.email IS NULL')
  })

  it('excludes list-level unsubscribes from list-scoped mailable reads', async () => {
    await listSubscribers({
      page: 1,
      pageSize: 50,
      listId: 'list-1',
      deliverability: 'mailable'
    })

    const rowsSql = String(queryRowsMock.mock.calls[0]?.[0])
    const countSql = String(queryCountMock.mock.calls[0]?.[0])
    expect(rowsSql).toContain('JOIN subscriber_lists sl ON sl.subscriber_id = s.id')
    expect(rowsSql).toContain('sl.status <> \'unsubscribed\'')
    expect(countSql).toContain('JOIN subscriber_lists sl ON sl.subscriber_id = s.id')
    expect(countSql).toContain('sl.status <> \'unsubscribed\'')
  })
})
