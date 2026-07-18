import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMondayCutoverPlan } from '~~/server/utils/mondayCutoverPlan'
import {
  executeMondayCutoverRun,
  prepareMondayCutoverExecutionRun
} from '~~/server/utils/mondayCutoverExecutionStore'

const mockTransaction = vi.fn()
const mockTxQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const sourceBoardId = '18422459929'
const targetBoardId = '86054ef6-6454-46fb-9002-1ba4d8d060b8'
const targetGroupId = '90fa5900-e221-4ae6-b003-6f804ec3b8c6'
const artifactId = 'b35cf54c-ee29-41af-8541-25c2e6698c75'
const actorId = '5fa2bd72-b3bf-4ef8-b490-1715e667a4cc'
const runId = '2325bc08-5995-44b8-a89d-b651bce1c507'
const idempotencyKey = '0f0f627f-5b8d-4ac3-8bdd-a102ce300ed7'
const fingerprint = 'a'.repeat(64)
const reason = 'Execute the approved client rollout mapping into Zero.'

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    artifact_id: artifactId,
    source_board_id: sourceBoardId,
    target_board_id: targetBoardId,
    artifact_revision: 4,
    plan_fingerprint: fingerprint,
    idempotency_key: idempotencyKey,
    status: 'prepared',
    execute_reason: reason,
    executed_by: actorId,
    created_tasks: 0,
    reused_tasks: 0,
    excluded_records: 0,
    error_code: null,
    rollback_reason: null,
    rollback_by: null,
    prepared_at: '2026-07-18T05:00:00.000Z',
    started_at: null,
    completed_at: null,
    failed_at: null,
    rollback_started_at: null,
    rolled_back_at: null,
    ...overrides
  }
}

function executionPlan() {
  return buildMondayCutoverPlan({
    sourceBoard: {
      id: sourceBoardId,
      name: 'Meta CAPI Rollout',
      state: 'active',
      groups: [{ id: 'source-group', title: 'Group Title' }],
      columns: [
        { id: 'go_live', title: 'Go-Live', type: 'date' },
        { id: 'notes', title: 'Notes', type: 'long_text' }
      ]
    },
    sourceRecords: [
      {
        id: '1001',
        title: 'Big Garage Subaru',
        state: 'active',
        createdAt: '2026-07-17T00:00:00Z',
        updatedAt: '2026-07-18T00:00:00Z',
        parentSourceId: null,
        groupId: 'source-group',
        groupTitle: 'Group Title',
        subitemCount: 1,
        clientHint: 'Big Garage Subaru',
        populatedColumnIds: ['go_live', 'notes']
      },
      {
        id: '1101',
        title: 'Verify shared event identity',
        state: 'active',
        createdAt: '2026-07-17T01:00:00Z',
        updatedAt: '2026-07-18T01:00:00Z',
        parentSourceId: '1001',
        groupId: null,
        groupTitle: null,
        subitemCount: 0,
        clientHint: null,
        populatedColumnIds: ['notes']
      }
    ],
    targetBoard: {
      id: targetBoardId,
      name: 'Meta CAPI Rollout',
      groups: [{ id: targetGroupId, name: 'P2 — Native rollout work cutover' }]
    },
    targetTasks: [],
    clients: [{
      id: '436e159b-d053-4de2-ad0e-e589b938ced7',
      name: 'Big Garage Subaru',
      measurementProfileId: '76970b5d-19f3-4dc3-9a32-532966d44cd4'
    }],
    isSourceTruncated: false,
    resolutions: {
      clients: [],
      columns: [{
        sourceColumnId: 'notes',
        decision: 'import',
        reason: 'Notes were reviewed for operational context only.'
      }],
      placement: {
        targetGroupId,
        reason: 'Place native client rollout work in the reviewed P2 group.'
      }
    }
  })
}

