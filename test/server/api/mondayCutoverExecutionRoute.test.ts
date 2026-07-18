import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMondayCutoverExecutionConfirmation } from '~~/server/utils/mondayCutoverExecution'

const mockRequireRole = vi.fn()
const mockGetArtifact = vi.fn()
const mockLoadSnapshot = vi.fn()
const mockFingerprint = vi.fn()
const mockPrepareRun = vi.fn()
const mockExecuteRun = vi.fn()
const mockFailRun = vi.fn()

let routerBoardId = '18422459929'
let body: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/mondayCutoverApproval', () => ({
  getMondayCutoverApprovalArtifact: (...args: unknown[]) => mockGetArtifact(...args),
  fingerprintMondayCutoverPlan: (...args: unknown[]) => mockFingerprint(...args)
}))

vi.mock('~~/server/utils/mondayCutoverPlanLoader', () => ({
  MondayCutoverIdentifiersSchema: {
    safeParse: (value: { boardId?: string, targetBoardId?: string }) => (
      /^\d+$/.test(value.boardId ?? '') && /^[0-9a-f-]{36}$/.test(value.targetBoardId ?? '')
        ? { success: true, data: value }
        : { success: false }
    )
  },
  loadMondayCutoverExecutionSnapshot: (...args: unknown[]) => mockLoadSnapshot(...args)
}))

vi.mock('~~/server/utils/mondayCutoverExecutionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/mondayCutoverExecutionStore')>()
  return {
    ...actual,
    prepareMondayCutoverExecutionRun: (...args: unknown[]) => mockPrepareRun(...args),
    executeMondayCutoverRun: (...args: unknown[]) => mockExecuteRun(...args),
    failMondayCutoverExecutionRun: (...args: unknown[]) => mockFailRun(...args)
  }
})

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getRouterParam: () => routerBoardId,
  readBody: () => body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const targetBoardId = '86054ef6-6454-46fb-9002-1ba4d8d060b8'
const artifactId = 'b35cf54c-ee29-41af-8541-25c2e6698c75'
const actorId = '5fa2bd72-b3bf-4ef8-b490-1715e667a4cc'
const runId = '2325bc08-5995-44b8-a89d-b651bce1c507'
const fingerprint = 'a'.repeat(64)
const reason = 'Execute the approved client rollout mapping into Zero.'
const resolutions = {
  clients: [],
  columns: [],
  placement: {
    targetGroupId: '90fa5900-e221-4ae6-b003-6f804ec3b8c6',
    reason: 'Place native client rollout work in the reviewed P2 group.'
  }
}
const artifact = {
  id: artifactId,
  sourceBoardId: '18422459929',
  targetBoardId,
  revision: 4,
  state: 'approved',
  resolutions,
  planFingerprint: fingerprint
}
const plan = {
  mode: 'dry_run',
  source: { boardId: '18422459929' },
  target: { boardId: targetBoardId },
  summary: { sourceRecords: 36, toCreate: 36, blockingExceptions: 0, isReadyForImport: true }
}
const run = {
  id: runId,
  status: 'completed',
  createdTasks: 36,
  reusedTasks: 0,
  excludedRecords: 0
}

describe('POST /api/agency/monday/boards/:boardId/cutover-execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    routerBoardId = '18422459929'
    body = {
      targetBoardId,
      expectedArtifactRevision: 4,
      expectedPlanFingerprint: fingerprint,
      idempotencyKey: '0f0f627f-5b8d-4ac3-8bdd-a102ce300ed7',
      confirmation: buildMondayCutoverExecutionConfirmation('18422459929', targetBoardId),
      reason
    }
    mockRequireRole.mockResolvedValue({ id: actorId, role: 'owner' })
    mockGetArtifact.mockResolvedValue(artifact)
    mockLoadSnapshot.mockResolvedValue({ plan, sourceRecords: [] })
    mockFingerprint.mockReturnValue(fingerprint)
    mockPrepareRun.mockResolvedValue({
      run: { ...run, status: 'prepared' },
      isReplay: false
    })
    mockExecuteRun.mockResolvedValue(run)
    mockFailRun.mockResolvedValue(null)
  })

  it('authenticates first and executes only current approved evidence', async () => {
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-execution.post')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mockGetArtifact).toHaveBeenCalledWith('18422459929', targetBoardId)
    expect(mockLoadSnapshot).toHaveBeenCalledWith({ boardId: '18422459929', targetBoardId, resolutions })
    expect(mockPrepareRun).toHaveBeenCalledWith(expect.objectContaining({
      artifactId,
      artifactRevision: 4,
      planFingerprint: fingerprint,
      actorId,
      reason
    }))
    expect(mockExecuteRun).toHaveBeenCalledWith(expect.objectContaining({ runId, plan, actorId }))
    expect(result).toEqual({
      run,
      evidence: {
        sourceRecords: 36,
        planFingerprint: fingerprint,
        isReplay: false
      }
    })
  })

  it('rejects malformed or inexact confirmation before artifact or provider access', async () => {
    body.confirmation = 'EXECUTE SOMETHING ELSE'
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-execution.post')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover execution confirmation'
    })
    expect(mockGetArtifact).not.toHaveBeenCalled()
    expect(mockLoadSnapshot).not.toHaveBeenCalled()
  })

  it('rejects stale or unapproved evidence without preparing a run', async () => {
    mockGetArtifact.mockResolvedValue({ ...artifact, state: 'draft' })
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-execution.post')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Monday cutover evidence is not approved and current'
    })
    expect(mockLoadSnapshot).not.toHaveBeenCalled()
    expect(mockPrepareRun).not.toHaveBeenCalled()
  })

  it('returns a completed identical idempotent replay without executing again', async () => {
    mockPrepareRun.mockResolvedValue({ run, isReplay: true })
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-execution.post')).default

    const result = await handler({ context: {} } as never)

    expect(result.run).toEqual(run)
    expect(result.evidence.isReplay).toBe(true)
    expect(mockExecuteRun).not.toHaveBeenCalled()
  })
})
