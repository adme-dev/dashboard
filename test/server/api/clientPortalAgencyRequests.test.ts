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

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: requestsHandler } = await import(
  '../../../../server/api/agency/client-portal/requests/index.get'
)

describe('agency client portal requests API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'team-1' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'request-1',
        request_type: 'support_ticket',
        category: 'access',
        title: 'Request access to billing',
        priority: 'normal',
        status: 'submitted',
        assigned_to: null,
        project_id: null,
        estimated_budget: null,
        desired_deadline: null,
        created_at: '2026-05-28T01:00:00Z',
        updated_at: '2026-05-28T01:00:00Z',
        client_name: 'Client One',
        project_name: null,
        assigned_name: null,
        submitted_by_name: 'Jane Client'
      }
    ])
  })

  it('lists filtered client requests for agency triage', async () => {
    const result = await requestsHandler({
      query: {
        clientId: 'client-1',
        type: 'support_ticket',
        status: 'submitted',
        limit: '25'
      }
    })

    expect(mockRequireAuth).toHaveBeenCalledOnce()
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('FROM client_requests cr'),
      ['client-1', 'support_ticket', 'submitted', 25]
    )
    expect(result.requests).toEqual([
      expect.objectContaining({
        id: 'request-1',
        requestType: 'support_ticket',
        category: 'access',
        title: 'Request access to billing',
        clientName: 'Client One',
        submittedByName: 'Jane Client',
        status: 'submitted'
      })
    ])
  })
})
