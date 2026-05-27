import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: invoicesHandler } = await import(
  '../../../../server/api/portal/invoices/index.get'
)

describe('portal invoice billing views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      clientId: 'client-1',
      permissions: { canViewInvoices: true }
    })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({
      total: '0',
      paid: '0',
      sent: '0',
      overdue: '0',
      current: '0',
      history: '0',
      aging_current_count: '0',
      aging_30_count: '0',
      aging_60_count: '0',
      aging_90_count: '0',
      total_billed: '0',
      total_paid: '0',
      total_outstanding: '0',
      aging_current_amount: '0',
      aging_30_amount: '0',
      aging_60_amount: '0',
      aging_90_amount: '0'
    })
  })

  it('returns current billing as sent and overdue invoices', async () => {
    await invoicesHandler({ query: { view: 'current' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    const summarySql = String(mockQueryOne.mock.calls[0]?.[0])
    expect(sql).toContain('i.status IN (\'sent\', \'overdue\')')
    expect(summarySql).toContain('COUNT(CASE WHEN status IN (\'sent\', \'overdue\') THEN 1 END) as current')
    expect(summarySql).toContain('aging_30_amount')
    expect(summarySql).toContain('CURRENT_DATE - INTERVAL \'60 days\'')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 50, 'current'])
  })

  it('returns billing history as paid invoices with recent paid sorting', async () => {
    mockQueryOne.mockResolvedValueOnce({
      total: '4',
      paid: '2',
      sent: '1',
      overdue: '1',
      current: '2',
      history: '2',
      aging_current_count: '1',
      aging_30_count: '1',
      aging_60_count: '0',
      aging_90_count: '0',
      total_billed: '8000',
      total_paid: '5000',
      total_outstanding: '3000',
      aging_current_amount: '1000',
      aging_30_amount: '2000',
      aging_60_amount: '0',
      aging_90_amount: '0'
    })

    const result = await invoicesHandler({ query: { view: 'history', limit: '25' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('i.status = \'paid\'')
    expect(sql).toContain('CASE WHEN $3 = \'history\' THEN i.paid_date END DESC NULLS LAST')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 25, 'history'])
    expect(result.summary).toMatchObject({
      current: 2,
      history: 2,
      totalPaid: 5000,
      totalOutstanding: 3000,
      aging: {
        current: { count: 1, amount: 1000 },
        thirty: { count: 1, amount: 2000 },
        sixty: { count: 0, amount: 0 },
        ninetyPlus: { count: 0, amount: 0 }
      }
    })
  })
})
