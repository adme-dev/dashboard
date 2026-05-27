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

const { default: approvalsHandler } = await import(
  '../../../../server/api/portal/approvals/index.get'
)

describe('portal approvals list API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({
      total: '8',
      pending: '3',
      overdue: '1',
      due_soon: '2',
      approved: '4',
      rejected: '1',
      revision_requested: '2'
    })
  })

  it('returns approval triage summary counts', async () => {
    const result = await approvalsHandler({ query: {} })

    expect(result.summary).toEqual({
      total: 8,
      pending: 3,
      overdue: 1,
      dueSoon: 2,
      approved: 4,
      rejected: 1,
      revisionRequested: 2
    })

    const sql = String(mockQueryOne.mock.calls[0]?.[0])
    expect(sql).toContain('ca.due_date < CURRENT_DATE')
    expect(sql).toContain('ca.due_date <= CURRENT_DATE + INTERVAL \'7 days\'')
  })

  it('filters approvals by status for client history', async () => {
    await approvalsHandler({ query: { status: 'revision_requested', limit: '25' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('ca.status = $2')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 'revision_requested', 25])
  })
})
