import { describe, expect, it } from 'vitest'
import {
  MondayCutoverApprovalCommandSchema,
  MondayCutoverApprovalDraftSchema,
  fingerprintMondayCutoverPlan,
  hashMondayCutoverResolutions
} from '~~/server/utils/mondayCutoverApproval'

const targetBoardId = '86054ef6-6454-46fb-9002-1ba4d8d060b8'
const targetGroupId = '90fa5900-e221-4ae6-b003-6f804ec3b8c6'
const resolutions = {
  clients: [{
    sourceId: '1001',
    clientId: '436e159b-d053-4de2-ad0e-e589b938ced7',
    reason: 'Approved against the canonical client record.'
  }],
  columns: [{
    sourceColumnId: 'dealer',
    decision: 'import' as const,
    reason: 'Import through the reviewed client links.'
  }],
  placement: {
    targetGroupId,
    reason: 'Place client rollout work in the governed native cutover group.'
  }
}

describe('Monday cutover approval contract', () => {
  it('accepts bounded draft saves with explicit optimistic concurrency', () => {
    expect(MondayCutoverApprovalDraftSchema.parse({
      targetBoardId,
      expectedRevision: null,
      resolutions
    })).toEqual({ targetBoardId, expectedRevision: null, resolutions })

    expect(MondayCutoverApprovalDraftSchema.parse({
      targetBoardId,
      expectedRevision: 7,
      resolutions: { clients: [], columns: [] }
    }).expectedRevision).toBe(7)
  })

  it('rejects unbounded, duplicate, or unexpected draft input', () => {
    expect(MondayCutoverApprovalDraftSchema.safeParse({
      targetBoardId,
      expectedRevision: 0,
      resolutions
    }).success).toBe(false)

    expect(MondayCutoverApprovalDraftSchema.safeParse({
      targetBoardId,
      expectedRevision: null,
      resolutions: {
        clients: [resolutions.clients[0], resolutions.clients[0]],
        columns: []
      }
    }).success).toBe(false)

    expect(MondayCutoverApprovalDraftSchema.safeParse({
      targetBoardId,
      expectedRevision: null,
      resolutions,
      execute: true
    }).success).toBe(false)
  })

  it('defaults legacy draft placement to null and validates governed placement', () => {
    expect(MondayCutoverApprovalDraftSchema.parse({
      targetBoardId,
      expectedRevision: null,
      resolutions: { clients: [], columns: [] }
    }).resolutions.placement).toBeNull()

    expect(MondayCutoverApprovalDraftSchema.safeParse({
      targetBoardId,
      expectedRevision: null,
      resolutions: {
        clients: [],
        columns: [],
        placement: { targetGroupId, reason: 'short' }
      }
    }).success).toBe(false)
  })

  it('requires a revision and a bounded reason to approve', () => {
    expect(MondayCutoverApprovalCommandSchema.parse({
      targetBoardId,
      expectedRevision: 3,
      reason: 'Reviewed against the current production dry-run.'
    })).toEqual({
      targetBoardId,
      expectedRevision: 3,
      reason: 'Reviewed against the current production dry-run.'
    })

    expect(MondayCutoverApprovalCommandSchema.safeParse({
      targetBoardId,
      expectedRevision: 3,
      reason: 'short'
    }).success).toBe(false)
  })

  it('creates deterministic fingerprints that change with plan or resolution evidence', () => {
    const plan = {
      mode: 'dry_run' as const,
      source: { boardId: '18422459929', totalRecords: 36 },
      target: { boardId: targetBoardId, totalRecords: 28 },
      records: [{ sourceId: '1001', sourceUpdatedAt: '2026-07-18T00:00:00Z' }],
      summary: { blockingExceptions: 0, isReadyForImport: true }
    }

    expect(fingerprintMondayCutoverPlan(plan)).toMatch(/^[a-f0-9]{64}$/)
    expect(fingerprintMondayCutoverPlan(plan)).toBe(fingerprintMondayCutoverPlan(structuredClone(plan)))
    expect(fingerprintMondayCutoverPlan({
      ...plan,
      records: [{ sourceId: '1001', sourceUpdatedAt: '2026-07-18T00:01:00Z' }]
    })).not.toBe(fingerprintMondayCutoverPlan(plan))

    expect(hashMondayCutoverResolutions(resolutions)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashMondayCutoverResolutions(resolutions)).not.toBe(hashMondayCutoverResolutions({
      ...resolutions,
      clients: [{ ...resolutions.clients[0]!, reason: 'A different governed rationale.' }]
    }))
  })
})
