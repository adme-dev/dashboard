import { describe, it, expect, vi } from 'vitest'
import { getMyCreativeQueue, proposeProofStatus, type CreativeQueueDeps, type ProofStatusDeps } from '~~/server/utils/ai/tools/creativeActions'
import { makeProofStatusExecutor } from '~~/server/utils/ai/executors/creativeActions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'creative', conversationId: 'c1', event: { headers: {} } as any } as ToolContext
const ro = { ...ctx, userRole: 'viewer' } as ToolContext

describe('get_my_creative_queue (read)', () => {
  it('returns the caller\'s pending-approval proofs, scoped to their user id', async () => {
    const fetchQueue = vi.fn(async () => [{ id: 'p1', name: 'Banner v2', proof_type: 'design', status: 'internal_review', due_date: null, is_urgent: true }])
    const res: any = await getMyCreativeQueue({}, ctx, { fetchQueue })
    expect(fetchQueue).toHaveBeenCalledWith('u1')
    expect(res.ok).toBe(true)
    expect(res.data.proofs[0].name).toBe('Banner v2')
  })
  it('fails gracefully on a db error', async () => {
    const res: any = await getMyCreativeQueue({}, ctx, { fetchQueue: async () => { throw new Error('db') } })
    expect(res.ok).toBe(false)
  })
})

describe('propose_proof_status (write)', () => {
  const deps = (over: Partial<ProofStatusDeps> = {}): ProofStatusDeps => ({
    resolveProof: async () => [{ id: 'pf1', name: 'Banner v2' }],
    propose: async () => 'prop-1',
    ...over,
  })
  it('resolves the proof and stages a status proposal', async () => {
    const res: any = await proposeProofStatus({ proofName: 'Banner v2', status: 'approved' } as any, ctx, deps())
    expect(res.data.resolved).toEqual({ proofId: 'pf1', proofName: 'Banner v2', status: 'approved' })
  })
  it('blocks read-only roles', async () => {
    const res: any = await proposeProofStatus({ proofName: 'x', status: 'approved' } as any, ro, deps())
    expect(res.ok).toBe(false)
  })
  it('disambiguates multiple proof matches without proposing', async () => {
    const propose = vi.fn()
    const res: any = await proposeProofStatus({ proofName: 'Banner', status: 'approved' } as any, ctx,
      deps({ resolveProof: async () => [{ id: 'pf1', name: 'Banner v1' }, { id: 'pf2', name: 'Banner v2' }], propose }))
    expect(res.data.disambiguation.field).toBe('proofName')
    expect(propose).not.toHaveBeenCalled()
  })
  it('executor PUTs the proof status endpoint', async () => {
    const put = vi.fn(async () => ({ proof: { id: 'pf1' } }))
    const r = await makeProofStatusExecutor(put).execute({ proofId: 'pf1', proofName: 'Banner v2', status: 'approved' }, ctx)
    expect(put).toHaveBeenCalledWith('/api/agency/proofs/pf1/status', { status: 'approved' }, ctx)
    expect(r.resultRef).toBe('pf1')
  })
})
