import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
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

const { default: workloadHandler } = await import(
  '../../../../server/api/agency/reports/workload.get'
)
const { default: projectProgressHandler } = await import(
  '../../../../server/api/agency/reports/project-progress.get'
)

describe('agency reports database schema compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'agency-user-1' })
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/\btm\.status\b/.test(sql)) {
        throw new Error('column tm.status does not exist')
      }
      if (/\b(?:FROM|JOIN)\s+clients\b/.test(sql)) {
        throw new Error('relation "clients" does not exist')
      }
      return []
    })
  })

  it('returns an empty workload report using the active-member and agency-client schema', async () => {
    const result = await workloadHandler({ query: {} })

    expect(result).toEqual({
      members: [],
      summary: {
        totalMembers: 0,
        overloaded: 0,
        optimal: 0,
        underutilized: 0,
        averageUtilization: 0,
        totalEstimatedHours: 0,
        totalActualHours: 0
      },
      byProject: [],
      byDepartment: []
    })
    expect(mockQueryRows).toHaveBeenCalledTimes(3)
  })

  it('returns an empty project progress report using the agency-client schema', async () => {
    const result = await projectProgressHandler({ query: {} })

    expect(result).toEqual({
      projects: [],
      summary: {
        totalProjects: 0,
        onTrack: 0,
        atRisk: 0,
        critical: 0,
        overdue: 0,
        averageProgress: 0
      }
    })
    expect(mockQueryRows).toHaveBeenCalledTimes(2)
  })
})
