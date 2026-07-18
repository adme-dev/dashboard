import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMondayCutoverRollbackConfirmation } from '~~/server/utils/mondayCutoverExecution'

const mockRequireRole = vi.fn()
const mockRollbackRun = vi.fn()

let routerParams: Record<string, string | undefined> = {}
let body: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/mondayCutoverExecutionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/mondayCutoverExecutionStore')>()
  return {
    ...actual,
    rollbackMondayCutoverRun: (...args: unknown[]) => mockRollbackRun(...args)
  }
})

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getRouterParam: (_event: unknown, name: string) => routerParams[name],
  readBody: () => body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const sourceBoardId = '18422459929'
const targetBoardId = '86054ef6-6454-46fb-9002-1ba4d8d060b8'
const actorId = '5fa2bd72-b3bf-4ef8-b490-1715e667a4cc'
const runId = '2325bc08-5995-44b8-a89d-b651bce1c507'
const fingerprint = 'a'.repeat(64)
const reason = 'Rollback the controlled drill after confirming no task edits.'
const run = {
  id: runId,
  status: 'rolled_back',
  planFingerprint: fingerprint,
  createdTasks: 36
}

describe('POST /api/agency/monday/boards/:boardId/cutover-executions/:runId/rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    routerParams = { boardId: sourceBoardId, runId }
    body = {
      targetBoardId,
      expectedPlanFingerprint: fingerprint,
      confirmation: buildMondayCutoverRollbackConfirmation(runId),
      reason
    }
    mockRequireRole.mockResolvedValue({ id: actorId, role: 'owner' })
    mockRollbackRun.mockResolvedValue(run)
  })

  it('authenticates first and rolls back only the exact completed run', async () => {
    const handler = (await import(
      '~~/server/api/agency/monday/boards/[boardId]/cutover-executions/[runId]/rollback.post'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mockRollbackRun).toHaveBeenCalledWith({
      runId,
      sourceBoardId,
      targetBoardId,
      expectedPlanFingerprint: fingerprint,
      actorId,
      reason
    })
    expect(result).toEqual({
      run,
      evidence: { planFingerprint: fingerprint, deletedTasks: 36 }
    })
  })

  it('rejects malformed or inexact confirmation before store access', async () => {
    body.confirmation = 'ROLLBACK SOMETHING ELSE'
    const handler = (await import(
      '~~/server/api/agency/monday/boards/[boardId]/cutover-executions/[runId]/rollback.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover rollback confirmation'
    })
    expect(mockRollbackRun).not.toHaveBeenCalled()
  })

  it('maps modified-task and stale-run conflicts to a non-destructive 409', async () => {
    const { MondayCutoverExecutionConflictError } = await import(
      '~~/server/utils/mondayCutoverExecutionStore'
    )
    mockRollbackRun.mockRejectedValue(new MondayCutoverExecutionConflictError('Task changed'))
    const handler = (await import(
      '~~/server/api/agency/monday/boards/[boardId]/cutover-executions/[runId]/rollback.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Monday cutover rollback evidence conflict'
    })
  })
})
