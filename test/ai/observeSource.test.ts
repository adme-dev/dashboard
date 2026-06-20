import { describe, it, expect, vi, type Mock } from 'vitest'
import { createWorkEventSource, isSensitiveKind, type ObserveDb } from '~~/server/utils/ai/observe/source'

type Row = Record<string, unknown>

describe('isSensitiveKind', () => {
  it('flags approval / sign-off / rejection actions', () => {
    expect(isSensitiveKind('proof.approved')).toBe(true)
    expect(isSensitiveKind('proof.rejected')).toBe(true)
    expect(isSensitiveKind('task.approval_requested')).toBe(true)
    expect(isSensitiveKind('proof.changes_requested')).toBe(true)
  })
  it('flags finance/spend-shaped AI actions', () => {
    expect(isSensitiveKind('ai.approve_budget_change')).toBe(true)
    expect(isSensitiveKind('ai.generate_eom_invoices')).toBe(true)
    expect(isSensitiveKind('ai.record_expense')).toBe(true)
  })
  it('does not flag ordinary work actions', () => {
    expect(isSensitiveKind('task.status_change')).toBe(false)
    expect(isSensitiveKind('crm.note')).toBe(false)
    expect(isSensitiveKind('proof.comment_added')).toBe(false)
    expect(isSensitiveKind('ai.search_tasks')).toBe(false)
  })
})

describe('createWorkEventSource.recentEvents', () => {
  const mkDb = (byTable: Record<string, Row[]>): ObserveDb => ({
    queryRows: vi.fn(async (sql: string) => {
      if (sql.includes('task_activities')) return byTable.task ?? []
      if (sql.includes('crm_activities')) return byTable.crm ?? []
      if (sql.includes('proof_activities')) return byTable.proof ?? []
      if (sql.includes('ai_action_audit')) return byTable.ai ?? []
      return []
    }) as ObserveDb['queryRows']
  })

  it('merges all streams, normalizes kinds, sorts ascending by time, marks sensitive', async () => {
    const db = mkDb({
      task: [{ kind: 'task.status_change', at: '2026-06-15T09:05:00Z', entity_type: 'task', entity_id: 't1' }],
      crm: [{ kind: 'crm.note', at: '2026-06-15T09:00:00Z', entity_type: 'person', entity_id: 'p1' }],
      proof: [{ kind: 'proof.approved', at: '2026-06-15T09:10:00Z', entity_type: 'proof', entity_id: 'pr1' }],
      ai: [{ kind: 'ai.search_tasks', at: '2026-06-15T09:02:00Z', entity_type: 'ai_action', entity_id: 'a1' }]
    })
    const out = await createWorkEventSource(db).recentEvents('u1', '2026-06-01T00:00:00Z', 100)
    expect(out.map(e => e.kind)).toEqual(['crm.note', 'ai.search_tasks', 'task.status_change', 'proof.approved'])
    expect(out.every(e => e.userId === 'u1')).toBe(true)
    expect(out.find(e => e.kind === 'proof.approved')!.sensitive).toBe(true)
    expect(out.find(e => e.kind === 'crm.note')!.sensitive).toBe(false)
    expect(out.find(e => e.kind === 'task.status_change')!.entityId).toBe('t1')
  })

  it('caps the merged result at the limit (after merge, not per-table)', async () => {
    const many = (k: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ kind: k, at: `2026-06-15T09:${String(i).padStart(2, '0')}:00Z`, entity_type: 't', entity_id: `${i}` }))
    const db = mkDb({ task: many('task.status_change', 4), crm: many('crm.note', 4) })
    const out = await createWorkEventSource(db).recentEvents('u1', '2026-06-01T00:00:00Z', 5)
    expect(out).toHaveLength(5)
  })

  it('returns [] for an empty user id without querying', async () => {
    const db = mkDb({})
    const out = await createWorkEventSource(db).recentEvents('', '2026-06-01T00:00:00Z', 100)
    expect(out).toEqual([])
    expect(db.queryRows).not.toHaveBeenCalled()
  })

  it('passes the user id and watermark into every per-table query (user-scoped)', async () => {
    const db = mkDb({})
    await createWorkEventSource(db).recentEvents('u-42', '2026-06-10T00:00:00Z', 50)
    for (const call of (db.queryRows as unknown as Mock).mock.calls) {
      expect(call[1][0]).toBe('u-42')
      expect(call[1][1]).toBe('2026-06-10T00:00:00Z')
    }
  })
})
