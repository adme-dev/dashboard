import type { NativeMarketingEnvelope } from '../../server/utils/ai/marketing/nativePendingActions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareNativeMarketingAction, nativeMarketingReceipt, nativeMarketingExecutor, nativeMarketingRichExecutor } from '../../server/utils/ai/marketing/nativePendingActions'
import { executeRegisteredPendingAction } from '../../server/utils/ai/pendingActions'
import type { ToolContext } from '../../server/utils/ai/toolContext'

interface TestRow { id: string, conversation_id: string, user_id: string, tool_name: string, resolved_payload: NativeMarketingEnvelope, status: string, expires_at: string, source: string }
interface TestDb { query: (sql: string, values: unknown[]) => Promise<{ rows: TestRow[] }> }
const state = vi.hoisted(() => ({ rows: [] as TestRow[], dispatch: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/nativeTools', () => ({ executeConfirmedNativeMarketingAction: state.dispatch }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(), transactionWithoutRetry: async (fn: (db: TestDb) => Promise<unknown>) => fn({ query: async (sql: string, values: unknown[]) => {
    if (sql.includes('pg_advisory')) return { rows: [] }
    if (sql.includes('SELECT id, status')) return { rows: state.rows.filter(row => row.user_id === values[0] && row.conversation_id === values[1] && row.tool_name === values[2] && row.resolved_payload.executionKey === values[3]) }
    if (sql.includes('INSERT INTO ai_pending_actions')) {
      const row = { id: `outer-${state.rows.length}`, conversation_id: String(values[0]), user_id: String(values[1]), tool_name: String(values[2]), resolved_payload: JSON.parse(String(values[3])) as NativeMarketingEnvelope, status: 'proposed', expires_at: new Date(Date.now() + 60_000).toISOString(), source: 'chat' }
      state.rows.push(row)
      return { rows: [row] }
    }
    throw new Error(`Unexpected SQL ${sql}`)
  } })
}))
const ctx = { userId: 'actor', userRole: 'media_buyer', conversationId: 'conversation', source: 'chat', event: {} } as ToolContext
beforeEach(() => {
  state.rows.length = 0
  state.dispatch.mockReset()
  state.dispatch.mockResolvedValue({ ok: true, data: { requiresIndependentReview: true } })
})
const operation = 'marketing_execute_inventory_feed_change'
const args = { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', proposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expectedRevision: 'a'.repeat(64), ack: true }
function dependencies() {
  return { peek: vi.fn(async () => state.rows[0]), claim: vi.fn(async () => {
    const row = state.rows[0]
    if (!row || row.status !== 'proposed') return null
    row.status = 'executed'
    return row
  }), markExecuted: vi.fn(), revertToProposed: vi.fn(), recordAudit: vi.fn(), getExecutor: (name: string) => name === nativeMarketingRichExecutor.toolName ? nativeMarketingRichExecutor : nativeMarketingExecutor }
}
describe('native department human confirmation contract', () => {
  it('model ack only creates one stable outer card; the explicit confirm dispatches once', async () => {
    const first = await prepareNativeMarketingAction(ctx, 'message', operation, args, 'confirm')
    const replay = await prepareNativeMarketingAction(ctx, 'message', operation, args, 'confirm')
    expect(first).toEqual(replay)
    expect(state.rows).toHaveLength(1)
    expect(state.dispatch).not.toHaveBeenCalled()
    const deps = dependencies()
    expect((await executeRegisteredPendingAction({ proposalId: 'outer-0', ctx }, deps)).ok).toBe(true)
    expect(state.dispatch).toHaveBeenCalledTimes(1)
    expect(state.dispatch.mock.calls[0][0].executionKey).toMatch(/^chat:[a-f0-9]{64}$/)
    expect((await executeRegisteredPendingAction({ proposalId: 'outer-0', ctx }, deps)).ok).toBe(false)
    expect(state.dispatch).toHaveBeenCalledTimes(1)
    expect(deps.revertToProposed).not.toHaveBeenCalled()
  })
  it('rich confirmation requires the separate human acknowledgement before claim', async () => {
    await prepareNativeMarketingAction(ctx, 'message', operation, args, 'rich_confirm')
    const deps = dependencies()
    expect(await executeRegisteredPendingAction({ proposalId: 'outer-0', ctx }, deps)).toMatchObject({ ok: false, requiresRichConfirm: true })
    expect(deps.claim).not.toHaveBeenCalled()
    expect(state.dispatch).not.toHaveBeenCalled()
    expect((await executeRegisteredPendingAction({ proposalId: 'outer-0', ctx, richConfirmAck: true }, deps)).ok).toBe(true)
  })
  it('unknown domain outcomes stay claimed and never become retryable outer writes', async () => {
    await prepareNativeMarketingAction(ctx, 'message', operation, args, 'confirm')
    state.dispatch.mockResolvedValue({ ok: false, error: 'Unknown provider outcome', code: 'reconciliation_required' })
    const deps = dependencies()
    expect((await executeRegisteredPendingAction({ proposalId: 'outer-0', ctx }, deps)).ok).toBe(false)
    expect(deps.revertToProposed).not.toHaveBeenCalled()
    expect(state.rows[0].status).toBe('executed')
  })
  it('rejects a changed persisted actor/hash and never dispatches it', async () => {
    await prepareNativeMarketingAction(ctx, 'message', operation, args, 'confirm')
    const payload = state.rows[0].resolved_payload.args as { ack: boolean }
    payload.ack = false
    await expect(nativeMarketingExecutor.execute(state.rows[0].resolved_payload, ctx)).rejects.toMatchObject({ terminal: true })
    expect(state.dispatch).not.toHaveBeenCalled()
  })
})

describe('bounded marketing receipt reporting', () => {
  it.each(['queued', 'accepted', 'paused'])('retains %s without a completion claim', (status) => {
    const receipt = nativeMarketingReceipt(operation, { status, complete: false, providerServingVerified: false }, 'ref')
    expect(receipt.ambiguous).toBe(false)
    expect(receipt.summary).toContain(`status=${status}`)
    expect(receipt.summary).toContain('complete=false')
    expect(receipt.summary).not.toContain('completed')
  })
  it.each([{ status: 'partial' }, { status: 'failed' }, { status: 'unknown' }, { status: 'sent', ledgerRecorded: false }])('holds unsafe receipt %j for reconciliation', (value) => {
    const receipt = nativeMarketingReceipt(operation, value, 'ref')
    expect(receipt.ambiguous).toBe(true)
    expect(receipt.summary).toContain('manual reconciliation')
    expect(receipt.summary).not.toContain('completed')
  })
  it('reports a prepared domain proposal without a completed execution claim', () => {
    const receipt = nativeMarketingReceipt('marketing_propose_inventory_feed_change', { proposalId: 'safe-proposal', status: 'proposed' }, 'ref')
    expect(receipt.summary).toContain('proposal prepared')
    expect(receipt.summary).toContain('required review')
    expect(receipt.summary).not.toContain('completed')
  })
})
