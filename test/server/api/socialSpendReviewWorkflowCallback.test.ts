import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  body?: unknown
}

const mockQueryRows = vi.fn()
const mockBuildPacingReview = vi.fn()
const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/socialSpendPacingReview', () => ({
  PACING_REVIEW_SELECT_COLUMNS: 'ms.id, ms.period, ms.platform',
  buildPacingReview: (...args: unknown[]) => mockBuildPacingReview(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name],
  readBody: async (event: TestEvent) => event.body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const oldEnv = { ...process.env }

const { default: handler } = await import('../../../server/api/internal/workflows/social-spend/review.post')
const workflowCallback = handler as (event: TestEvent) => Promise<unknown>

describe('social spend review workflow callback', () => {
  beforeEach(() => {
    process.env = {
      ...oldEnv,
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_CALLBACK_SECRET: 'workflow-secret'
    }
    vi.clearAllMocks()
    mockQueryRows.mockResolvedValue([{ id: 'spend-1', period: '2026-07', platform: 'meta' }])
    mockBuildPacingReview.mockReturnValue({
      period: '2026-07',
      items: [{ id: 'item-1' }],
      summary: { criticalCount: 1, warningCount: 0, infoCount: 0 }
    })
  })

  it('requires the workflow callback secret before touching spend review state', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'wrong' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 401 })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockBuildPacingReview).not.toHaveBeenCalled()
  })

  it('stays inert while agency workflows are disabled', async () => {
    process.env.AGENCY_WORKFLOWS_ENABLED = 'false'

    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 503 })

    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('runs a read-only spend pacing review for the requested client scope', async () => {
    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toEqual({
      ok: true,
      workflow: 'social.spend.review',
      period: '2026-07',
      scope: 'client',
      clientId: 'client-1',
      platform: 'all',
      result: {
        ok: true,
        itemCount: 1,
        summary: { criticalCount: 1, warningCount: 0, infoCount: 0 }
      }
    })
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('AND ms.client_id = $2'),
      ['2026-07', 'client-1']
    )
    expect(mockBuildPacingReview).toHaveBeenCalledWith(
      [{ id: 'spend-1', period: '2026-07', platform: 'meta' }],
      expect.objectContaining({ period: '2026-07' })
    )
    expect(mockConsoleInfo).toHaveBeenCalledWith(
      'agency-workflows.social-spend.review.completed',
      expect.objectContaining({ period: '2026-07', scope: 'client', clientId: 'client-1', itemCount: 1 })
    )
  })

  it('rejects malformed workflow payloads', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: { kind: 'social.spend.review', period: '2026-07', scope: 'client', trigger: 'cron' }
    })).rejects.toMatchObject({ statusCode: 400 })

    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})

function validPayload() {
  return {
    kind: 'social.spend.review',
    period: '2026-07',
    scope: 'client',
    clientId: 'client-1',
    trigger: 'manual'
  }
}
