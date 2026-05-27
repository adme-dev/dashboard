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

const { default: briefsHandler } = await import(
  '../../../../server/api/portal/briefs/index.get'
)

describe('portal briefs list API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'brief-1',
        template_id: 'template-1',
        reference_number: 'BR-001',
        title: 'Landing page brief',
        submitted_by_name: 'Jane Client',
        submitted_by_email: 'jane@example.com',
        status: 'submitted',
        priority: 'urgent',
        requested_deadline: '2026-06-10',
        source: 'portal',
        created_at: '2026-05-28T00:00:00Z',
        submitted_at: '2026-05-28T00:00:00Z',
        completed_at: null,
        template_name: 'Landing Page',
        template_slug: 'landing-page',
        template_icon: 'i-lucide-file-text',
        category_id: 'cat-1',
        category_name: 'Web',
        category_icon: 'i-lucide-globe',
        category_color: '#3366ff',
        assignee_name: 'Agency User',
        comment_count: '2'
      }
    ])
    mockQueryOne.mockResolvedValue({
      total: '8',
      draft: '1',
      submitted: '2',
      needs_info: '1',
      in_progress: '3',
      completed: '2',
      urgent: '1',
      overdue: '1',
      due_soon: '2',
      submitted_last_30: '4',
      avg_completion_days: '6.4'
    })
  })

  it('returns briefing health summary and client-scoped briefs', async () => {
    const result = await briefsHandler({ query: { status: 'submitted', limit: '25' } })

    expect(result.briefs[0]).toMatchObject({
      id: 'brief-1',
      referenceNumber: 'BR-001',
      title: 'Landing page brief',
      status: 'submitted',
      priority: 'urgent',
      requestedDeadline: '2026-06-10',
      assigneeName: 'Agency User',
      commentCount: 2
    })
    expect(result.summary).toEqual({
      total: 8,
      draft: 1,
      submitted: 2,
      needsInfo: 1,
      inProgress: 3,
      completed: 2,
      urgent: 1,
      overdue: 1,
      dueSoon: 2,
      submittedLast30: 4,
      averageCompletionDays: 6
    })

    const listSql = String(mockQueryRows.mock.calls[0]?.[0])
    const summarySql = String(mockQueryOne.mock.calls[0]?.[0])
    expect(listSql).toContain('b.client_id = $1')
    expect(listSql).toContain('b.status = $2')
    expect(summarySql).toContain('needs_info')
    expect(summarySql).toContain('requested_deadline < CURRENT_DATE')
    expect(summarySql).toContain('avg_completion_days')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 'submitted', 25])
  })
})
