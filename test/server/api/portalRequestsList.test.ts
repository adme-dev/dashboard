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

const { default: requestsHandler } = await import(
  '../../../../server/api/portal/requests/index.get'
)

describe('portal requests list API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({
      total: '8',
      submitted: '2',
      needs_review: '3',
      in_progress: '4',
      resolved: '2',
      open: '6',
      urgent_open: '1',
      job_requests: '5',
      support_tickets: '3'
    })
  })

  it('returns enterprise request summary counts for client-side triage', async () => {
    const result = await requestsHandler({ query: {} })

    expect(result.summary).toEqual({
      total: 8,
      submitted: 2,
      needsReview: 3,
      inProgress: 4,
      resolved: 2,
      open: 6,
      urgentOpen: 1,
      jobRequests: 5,
      supportTickets: 3
    })
    expect(mockQueryOne.mock.calls[0][0]).toContain('needs_review')
    expect(mockQueryOne.mock.calls[0][0]).toContain('urgent_open')
    expect(mockQueryOne.mock.calls[0][0]).toContain('status NOT IN')
  })

  it('filters open requests without showing completed, closed, or cancelled records', async () => {
    await requestsHandler({ query: { view: 'open', type: 'job_request' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('cr.request_type = $2')
    expect(sql).toContain('cr.status NOT IN (\'completed\', \'closed\', \'cancelled\')')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 'job_request', 50])
  })

  it('filters resolved requests for completed client-visible history', async () => {
    await requestsHandler({ query: { view: 'resolved', limit: '25' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('cr.status IN (\'completed\', \'closed\')')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 25])
  })
})
