import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  setResponseStatus: (event: TestEvent, status: number) => void
  createError: (input: unknown) => unknown
}

interface TestEvent {
  params?: Record<string, string>
  body?: unknown
  responseStatus?: number
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.readBody = async event => event.body
testGlobal.setResponseStatus = (event, status) => {
  event.responseStatus = status
}
testGlobal.createError = input => input

const mockRequireWriteAccess = vi.fn()
const mockRequirePermission = vi.fn()
const mockResolveAccessibleBoard = vi.fn()
const mockResolveKnowledgeSource = vi.fn()
const mockCreateSubmission = vi.fn()
const mockGetSubmissionForBoard = vi.fn()
const mockGetSubmissionReviewDetailForBoard = vi.fn()
const mockListBoardKnowledge = vi.fn()
const mockTransitionSubmission = vi.fn()
const mockEnqueue = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args)
}))

vi.mock('~~/server/utils/boardFiles', () => ({
  resolveAccessibleBoard: (...args: unknown[]) => mockResolveAccessibleBoard(...args)
}))

vi.mock('~~/server/utils/boardKnowledge/repository', () => ({
  resolveKnowledgeSource: (...args: unknown[]) => mockResolveKnowledgeSource(...args),
  createSubmission: (...args: unknown[]) => mockCreateSubmission(...args),
  getSubmissionForBoard: (...args: unknown[]) => mockGetSubmissionForBoard(...args),
  getSubmissionReviewDetailForBoard: (...args: unknown[]) => mockGetSubmissionReviewDetailForBoard(...args),
  listBoardKnowledge: (...args: unknown[]) => mockListBoardKnowledge(...args)
}))

vi.mock('~~/server/utils/boardKnowledge/lifecycle', () => ({
  transitionSubmission: (...args: unknown[]) => mockTransitionSubmission(...args)
}))

vi.mock('~~/server/utils/queue', () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args)
}))

const { default: submitBoardFile } = await import('~~/server/api/agency/boards/[id]/files/[fileId]/knowledge/submit.post')
const { default: submitTaskFile } = await import('~~/server/api/agency/boards/[id]/files/task/[attachmentId]/knowledge/submit.post')
const { default: listKnowledge } = await import('~~/server/api/agency/boards/[id]/knowledge/index.get')
const { default: getKnowledge } = await import('~~/server/api/agency/boards/[id]/knowledge/[submissionId].get')
const { default: retryKnowledge } = await import('~~/server/api/agency/boards/[id]/knowledge/[submissionId]/retry.post')
const { default: approveKnowledge } = await import('~~/server/api/agency/boards/[id]/knowledge/[submissionId]/approve.post')
const { default: rejectKnowledge } = await import('~~/server/api/agency/boards/[id]/knowledge/[submissionId]/reject.post')
const { default: archiveKnowledge } = await import('~~/server/api/agency/boards/[id]/knowledge/[submissionId]/archive.post')

const BOARD_ID = '20000000-0000-4000-8000-000000000002'
const SOURCE_ID = '30000000-0000-4000-8000-000000000003'
const SUBMISSION_ID = '10000000-0000-4000-8000-000000000001'
const USER_ID = '40000000-0000-4000-8000-000000000004'
const UPDATED_AT = '2026-08-04T01:00:00.000Z'

const submission = {
  id: SUBMISSION_ID,
  departmentId: BOARD_ID,
  sourceVersionKey: 'record:source-v1',
  extractionStatus: 'ready',
  reviewStatus: 'pending',
  updatedAt: UPDATED_AT
}

