import { describe, it, expect, vi } from 'vitest'
import { proposeRespondToApproval } from '~~/server/utils/ai/portalTools/respondApproval'
import type { PortalToolContext } from '~~/server/utils/ai/portalTools/portalContext'
import { executePortalProposal, getPortalExecutor, type PortalConfirmDb, type PortalPendingRow } from '~~/server/utils/ai/portalConfirm'

const TENANT_A = 'client-aaaa'

function ctxWith(queryOne: any): PortalToolContext {
  return { clientScope: TENANT_A, clientUserId: 'cu-1', conversationId: 'conv-1', event: {} as any, db: { queryRows: (async () => []) as any, queryOne } }
}

describe('respond_to_approval (propose)', () => {
  it('verifies the approval belongs to the client (scope=$1) then stages a proposal', async () => {
    const calls: { sql: string, params: any[] }[] = []
    const queryOne = vi.fn(async (sql: string, params: any[]) => {
      calls.push({ sql, params })
      if (sql.includes('FROM client_approvals')) return { id: 'ap-1', status: 'pending', title: 'Logo v2' }
      if (sql.includes('INSERT INTO ai_pending_actions')) return { id: 'prop-1' }
      return null
    })
    const res: any = await proposeRespondToApproval(
      { approvalId: '11111111-1111-1111-1111-111111111111', action: 'approve' } as any,
      ctxWith(queryOne),
    )
    expect(res.ok).toBe(true)
    expect(res.data.proposalId).toBe('prop-1')
    // ownership SELECT bound clientScope as $1
    const sel = calls.find(c => c.sql.includes('FROM client_approvals'))!
    expect(sel.params[0]).toBe(TENANT_A)
    expect(sel.sql).toContain('p.client_id = $1')
    // proposal row tenant-tagged with client_scope = clientScope, owned by the client user
    const ins = calls.find(c => c.sql.includes('INSERT INTO ai_pending_actions'))!
    expect(ins.params[1]).toBe('cu-1')      // user_id
    expect(ins.params[4]).toBe(TENANT_A)    // client_scope ($5; status is a literal)
    expect(res.data.resolved).toMatchObject({ approvalId: '11111111-1111-1111-1111-111111111111', action: 'approve', title: 'Logo v2' })
  })

  it('refuses an approval not in the client\'s portal', async () => {
    const res: any = await proposeRespondToApproval(
      { approvalId: '11111111-1111-1111-1111-111111111111', action: 'approve' } as any,
      ctxWith(vi.fn(async () => null)),
    )
    expect(res.ok).toBe(false)
  })

  it('refuses an already-decided approval', async () => {
    const res: any = await proposeRespondToApproval(
      { approvalId: '11111111-1111-1111-1111-111111111111', action: 'approve' } as any,
      ctxWith(vi.fn(async (sql: string) => sql.includes('client_approvals') ? { id: 'ap-1', status: 'approved', title: 'x' } : null)),
    )
    expect(res.ok).toBe(false)
  })

  it('requires a note for reject / revision', async () => {
    const queryOne = vi.fn(async (sql: string) => sql.includes('client_approvals') ? { id: 'ap-1', status: 'pending', title: 'x' } : { id: 'p' })
    const res: any = await proposeRespondToApproval(
      { approvalId: '11111111-1111-1111-1111-111111111111', action: 'reject' } as any,
      ctxWith(queryOne),
    )
    expect(res.ok).toBe(false)
    // never reached the DB — rejected before any query
    expect(queryOne).not.toHaveBeenCalled()
  })
})

describe('executePortalProposal (confirm spine)', () => {
  const row = (over: Partial<PortalPendingRow> = {}): PortalPendingRow => ({
    id: 'prop-1', status: 'proposed', tool_name: 'respond_to_approval',
    resolved_payload: { approvalId: 'ap-1', action: 'approve' }, user_id: 'cu-1', client_scope: TENANT_A,
    expires_at: '2999-01-01', ...over,
  })

  it('claims by (proposalId, clientUserId, clientScope), executes, marks + audits executed', async () => {
    const claim = vi.fn(async () => row())
    const markExecuted = vi.fn(async () => {})
    const audit = vi.fn(async () => {})
    const db: PortalConfirmDb = { claim, markExecuted, revert: vi.fn(async () => {}) }
    const res = await executePortalProposal({
      proposalId: 'prop-1', clientUserId: 'cu-1', clientScope: TENANT_A, event: {} as any,
      db, getExecutor: () => async () => ({ resultRef: 'ap-1', summary: 'done' }), audit,
    })
    expect(res.ok).toBe(true)
    expect(claim).toHaveBeenCalledWith('prop-1', 'cu-1', TENANT_A)
    expect(markExecuted).toHaveBeenCalledWith('prop-1', 'ap-1')
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'executed', clientScope: TENANT_A }))
  })

  it('is idempotent — a no-claim returns an error and audits nothing', async () => {
    const audit = vi.fn(async () => {})
    const res = await executePortalProposal({
      proposalId: 'prop-1', clientUserId: 'cu-1', clientScope: TENANT_A, event: {} as any,
      db: { claim: async () => null, markExecuted: vi.fn(), revert: vi.fn() }, getExecutor: () => async () => ({ resultRef: 'x', summary: 'y' }), audit,
    })
    expect(res.ok).toBe(false)
    expect(audit).not.toHaveBeenCalled()
  })

  it('unknown tool is terminal — no revert, audits failed', async () => {
    const revert = vi.fn(async () => {})
    const audit = vi.fn(async () => {})
    const res = await executePortalProposal({
      proposalId: 'prop-1', clientUserId: 'cu-1', clientScope: TENANT_A, event: {} as any,
      db: { claim: async () => row({ tool_name: 'gone' }), markExecuted: vi.fn(), revert }, getExecutor: () => null, audit,
    })
    expect(res.ok).toBe(false)
    expect(revert).not.toHaveBeenCalled()
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }))
  })

  it('a mutation failure reverts and audits failed', async () => {
    const revert = vi.fn(async () => {})
    const audit = vi.fn(async () => {})
    const res = await executePortalProposal({
      proposalId: 'prop-1', clientUserId: 'cu-1', clientScope: TENANT_A, event: {} as any,
      db: { claim: async () => row(), markExecuted: vi.fn(), revert }, getExecutor: () => async () => { throw new Error('boom') }, audit,
    })
    expect(res.ok).toBe(false)
    expect(revert).toHaveBeenCalledWith('prop-1')
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }))
  })

  it('only respond_to_approval is a registered portal executor', () => {
    expect(typeof getPortalExecutor('respond_to_approval')).toBe('function')
    expect(getPortalExecutor('create_task')).toBeNull()
    expect(getPortalExecutor('propose_budget_change')).toBeNull()
  })
})
