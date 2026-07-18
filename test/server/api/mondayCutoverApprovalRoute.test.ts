import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockLoadPlan = vi.fn()
const mockGetArtifact = vi.fn()
const mockSaveDraft = vi.fn()
const mockApproveArtifact = vi.fn()
const mockFingerprint = vi.fn()

let routerBoardId = '18422459929'
let query: Record<string, unknown> = {
  targetBoardId: '86054ef6-6454-46fb-9002-1ba4d8d060b8'
}
let body: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/mondayCutoverPlanLoader', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/mondayCutoverPlanLoader')>()
  return {
    ...original,
    loadMondayCutoverPlan: (...args: unknown[]) => mockLoadPlan(...args)
  }
})

vi.mock('~~/server/utils/mondayCutoverApproval', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/mondayCutoverApproval')>()
  return {
    ...original,
    getMondayCutoverApprovalArtifact: (...args: unknown[]) => mockGetArtifact(...args),
    saveMondayCutoverApprovalDraft: (...args: unknown[]) => mockSaveDraft(...args),
    approveMondayCutoverArtifact: (...args: unknown[]) => mockApproveArtifact(...args),
    fingerprintMondayCutoverPlan: (...args: unknown[]) => mockFingerprint(...args)
  }
})

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getRouterParam: () => routerBoardId,
  getQuery: () => query,
  readBody: () => body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const targetBoardId = '86054ef6-6454-46fb-9002-1ba4d8d060b8'
const actorId = '5fa2bd72-b3bf-4ef8-b490-1715e667a4cc'
const planFingerprint = 'a'.repeat(64)
const resolutions = {
  clients: [],
  columns: [{
    sourceColumnId: 'notes',
    decision: 'exclude' as const,
    reason: 'Exclude legacy notes after the governed privacy review.'
  }]
}
const plan = {
  mode: 'dry_run',
  source: { boardId: '18422459929' },
  target: { boardId: targetBoardId },
  summary: { blockingExceptions: 0, warningExceptions: 1, isReadyForImport: true }
}
const artifact = {
  id: 'b35cf54c-ee29-41af-8541-25c2e6698c75',
  sourceBoardId: '18422459929',
  targetBoardId,
  revision: 3,
  state: 'draft',
  resolutions,
  planFingerprint,
  createdBy: actorId,
  updatedBy: actorId,
  approvedBy: null,
  approvalReason: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T01:00:00.000Z',
  approvedAt: null
}

describe('Monday cutover approval routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    routerBoardId = '18422459929'
    query = { targetBoardId }
    body = {}
    mockRequireRole.mockResolvedValue({ id: actorId, role: 'owner' })
    mockGetArtifact.mockResolvedValue(artifact)
    mockLoadPlan.mockResolvedValue(plan)
    mockFingerprint.mockReturnValue(planFingerprint)
    mockSaveDraft.mockResolvedValue(artifact)
    mockApproveArtifact.mockResolvedValue({
      ...artifact,
      revision: 4,
      state: 'approved',
      approvedBy: actorId,
      approvalReason: 'Approved against the current production dry-run.',
      approvedAt: '2026-07-18T02:00:00.000Z'
    })
  })

  it('reads the saved artifact and evaluates it against the current no-write plan', async () => {
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-approval.get')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mockGetArtifact).toHaveBeenCalledWith('18422459929', targetBoardId)
    expect(mockLoadPlan).toHaveBeenCalledWith({
      boardId: '18422459929',
      targetBoardId,
      resolutions
    })
    expect(result).toEqual({
      artifact,
      plan,
      evidence: {
        currentPlanFingerprint: planFingerprint,
        isCurrent: true,
        canApprove: true
      }
    })
  })

  it('saves a validated draft bound to the recomputed plan', async () => {
    body = { targetBoardId, expectedRevision: 3, resolutions }
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-approval.put')).default

    const result = await handler({ context: {} } as never)

    expect(mockLoadPlan).toHaveBeenCalledWith({ boardId: '18422459929', targetBoardId, resolutions })
    expect(mockSaveDraft).toHaveBeenCalledWith({
      sourceBoardId: '18422459929',
      targetBoardId,
      expectedRevision: 3,
      resolutions,
      planFingerprint,
      actorId
    })
    expect(result).toEqual(expect.objectContaining({
      artifact,
      evidence: expect.objectContaining({ currentPlanFingerprint: planFingerprint, isCurrent: true })
    }))
  })

  it('rejects malformed saves before provider or persistence access', async () => {
    body = { targetBoardId, expectedRevision: 0, resolutions, execute: true }
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-approval.put')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover approval draft'
    })
    expect(mockLoadPlan).not.toHaveBeenCalled()
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('does not approve a saved artifact while the current plan has blockers', async () => {
    body = {
      targetBoardId,
      expectedRevision: 3,
      reason: 'Approved against the current production dry-run.'
    }
    mockLoadPlan.mockResolvedValue({
      ...plan,
      summary: { blockingExceptions: 2, warningExceptions: 0, isReadyForImport: false }
    })
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-approval/approve.post')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Monday cutover plan still has blocking exceptions'
    })
    expect(mockApproveArtifact).not.toHaveBeenCalled()
  })

  it('approves current ready evidence without exposing an execute or import action', async () => {
    body = {
      targetBoardId,
      expectedRevision: 3,
      reason: 'Approved against the current production dry-run.'
    }
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-approval/approve.post')).default

    const result = await handler({ context: {} } as never)

    expect(mockApproveArtifact).toHaveBeenCalledWith({
      sourceBoardId: '18422459929',
      targetBoardId,
      expectedRevision: 3,
      planFingerprint,
      actorId,
      reason: 'Approved against the current production dry-run.'
    })
    expect(result).toEqual(expect.objectContaining({
      artifact: expect.objectContaining({ state: 'approved', revision: 4 }),
      plan,
      evidence: { currentPlanFingerprint: planFingerprint, isCurrent: true, canApprove: false }
    }))
    expect(JSON.stringify(result)).not.toMatch(/execute|imported|migrationSession/i)
  })
})
