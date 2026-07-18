import { describe, expect, it } from 'vitest'
import {
  MondayCutoverExecutionCommandSchema,
  MondayCutoverExecutionValidationError,
  MondayCutoverRollbackCommandSchema,
  buildMondayCutoverExecutionConfirmation,
  buildMondayCutoverRollbackConfirmation,
  buildMondayCutoverTaskDrafts
} from '~~/server/utils/mondayCutoverExecution'

const sourceBoardId = '18422459929'
const targetBoardId = '86054ef6-6454-46fb-9002-1ba4d8d060b8'
const targetGroupId = '90fa5900-e221-4ae6-b003-6f804ec3b8c6'

function plan() {
  return {
    mode: 'dry_run' as const,
    source: { boardId: sourceBoardId },
    target: { boardId: targetBoardId },
    placement: {
      targetGroupId,
      targetGroupName: 'P2 — Native rollout work cutover',
      status: 'applied' as const
    },
    columnMappings: [
      { sourceColumnId: 'go_live', destination: 'task.dueDate', action: 'import' as const },
      { sourceColumnId: 'notes', destination: 'task.description', action: 'import' as const },
      { sourceColumnId: 'token', destination: 'measurementCredential', action: 'exclude' as const }
    ],
    records: [
      {
        sourceId: '1001',
        parentSourceId: null,
        title: 'Big Garage Subaru',
        sourceUpdatedAt: '2026-07-18T00:00:00Z',
        action: 'create' as const,
        match: { strategy: 'none' as const, targetTaskId: null },
        clientLink: {
          status: 'resolved' as const,
          clientId: '436e159b-d053-4de2-ad0e-e589b938ced7',
          clientName: 'Big Garage Subaru'
        }
      },
      {
        sourceId: '1101',
        parentSourceId: '1001',
        title: 'Verify shared event identity',
        sourceUpdatedAt: '2026-07-18T01:00:00Z',
        action: 'create' as const,
        match: { strategy: 'none' as const, targetTaskId: null },
        clientLink: { status: 'not_applicable' as const, clientId: null, clientName: null }
      }
    ],
    summary: { blockingExceptions: 0, isReadyForImport: true }
  }
}

const sourceRecords = [
  {
    id: '1001',
    parentSourceId: null,
    updatedAt: '2026-07-18T00:00:00Z',
    groupId: 'source-group',
    groupTitle: 'Group Title',
    columnTexts: {
      go_live: '2026-07-31',
      notes: 'Approved operational context only.',
      token: 'must-never-be-imported'
    }
  },
  {
    id: '1101',
    parentSourceId: '1001',
    updatedAt: '2026-07-18T01:00:00Z',
    groupId: null,
    groupTitle: null,
    columnTexts: { notes: 'Verify browser/server event_id equality.' }
  }
]

describe('Monday cutover execution contract', () => {
  it('requires a bounded idempotency key, approved revision, fingerprint, reason, and exact confirmation', () => {
    const confirmation = buildMondayCutoverExecutionConfirmation(sourceBoardId, targetBoardId)
    expect(MondayCutoverExecutionCommandSchema.parse({
      targetBoardId,
      expectedArtifactRevision: 4,
      expectedPlanFingerprint: 'a'.repeat(64),
      idempotencyKey: '0f0f627f-5b8d-4ac3-8bdd-a102ce300ed7',
      confirmation,
      reason: 'Execute the approved client rollout mapping into Zero.'
    })).toEqual(expect.objectContaining({ confirmation }))

    expect(MondayCutoverExecutionCommandSchema.safeParse({
      targetBoardId,
      expectedArtifactRevision: 4,
      expectedPlanFingerprint: 'not-a-fingerprint',
      idempotencyKey: 'not-a-uuid',
      confirmation: 'execute it',
      reason: 'short'
    }).success).toBe(false)
  })

  it('builds parent-first drafts and inherits the approved client link for subtasks', () => {
    const drafts = buildMondayCutoverTaskDrafts({ plan: plan(), sourceRecords })

    expect(drafts).toEqual([
      expect.objectContaining({
        sourceId: '1001',
        parentSourceId: null,
        targetGroupId,
        clientId: '436e159b-d053-4de2-ad0e-e589b938ced7',
        clientName: 'Big Garage Subaru',
        dueDate: '2026-07-31',
        description: 'Approved operational context only.',
        sortOrder: 0
      }),
      expect.objectContaining({
        sourceId: '1101',
        parentSourceId: '1001',
        targetGroupId,
        clientId: '436e159b-d053-4de2-ad0e-e589b938ced7',
        clientName: 'Big Garage Subaru',
        dueDate: null,
        description: 'Verify browser/server event_id equality.',
        sortOrder: 1
      })
    ])
    expect(JSON.stringify(drafts)).not.toContain('must-never-be-imported')
  })

  it('fails closed for stale snapshots, invalid dates, and unapproved placement', () => {
    expect(() => buildMondayCutoverTaskDrafts({
      plan: plan(),
      sourceRecords: [{ ...sourceRecords[0]!, updatedAt: '2026-07-18T00:01:00Z' }, sourceRecords[1]!]
    })).toThrow(MondayCutoverExecutionValidationError)

    expect(() => buildMondayCutoverTaskDrafts({
      plan: plan(),
      sourceRecords: [{
        ...sourceRecords[0]!,
        columnTexts: { ...sourceRecords[0]!.columnTexts, go_live: 'not-a-date' }
      }, sourceRecords[1]!]
    })).toThrow('Invalid approved due date')

    expect(() => buildMondayCutoverTaskDrafts({
      plan: { ...plan(), placement: { targetGroupId: null, targetGroupName: null, status: 'pending' as const } },
      sourceRecords
    })).toThrow('approved target placement')
  })

  it('requires an exact run-bound rollback confirmation and fingerprint', () => {
    const runId = '2325bc08-5995-44b8-a89d-b651bce1c507'
    const confirmation = buildMondayCutoverRollbackConfirmation(runId)

    expect(MondayCutoverRollbackCommandSchema.parse({
      targetBoardId,
      expectedPlanFingerprint: 'a'.repeat(64),
      confirmation,
      reason: 'Rollback the controlled drill after confirming no task edits.'
    })).toEqual(expect.objectContaining({ confirmation }))

    expect(MondayCutoverRollbackCommandSchema.safeParse({
      targetBoardId,
      expectedPlanFingerprint: 'bad',
      confirmation: 'ROLLBACK',
      reason: 'short'
    }).success).toBe(false)
  })
})