const sourceRecords = [
  {
    id: '1001',
    parentSourceId: null,
    updatedAt: '2026-07-18T00:00:00Z',
    groupId: 'source-group',
    groupTitle: 'Group Title',
    columnTexts: { go_live: '2026-07-31', notes: 'Approved operational context.' }
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

describe('Monday cutover execution persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockTxQuery }) => unknown) => (
      callback({ query: mockTxQuery })
    ))
  })

  it('atomically prepares a unique approval-bound run and audit event', async () => {
    mockTxQuery
      .mockResolvedValueOnce({ rows: [runRow()] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await prepareMondayCutoverExecutionRun({
      artifactId,
      sourceBoardId,
      targetBoardId,
      artifactRevision: 4,
      planFingerprint: fingerprint,
      idempotencyKey,
      actorId,
      reason
    })

    expect(result).toEqual({ run: expect.objectContaining({ id: runId, status: 'prepared' }), isReplay: false })
    expect(mockTxQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO monday_cutover_execution_runs'), [
      artifactId,
      sourceBoardId,
      targetBoardId,
      4,
      fingerprint,
      idempotencyKey,
      reason,
      actorId
    ])
    expect(mockTxQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('monday_cutover_execution_audit'), expect.any(Array))
  })

  it('creates parent and subtask atomically with provenance and approved client values', async () => {
    const taskIds = [
      '3baef6d0-c0c4-4f23-aa3a-0551489f7460',
      'f2298ca4-096b-4e2b-a1a4-90c6230f02f6'
    ]
    const mappingIds = [
      'fa9fd922-3a18-46e8-a7bb-849167a9cb46',
      '962d975c-7915-42c8-84a0-0a2e4747828f'
    ]
    let taskIndex = 0
    let mappingIndex = 0

    mockTxQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes(`SET status = 'executing'`)) return { rows: [runRow({ status: 'executing', started_at: new Date() })] }
      if (sql.includes('FROM monday_cutover_approval_artifacts') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: artifactId }] }
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('FROM task_statuses')) return { rows: [{ id: 'f07b02f2-b79d-4d2e-b6e3-ca22fb7bfa84' }] }
      if (sql.includes('FROM board_groups')) return { rows: [{ id: targetGroupId }] }
      if (sql.includes('FROM custom_columns')) return { rows: [{ id: 'c20f11eb-7286-4254-a9a0-e655729b9da7' }] }
      if (sql.includes('INSERT INTO tasks')) return { rows: [{ id: taskIds[taskIndex++]!, version: 1 }] }
      if (sql.includes('INSERT INTO monday_item_mappings')) return { rows: [{ id: mappingIds[mappingIndex++]! }] }
      if (sql.includes('INSERT INTO task_column_values')) return { rows: [] }
      if (sql.includes('INSERT INTO monday_cutover_execution_items')) return { rows: [] }
      if (sql.includes(`SET status = 'completed'`)) {
        return { rows: [runRow({ status: 'completed', created_tasks: 2, completed_at: new Date() })] }
      }
      if (sql.includes('INSERT INTO monday_cutover_execution_audit')) return { rows: [] }
      throw new Error(`Unexpected SQL in test: ${sql.slice(0, 80)} ${JSON.stringify(params)}`)
    })

    const result = await executeMondayCutoverRun({
      runId,
      artifactId,
      sourceBoardId,
      targetBoardId,
      artifactRevision: 4,
      planFingerprint: fingerprint,
      actorId,
      reason,
      plan: executionPlan(),
      sourceRecords
    })

    expect(result).toEqual(expect.objectContaining({ status: 'completed', createdTasks: 2 }))
    const taskCalls = mockTxQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO tasks'))
    expect(taskCalls).toHaveLength(2)
    expect(taskCalls[0]![1]).toEqual(expect.arrayContaining([null, 'Big Garage Subaru', '2026-07-31']))
    expect(taskCalls[1]![1]).toEqual(expect.arrayContaining([taskIds[0], 'Verify shared event identity']))
    expect(mockTxQuery.mock.calls.some(([sql, params]) => (
      String(sql).includes('INSERT INTO task_column_values')
      && JSON.stringify(params).includes('436e159b-d053-4de2-ad0e-e589b938ced7')
    ))).toBe(true)
    expect(mockTxQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO monday_item_mappings'))).toHaveLength(2)
  })
})
