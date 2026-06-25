import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  query?: Record<string, string>
  params?: Record<string, string>
  body?: Record<string, unknown>
}

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: listTemplates } = await import('~~/server/api/agency/templates/index.get')
const { default: createTemplate } = await import('~~/server/api/agency/templates/index.post')
const { default: useTemplate } = await import('~~/server/api/agency/templates/[id]/use.post')
const { default: updateTemplate } = await import('~~/server/api/agency/templates/[id].put')
const { default: deleteTemplate } = await import('~~/server/api/agency/templates/[id].delete')

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
})

describe('GET /api/agency/templates', () => {
  it('returns canonical template rows with duplicate metadata', async () => {
    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'template-latest',
          name: 'SEO Campaign',
          description: 'Search engine optimisation',
          category: 'SEO',
          tags: ['seo'],
          default_budget_type: 'time_materials',
          default_budget_amount: '6000',
          estimated_duration_days: 90,
          estimated_hours: '80',
          is_public: true,
          times_used: 2,
          last_used_at: null,
          created_at: '2026-03-06T07:17:00.000Z',
          created_by_name: null,
          department_name: null,
          phase_count: '0',
          task_count: '16',
          duplicate_count: '2'
        }
      ])
      .mockResolvedValueOnce([{ category: 'SEO' }])

    const result = await listTemplates({ query: { category: 'all', search: '' } })

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(result).toMatchObject({
      total: 1,
      hiddenDuplicateCount: 1,
      categories: ['SEO'],
      templates: [
        {
          id: 'template-latest',
          name: 'SEO Campaign',
          category: 'SEO',
          duplicateCount: 2,
          taskCount: 16
        }
      ]
    })

    const sql = String(mockQueryRows.mock.calls[0][0])
    expect(sql).toContain('ROW_NUMBER() OVER')
    expect(sql).toContain('duplicate_count')
    expect(sql).toContain('duplicate_rank = 1')
  })
})

describe('project template write routes', () => {
  it('requires write access before creating a template', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'template-1',
      name: 'Template',
      default_budget_amount: 0,
      estimated_hours: 0,
      is_public: true,
      created_at: '2026-06-26T00:00:00.000Z'
    })

    await createTemplate({ body: { name: 'Template' } })

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(mockRequireAuth).not.toHaveBeenCalled()
  })

  it('requires write access before instantiating a template', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'template-1', name: 'Template', estimated_duration_days: 7 })
      .mockResolvedValueOnce({ id: 'client-1', name: 'Client' })
      .mockResolvedValueOnce({
        id: 'project-1',
        name: 'Project',
        client_id: 'client-1',
        status: 'active',
        budget_type: 'time_materials',
        budget_amount: 0,
        start_date: '2026-06-26',
        end_date: '2026-07-03',
        created_at: '2026-06-26T00:00:00.000Z'
      })
      .mockResolvedValue({})
      .mockResolvedValue({})
    mockQueryRows.mockResolvedValueOnce([])

    await useTemplate({
      params: { id: 'template-1' },
      body: { clientId: 'client-1', projectName: 'Project', startDate: '2026-06-26' }
    })

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(mockRequireAuth).not.toHaveBeenCalled()
  })

  it('requires write access before updating or deleting a template', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'template-1' }).mockResolvedValueOnce({
      id: 'template-1',
      name: 'Template',
      default_budget_amount: 0,
      estimated_hours: 0,
      default_hourly_rate: 0,
      is_active: true,
      is_public: true,
      updated_at: '2026-06-26T00:00:00.000Z'
    })

    await updateTemplate({ params: { id: 'template-1' }, body: { name: 'Template' } })

    mockQueryOne.mockResolvedValueOnce({ id: 'template-1', name: 'Template', times_used: 0 })
    mockQueryRows.mockResolvedValue({})
    mockQueryOne.mockResolvedValueOnce({ id: 'template-1' })

    await deleteTemplate({ params: { id: 'template-1' } })

    expect(mockRequireWriteAccess).toHaveBeenCalledTimes(2)
    expect(mockRequireAuth).not.toHaveBeenCalled()
  })
})
