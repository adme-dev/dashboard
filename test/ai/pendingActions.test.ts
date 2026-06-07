import { describe, it, expect, vi } from 'vitest'
import { executeProposal, loadOpenProposal, type PendingActionDb, type PendingRow } from '~~/server/utils/ai/pendingActions'

const ctx = (role = 'owner', userId = 'u1') => ({ userId, userRole: role, event: {} as any })
const row = (): PendingRow => ({
  id: 'p1', status: 'proposed', tool_name: 'create_task',
  resolved_payload: { title: 'X', departmentId: 'd1' }, user_id: 'u1',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
})

describe('executeProposal', () => {
  it('is idempotent: a second confirm does not re-execute', async () => {
    const db: PendingActionDb = {
      claim: vi.fn().mockResolvedValueOnce(row()).mockResolvedValueOnce(null), // 2nd claim: already executed
      createTask: vi.fn().mockResolvedValue({ id: 't1' }),
      markExecuted: vi.fn().mockResolvedValue(undefined),
    }
    const first = await executeProposal('p1', ctx() as any, db)
    const second = await executeProposal('p1', ctx() as any, db)
    expect(first.ok).toBe(true)
    expect((first as any).data.taskId).toBe('t1')
    expect(db.createTask).toHaveBeenCalledTimes(1)
    expect(second.ok).toBe(false)
  })

  it('rejects a read-only role without claiming or creating', async () => {
    const db: PendingActionDb = {
      claim: vi.fn(), createTask: vi.fn(), markExecuted: vi.fn(),
    }
    const res = await executeProposal('p1', ctx('viewer') as any, db)
    expect(res.ok).toBe(false)
    expect(db.claim).not.toHaveBeenCalled()
    expect(db.createTask).not.toHaveBeenCalled()
  })

  it('rolls back (revertToProposed) and fails when the mutation throws', async () => {
    const db: PendingActionDb = {
      claim: vi.fn().mockResolvedValue(row()),
      createTask: vi.fn().mockRejectedValue(new Error('insert failed')),
      markExecuted: vi.fn(),
      revertToProposed: vi.fn().mockResolvedValue(undefined),
    }
    const res = await executeProposal('p1', ctx() as any, db)
    expect(res.ok).toBe(false)
    expect(db.revertToProposed).toHaveBeenCalledWith('p1')
    expect(db.markExecuted).not.toHaveBeenCalled()
  })

  it('honors the atomic-claim contract: expired / wrong-user → claim returns null → fail (stateful fake)', async () => {
    // Stateful fake modeling the real WHERE status='proposed' AND expires_at>NOW() AND user_id=$user.
    const store: Record<string, PendingRow & { expiresMs: number }> = {
      live: { ...row(), id: 'live', expiresMs: Date.now() + 60_000 },
      expired: { ...row(), id: 'expired', user_id: 'u1', expiresMs: Date.now() - 1 },
    }
    const db: PendingActionDb = {
      claim: async (id, userId) => {
        const r = store[id]
        if (!r || r.status !== 'proposed' || r.user_id !== userId || r.expiresMs <= Date.now()) return null
        r.status = 'executed'
        return r
      },
      createTask: vi.fn().mockResolvedValue({ id: 't9' }),
      markExecuted: vi.fn().mockResolvedValue(undefined),
    }
    expect((await executeProposal('expired', ctx() as any, db)).ok).toBe(false)        // expired
    expect((await executeProposal('live', ctx('owner', 'someone_else') as any, db)).ok).toBe(false) // wrong user
    expect((await executeProposal('live', ctx('owner', 'u1') as any, db)).ok).toBe(true)            // rightful owner
  })
})

describe('loadOpenProposal (reload rehydration)', () => {
  it('maps a DB row to the confirm-card shape', async () => {
    const query = vi.fn().mockResolvedValue({
      id: 'p7', tool_name: 'create_task', resolved_payload: { title: 'Follow up with ACME' },
    })
    const res = await loadOpenProposal('c1', 'u1', query)
    expect(res).toEqual({ proposalId: 'p7', toolName: 'create_task', resolved: { title: 'Follow up with ACME' } })
    expect(query).toHaveBeenCalledWith('c1', 'u1')
  })

  it('returns null when there is no open proposal', async () => {
    const res = await loadOpenProposal('c1', 'u1', vi.fn().mockResolvedValue(null))
    expect(res).toBeNull()
  })

  it('is fail-safe: a query error yields null (conversation load must not break)', async () => {
    const res = await loadOpenProposal('c1', 'u1', vi.fn().mockRejectedValue(new Error('relation does not exist')))
    expect(res).toBeNull()
  })
})
