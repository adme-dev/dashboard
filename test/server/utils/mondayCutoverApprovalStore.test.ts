import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MondayCutoverApprovalConflictError,
  approveMondayCutoverArtifact,
  getMondayCutoverApprovalArtifact,
  saveMondayCutoverApprovalDraft
} from '~~/server/utils/mondayCutoverApproval'

const mockQueryOne = vi.fn()
const mockTransaction = vi.fn()
const mockTxQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const actorId = '5fa2bd72-b3bf-4ef8-b490-1715e667a4cc'
const artifactId = 'b35cf54c-ee29-41af-8541-25c2e6698c75'
const targetBoardId = '86054ef6-6454-46fb-9002-1ba4d8d060b8'
const planFingerprint = 'a'.repeat(64)
const resolutions = {
  clients: [],
  columns: [{
    sourceColumnId: 'notes',
    decision: 'exclude' as const,
    reason: 'Exclude legacy notes after the governed privacy review.'
  }],
  placement: null
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: artifactId,
    source_board_id: '18422459929',
    target_board_id: targetBoardId,
    revision: 1,
    state: 'draft',
    resolutions,
    plan_fingerprint: planFingerprint,
    created_by: actorId,
    updated_by: actorId,
    approved_by: null,
    approval_reason: null,
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
    approved_at: null,
    ...overrides
  }
}

describe('Monday cutover approval persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockTxQuery }) => unknown) => (
      callback({ query: mockTxQuery })
    ))
  })

  it('loads and validates an exact source/target artifact', async () => {
    mockQueryOne.mockResolvedValue(row())

    await expect(getMondayCutoverApprovalArtifact('18422459929', targetBoardId)).resolves.toEqual({
      id: artifactId,
      sourceBoardId: '18422459929',
      targetBoardId,
      revision: 1,
      state: 'draft',
      resolutions,
      planFingerprint,
      createdBy: actorId,
      updatedBy: actorId,
      approvedBy: null,
      approvalReason: null,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
      approvedAt: null
    })
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('source_board_id = $1'), [
      '18422459929', targetBoardId
    ])
  })

  it('normalizes Postgres Date timestamps from the Hyperdrive driver', async () => {
    mockQueryOne.mockResolvedValue(row({
      created_at: new Date('2026-07-18T00:00:00.000Z'),
      updated_at: new Date('2026-07-18T01:00:00.000Z')
    }))

    await expect(getMondayCutoverApprovalArtifact('18422459929', targetBoardId)).resolves.toEqual(
      expect.objectContaining({
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T01:00:00.000Z'
      })
    )
  })

  it('atomically creates revision one and an append-only save audit event', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [row()] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await saveMondayCutoverApprovalDraft({
      sourceBoardId: '18422459929',
      targetBoardId,
      expectedRevision: null,
      resolutions,
      planFingerprint,
      actorId
    })

    expect(result.revision).toBe(1)
    expect(mockTxQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO monday_cutover_approval_artifacts'), expect.arrayContaining([
      '18422459929', targetBoardId, JSON.stringify(resolutions), planFingerprint, actorId
    ]))
    expect(mockTxQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO monday_cutover_approval_audit'), expect.arrayContaining([
      artifactId, 1, 'saved', actorId, expect.stringMatching(/^[a-f0-9]{64}$/), planFingerprint
    ]))
  })

  it('rejects a stale draft revision without writing an audit event', async () => {
    mockTxQuery.mockResolvedValueOnce({ rows: [] })

    await expect(saveMondayCutoverApprovalDraft({
      sourceBoardId: '18422459929',
      targetBoardId,
      expectedRevision: 3,
      resolutions,
      planFingerprint,
      actorId
    })).rejects.toBeInstanceOf(MondayCutoverApprovalConflictError)
    expect(mockTxQuery).toHaveBeenCalledTimes(1)
  })

  it('atomically approves only the expected draft and records the evidence hashes', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [row({
        revision: 2,
        state: 'approved',
        approved_by: actorId,
        approval_reason: 'Approved against the current production dry-run.',
        approved_at: '2026-07-18T01:00:00.000Z'
      })] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await approveMondayCutoverArtifact({
      sourceBoardId: '18422459929',
      targetBoardId,
      expectedRevision: 1,
      planFingerprint,
      actorId,
      reason: 'Approved against the current production dry-run.'
    })

    expect(result).toEqual(expect.objectContaining({ revision: 2, state: 'approved', approvedBy: actorId }))
    expect(mockTxQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('state = \'draft\''), expect.arrayContaining([
      '18422459929', targetBoardId, 1, planFingerprint, actorId,
      'Approved against the current production dry-run.'
    ]))
    expect(mockTxQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO monday_cutover_approval_audit'), expect.arrayContaining([
      artifactId, 2, 'approved', actorId, expect.stringMatching(/^[a-f0-9]{64}$/), planFingerprint
    ]))
  })
})
