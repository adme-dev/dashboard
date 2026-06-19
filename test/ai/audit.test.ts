import { describe, it, expect, vi } from 'vitest'
import { auditParams, recordAudit, type AuditInput } from '~~/server/utils/ai/audit'

const base: AuditInput = {
  pendingId: 'p1', userId: 'u1', confirmedBy: 'u1', toolName: 'create_task',
  riskTier: 'confirm', payload: { title: 'X' }, resultRef: 't1', outcome: 'executed',
}

describe('auditParams', () => {
  it('maps an input to ordered insert params (payload serialized, optionals → null)', () => {
    const p = auditParams(base)
    expect(p).toEqual(['p1', 'u1', 'u1', 'create_task', 'confirm', null, JSON.stringify({ title: 'X' }), 't1', 'executed'])
  })

  it('defaults clientScope and resultRef to null', () => {
    const p = auditParams({ ...base, clientScope: undefined, resultRef: undefined, outcome: 'failed' })
    expect(p[5]).toBeNull()   // client_scope
    expect(p[7]).toBeNull()   // result_ref
    expect(p[8]).toBe('failed')
  })

  it('carries client_scope for tenant-scoped (portal) actions', () => {
    expect(auditParams({ ...base, clientScope: 'client-9' })[5]).toBe('client-9')
  })
})

describe('recordAudit', () => {
  it('writes the row via the injected writer', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    await recordAudit(base, write)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][1]).toEqual(auditParams(base))
  })

  it('is fail-safe: a throwing writer does not propagate (audit must not break the action)', async () => {
    const write = vi.fn().mockRejectedValue(new Error('db down'))
    await expect(recordAudit(base, write)).resolves.toBeUndefined()
  })
})
