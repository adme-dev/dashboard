import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

interface TestEvent {
  params?: Record<string, string>
  body?: Record<string, unknown>
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = opts => Object.assign(new Error(opts.statusMessage), opts)

const mockRequireAuth = vi.fn()
const mockConvertBriefToProject = vi.fn()
const mockMaybeAcknowledgeBrief = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/briefConversion', () => ({
  convertBriefToProject: (...args: unknown[]) => mockConvertBriefToProject(...args),
}))

vi.mock('~~/server/utils/automation/actionedConfirmationRunner', () => ({
  maybeAcknowledgeBrief: (...args: unknown[]) => mockMaybeAcknowledgeBrief(...args),
}))

const { default: handler } = await import('../../../server/api/agency/briefs/[id]/convert.post')

describe('POST /api/agency/briefs/:id/convert', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset().mockResolvedValue({ id: 'user-1' })
    mockConvertBriefToProject.mockReset()
    mockMaybeAcknowledgeBrief.mockReset().mockResolvedValue(undefined)
  })

  it('returns P2 budget allocation and gatekeeper metadata from conversion', async () => {
    mockConvertBriefToProject.mockResolvedValueOnce({
      project: { id: 'project-1', name: 'Winter Campaign' },
      tasksCreated: 3,
      budgetAllocationsCreated: 1,
      gatekeeper: {
        ok: true,
        gaps: [{ field: 'budgetAllocation', severity: 'required', message: 'Confirm split.' }],
        proposals: [{ field: 'budgetAllocation', proposedValue: { amount: 700 }, rationale: 'Derived from brief.' }],
      },
    })

    const result = await handler({
      params: { id: 'brief-1' },
      body: { projectName: 'Winter Campaign', startDate: '2026-07-01' },
    })

    expect(mockConvertBriefToProject).toHaveBeenCalledWith({
      briefId: 'brief-1',
      userId: 'user-1',
      projectTemplateId: null,
      projectName: 'Winter Campaign',
      startDate: '2026-07-01',
      clientId: null,
    })
    expect(mockMaybeAcknowledgeBrief).toHaveBeenCalledWith('brief-1')
    expect(result).toMatchObject({
      success: true,
      project: { id: 'project-1', name: 'Winter Campaign' },
      tasksCreated: 3,
      budgetAllocationsCreated: 1,
      gatekeeper: {
        ok: true,
        gaps: [{ field: 'budgetAllocation', severity: 'required' }],
      },
    })
  })

  it('defaults optional P2 metadata when older conversion results omit it', async () => {
    mockConvertBriefToProject.mockResolvedValueOnce({
      project: { id: 'project-2', name: 'Plain Project' },
      tasksCreated: 0,
    })

    const result = await handler({ params: { id: 'brief-2' }, body: {} })

    expect(result.budgetAllocationsCreated).toBe(0)
    expect(result.gatekeeper).toBeNull()
  })
})
