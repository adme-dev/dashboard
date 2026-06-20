import { describe, it, expect, vi } from 'vitest'
import { proposeOpportunity, logCrmActivity, proposeQuote, draftFollowup, type CrmDeps } from '~~/server/utils/ai/tools/crmActions'
import { makeOpportunityExecutor, makeLogActivityExecutor, makeQuoteExecutor } from '~~/server/utils/ai/executors/crmActions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'sales', conversationId: 'c1', event: { headers: {} } as any } as ToolContext

const deps = (over: Partial<CrmDeps> = {}): CrmDeps => ({
  resolveClient: async () => [{ id: 'cl1', name: 'Acme' }],
  resolveStage: async () => [{ id: 'st1', name: 'new' }],
  resolvePerson: async () => [{ id: 'pe1', name: 'Jane Doe' }],
  resolveCompany: async () => [{ id: 'co1', name: 'Acme Pty' }],
  resolveOpportunity: async () => [{ id: 'op1', name: 'Q3 retainer' }],
  propose: async () => 'prop-1',
  draftFollowup: async () => 'Hi Jane, just following up…',
  ...over,
})

describe('propose_opportunity', () => {
  it('resolves client + stage (+ optional person) and stages a proposal', async () => {
    const res: any = await proposeOpportunity({ clientName: 'Acme', name: 'Q4 deal', stageName: 'new', amount: 5000, personName: 'Jane' } as any, ctx, deps())
    expect(res.ok).toBe(true)
    expect(res.data.resolved).toMatchObject({ client_id: 'cl1', name: 'Q4 deal', stage_id: 'st1', amount: 5000, person_id: 'pe1' })
  })
  it('fails when the stage is unknown (endpoint requires a stage_id)', async () => {
    const res: any = await proposeOpportunity({ clientName: 'Acme', name: 'X', stageName: 'bogus' } as any, ctx, deps({ resolveStage: async () => [] }))
    expect(res.ok).toBe(false)
  })
  it('disambiguates client matches without proposing', async () => {
    const propose = vi.fn()
    const res: any = await proposeOpportunity({ clientName: 'Ac', name: 'X', stageName: 'new' } as any, ctx,
      deps({ resolveClient: async () => [{ id: 'cl1', name: 'Acme' }, { id: 'cl2', name: 'Acme Two' }], propose }))
    expect(res.data.disambiguation.field).toBe('clientName')
    expect(propose).not.toHaveBeenCalled()
  })
})

describe('log_crm_activity', () => {
  it('routes targetType to the right resolver and stages a proposal', async () => {
    const resolveCompany = vi.fn(async () => [{ id: 'co1', name: 'Acme Pty' }])
    const res: any = await logCrmActivity({ clientName: 'Acme', targetType: 'company', targetName: 'Acme Pty', type: 'call', title: 'Intro call' } as any, ctx, deps({ resolveCompany }))
    expect(resolveCompany).toHaveBeenCalledWith('cl1', 'Acme Pty')
    expect(res.data.resolved).toMatchObject({ target_type: 'company', target_id: 'co1', type: 'call', title: 'Intro call' })
  })
})

describe('propose_quote', () => {
  it('resolves the opportunity within the client and stages a proposal', async () => {
    const res: any = await proposeQuote({ clientName: 'Acme', opportunityName: 'Q3 retainer' }, ctx, deps())
    expect(res.data.resolved).toMatchObject({ client_id: 'cl1', opportunity_id: 'op1' })
  })
})

describe('draft_followup (read)', () => {
  it('returns the generated draft, never proposing', async () => {
    const propose = vi.fn()
    const res: any = await draftFollowup({ clientName: 'Acme', opportunityName: 'Q3 retainer' }, ctx, deps({ propose }))
    expect(res.data.draft).toContain('following up')
    expect(propose).not.toHaveBeenCalled()
  })
  it('fails gracefully when CRM AI is disabled (empty draft)', async () => {
    const res: any = await draftFollowup({ clientName: 'Acme', opportunityName: 'Q3 retainer' }, ctx, deps({ draftFollowup: async () => '' }))
    expect(res.ok).toBe(false)
  })
})

describe('CRM executors', () => {
  it('opportunity POSTs the create endpoint with the required stage_id', async () => {
    const post = vi.fn(async () => ({ item: { id: 'op9' } }))
    const r = await makeOpportunityExecutor(post).execute({ client_id: 'cl1', clientName: 'Acme', name: 'Q4', stage_id: 'st1', stageName: 'new', amount: 0 }, ctx)
    expect(post).toHaveBeenCalledWith('/api/crm/opportunities', expect.objectContaining({ client_id: 'cl1', stage_id: 'st1' }), ctx)
    expect(r.resultRef).toBe('op9')
  })
  it('activity POSTs the activities endpoint', async () => {
    const post = vi.fn(async () => ({ item: { id: 'ac9' } }))
    await makeLogActivityExecutor(post).execute({ client_id: 'cl1', target_type: 'person', target_id: 'pe1', targetName: 'Jane', type: 'note', title: 'X' }, ctx)
    expect(post).toHaveBeenCalledWith('/api/crm/activities', expect.objectContaining({ target_type: 'person', target_id: 'pe1' }), ctx)
  })
  it('quote POSTs the create-quote endpoint and throws without an id', async () => {
    const post = vi.fn(async () => ({ quote_id: 'qu9' }))
    const r = await makeQuoteExecutor(post).execute({ client_id: 'cl1', opportunity_id: 'op1', opportunityName: 'Q3 retainer' }, ctx)
    expect(post).toHaveBeenCalledWith('/api/crm/opportunities/op1/create-quote', { client_id: 'cl1' }, ctx)
    expect(r.resultRef).toBe('qu9')
    await expect(makeQuoteExecutor(async () => ({})).execute({ opportunity_id: 'op1' }, ctx)).rejects.toThrow()
  })
})
