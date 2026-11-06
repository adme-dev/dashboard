import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimPaidProposal, type PaidProposal } from '~~/server/utils/ai/marketing/departmentPaidProposals'

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn(), transactionWithoutRetry: (run: (db: unknown) => unknown) => run({ query: state.query }) }))

function proposal(input: Record<string, unknown>): PaidProposal {
  return { id: 'proposal', user_id: 'author', status: 'proposed', expires_at: new Date(Date.now() + 60000).toISOString(), result_payload: null,
    resolved_payload: { action: 'department_catalog_change', clientId: 'client', input, revision: 'revision', requestKey: 'key', digest: 'digest', intentHash: 'intent' } }
}
beforeEach(() => {
  state.query.mockReset()
  state.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('UPDATE') ? [{ id: 'proposal' }] : [] }))
})
describe('catalogue creation and existing-resource claims', () => {
  it('locks new catalogue creation by exact client, connection and source feed', async () => {
    await claimPaidProposal(proposal({ operation: 'create_catalog', clientId: 'client', connectionId: 'connection', sourceFeedId: 'source' }))
    expect(state.query.mock.calls[0][1]).toEqual(['department-catalog:new:client:connection:source'])
    expect(state.query.mock.calls.some(([sql, params]) => sql.includes('->>\'operation\'') && params.includes('new:client:connection:source'))).toBe(true)
  })
  it('holds a new creation scope after a prior uncertain provider acknowledgement', async () => {
    state.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT id FROM ai_pending_actions') ? [{ id: 'held' }] : [] }))
    await expect(claimPaidProposal(proposal({ operation: 'create_catalog', connectionId: 'connection', sourceFeedId: 'source' }))).rejects.toMatchObject({ campaignCode: 'reconciliation_required' })
    expect(state.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false)
  })
  it('reserves creation scope even after a prior successful provider result', async () => {
    await claimPaidProposal(proposal({ operation: 'create_catalog', connectionId: 'connection', sourceFeedId: 'source' }))
    const held = state.query.mock.calls.find(([sql]) => sql.includes('SELECT id FROM ai_pending_actions'))!
    expect(held[0]).toContain('OR $3::boolean')
    expect(held[1][2]).toBe(true)
  })
  it('reserves IDs returned by partial catalogue creation against later claims', async () => {
    await claimPaidProposal(proposal({ catalogId: '123456' }))
    const held = state.query.mock.calls.find(([sql]) => sql.includes('SELECT id FROM ai_pending_actions'))!
    expect(held[0]).toContain('result_payload->>\'catalogId\'')
    expect(held[1]).toContain('123456')
  })
})