describe('Board Knowledge API', () => {
  beforeEach(() => {
    mockRequireWriteAccess.mockReset().mockResolvedValue({ id: USER_ID, role: 'member' })
    mockRequirePermission.mockReset().mockResolvedValue({ id: USER_ID, role: 'manager' })
    mockResolveAccessibleBoard.mockReset().mockResolvedValue({ id: BOARD_ID, name: 'Finance', slug: 'finance' })
    mockResolveKnowledgeSource.mockReset().mockResolvedValue({
      sourceType: 'board_file', sourceId: SOURCE_ID, departmentId: BOARD_ID,
      fileName: 'policy.pdf', mimeType: 'application/pdf', size: 10,
      storageKey: 'attachments/policy.pdf', checksum: null,
      versionKey: 'record:source-v1', task: null
    })
    mockCreateSubmission.mockReset().mockResolvedValue(submission)
    mockGetSubmissionForBoard.mockReset().mockResolvedValue(submission)
    mockGetSubmissionReviewDetailForBoard.mockReset().mockResolvedValue({
      submission,
      context: { boardName: 'Finance', task: null, submittedBy: null },
      preview: { chunks: [], totalChunks: 0, truncated: false },
      history: []
    })
    mockListBoardKnowledge.mockReset().mockResolvedValue([submission])
    mockTransitionSubmission.mockReset().mockResolvedValue(submission)
    mockEnqueue.mockReset().mockResolvedValue(true)
  })

  it.each([
    ['board file', submitBoardFile, { id: BOARD_ID, fileId: SOURCE_ID }, 'board_file'],
    ['task attachment', submitTaskFile, { id: BOARD_ID, attachmentId: SOURCE_ID }, 'task_attachment']
  ])('submits an indexable %s with board and write admission', async (_label, handler, params, sourceType) => {
    const event: TestEvent = { params }
    const result = await handler(event as never)

    expect(mockRequireWriteAccess).toHaveBeenCalledWith(event)
    expect(mockResolveAccessibleBoard).toHaveBeenCalledWith(event, BOARD_ID)
    expect(mockResolveKnowledgeSource).toHaveBeenCalledWith(BOARD_ID, sourceType, SOURCE_ID)
    expect(mockCreateSubmission).toHaveBeenCalledWith(expect.objectContaining({ submittedBy: USER_ID }))
    expect(mockEnqueue).toHaveBeenCalledWith(event, 'knowledge.extract', {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: 'record:source-v1'
    })
    expect(event.responseStatus).toBe(202)
    expect(result).toMatchObject({ accepted: true, queued: true })
  })

  it('lists and reads knowledge only through board-scoped repository calls', async () => {
    await expect(listKnowledge({ params: { id: BOARD_ID } } as never)).resolves.toMatchObject({ submissions: [submission] })
    await expect(getKnowledge({ params: { id: BOARD_ID, submissionId: SUBMISSION_ID } } as never)).resolves.toMatchObject({ submission })
    expect(mockGetSubmissionReviewDetailForBoard).toHaveBeenCalledWith(SUBMISSION_ID, BOARD_ID)
  })

  it('returns a board-scoped 404 without leaking inaccessible submission metadata', async () => {
    mockGetSubmissionReviewDetailForBoard.mockResolvedValue(null)
    await expect(getKnowledge({ params: { id: BOARD_ID, submissionId: SUBMISSION_ID } } as never))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Knowledge submission not found' })
  })

  it('keeps unsupported legacy documents stored but refuses knowledge submission', async () => {
    mockResolveKnowledgeSource.mockResolvedValue({
      sourceType: 'board_file', sourceId: SOURCE_ID, departmentId: BOARD_ID,
      fileName: 'legacy.doc', mimeType: 'application/msword', size: 10,
      storageKey: 'attachments/legacy.doc', checksum: null,
      versionKey: 'record:source-v1', task: null
    })
    await expect(submitBoardFile({ params: { id: BOARD_ID, fileId: SOURCE_ID } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateSubmission).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it.each([
    ['retry', retryKnowledge, 'retry', 'knowledge.extract'],
    ['approve', approveKnowledge, 'approve', 'knowledge.index'],
    ['archive', archiveKnowledge, 'archive', 'knowledge.index']
  ])('%s requires MANAGEMENT and dispatches the governed transition', async (_label, handler, action, queueType) => {
    const event: TestEvent = {
      params: { id: BOARD_ID, submissionId: SUBMISSION_ID },
      body: { expectedUpdatedAt: UPDATED_AT }
    }
    await handler(event as never)

    expect(mockResolveAccessibleBoard).toHaveBeenCalledWith(event, BOARD_ID)
    expect(mockRequirePermission).toHaveBeenCalledWith(event, 'MANAGEMENT')
    expect(mockTransitionSubmission).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: SUBMISSION_ID,
      departmentId: BOARD_ID,
      actorId: USER_ID,
      action,
      expectedUpdatedAt: UPDATED_AT
    }))
    expect(mockEnqueue).toHaveBeenCalledWith(event, queueType, expect.objectContaining({ submissionId: SUBMISSION_ID }))
  })

  it('routes an approved indexing failure back to the indexing queue on retry', async () => {
    mockTransitionSubmission.mockResolvedValueOnce({
      ...submission,
      reviewStatus: 'approved',
      extractionStatus: 'ready',
      indexStatus: 'queued'
    })
    const event: TestEvent = {
      params: { id: BOARD_ID, submissionId: SUBMISSION_ID },
      body: { expectedUpdatedAt: UPDATED_AT }
    }

    await retryKnowledge(event as never)

    expect(mockEnqueue).toHaveBeenCalledWith(event, 'knowledge.index', expect.objectContaining({
      submissionId: SUBMISSION_ID
    }))
  })

  it('requires a bounded rejection reason', async () => {
    const base = { params: { id: BOARD_ID, submissionId: SUBMISSION_ID } }
    await expect(rejectKnowledge({ ...base, body: { expectedUpdatedAt: UPDATED_AT, reason: '' } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(rejectKnowledge({ ...base, body: { expectedUpdatedAt: UPDATED_AT, reason: 'x'.repeat(2001) } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('preserves stale transition conflicts from the lifecycle state machine', async () => {
    mockTransitionSubmission.mockRejectedValue({
      statusCode: 409,
      statusMessage: 'Knowledge submission changed; refresh and try again'
    })
    await expect(approveKnowledge({
      params: { id: BOARD_ID, submissionId: SUBMISSION_ID },
      body: { expectedUpdatedAt: UPDATED_AT }
    } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})
