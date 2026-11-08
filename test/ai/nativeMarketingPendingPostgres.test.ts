import type { ToolResult, ToolContext } from '../../server/utils/ai/toolContext'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { prepareNativeMarketingAction, nativeMarketingExecutor } from '../../server/utils/ai/marketing/nativePendingActions'
import { executeRegisteredPendingAction } from '../../server/utils/ai/pendingActions'

const state = vi.hoisted(() => ({ transaction: null as null | ((fn: (db: pg.PoolClient) => Promise<unknown>) => Promise<unknown>), dispatch: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn(), transactionWithoutRetry: (fn: (db: pg.PoolClient) => Promise<unknown>) => state.transaction!(fn) }))
vi.mock('~~/server/utils/ai/marketing/nativeTools', () => ({ executeConfirmedNativeMarketingAction: state.dispatch }))
const url = process.env.ASSISTANT_CHAT_PG_URL
const target = url ? new URL(url) : null
const local = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/assistant_chat_test_[a-z0-9_]+$/.test(target.pathname)
describe.skipIf(!local)('native pending confirmation in isolated disposable PostgreSQL schema', () => {
  it('serializes concurrent model proposals and atomic human confirmations without duplicate domain dispatch', async () => {
    const schema = `native_pending_${randomUUID().replaceAll('-', '')}`
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}`)
    const pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}`, statement_timeout: 5000 })
    try {
      await pool.query(`CREATE TABLE ai_pending_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id text NOT NULL,user_id text NOT NULL,tool_name text NOT NULL,
    resolved_payload jsonb NOT NULL,status text NOT NULL,source text NOT NULL,expires_at timestamptz DEFAULT NOW()+INTERVAL '1 hour',
    result_ref text,confirmed_by text,executed_at timestamptz);
    CREATE TABLE dispatched_domain_operations (execution_key text PRIMARY KEY, operation text NOT NULL);`)
      state.transaction = async (fn) => {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const result = await fn(client)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally { client.release() }
      }
      state.dispatch.mockReset()
      state.dispatch.mockImplementation(async (envelope) => {
        await pool.query('INSERT INTO dispatched_domain_operations VALUES ($1,$2)', [envelope.executionKey, envelope.operation])
        return { ok: true, data: { proposalId: randomUUID(), status: 'proposed' } }
      })
      const ctx = { userId: 'staff', userRole: 'media_buyer', conversationId: 'conversation', source: 'chat', event: {} } as ToolContext
      const proposals = await Promise.all([1, 2, 3].map(() => prepareNativeMarketingAction(ctx, 'persisted-message', 'marketing_propose_inventory_feed_change', { clientId: randomUUID(), feedId: 'feed', patch: { name: 'Reviewed' } }, 'confirm')))
      // Distinct intent has distinct identity, even on one message; now race the exact same intent.
      expect((await pool.query('SELECT COUNT(*)::int AS n FROM ai_pending_actions')).rows[0].n).toBe(3)
      const args = { clientId: randomUUID(), feedId: 'feed', patch: { name: 'Exact same intent' } }
      const repeated = await Promise.all([1, 2, 3].map(() => prepareNativeMarketingAction(ctx, 'persisted-message', 'marketing_propose_inventory_feed_change', args, 'confirm')))
      expect(repeated.every(result => result.ok)).toBe(true)
      const proposalIdOf = (result: ToolResult) => {
        if (!result.ok) throw new Error(result.error)
        return (result.data as { proposalId: string }).proposalId
      }
      const proposalId = proposalIdOf(repeated[0])
      expect(repeated.map(proposalIdOf)).toEqual([proposalId, proposalId, proposalId])
      expect(state.dispatch).not.toHaveBeenCalled()
      const deps = {
        peek: async (id: string, userId: string) => (await pool.query('SELECT tool_name,source FROM ai_pending_actions WHERE id=$1 AND user_id=$2 AND source=\'chat\'', [id, userId])).rows[0],
        claim: async (id: string, userId: string) => (await pool.query(`UPDATE ai_pending_actions SET status='executed',confirmed_by=$2,executed_at=NOW()
      WHERE id=$1 AND user_id=$2 AND conversation_id=$3 AND source='chat' AND status='proposed' AND expires_at>NOW() RETURNING *`, [id, userId, ctx.conversationId])).rows[0] ?? null,
        markExecuted: async (id: string, ref: string) => { await pool.query('UPDATE ai_pending_actions SET result_ref=$2 WHERE id=$1', [id, ref]) },
        revertToProposed: vi.fn(), recordAudit: vi.fn(), getExecutor: () => nativeMarketingExecutor
      }
      const confirms = await Promise.all([1, 2].map(() => executeRegisteredPendingAction({ proposalId, ctx }, deps)))
      expect(confirms.filter(result => result.ok)).toHaveLength(1)
      expect(state.dispatch).toHaveBeenCalledTimes(1)
      expect((await pool.query('SELECT COUNT(*)::int AS n FROM dispatched_domain_operations')).rows[0].n).toBe(1)
      expect(deps.revertToProposed).not.toHaveBeenCalled()
      expect(proposals.every(result => result.ok)).toBe(true)
    } finally {
      state.transaction = null
      await pool.end()
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    }
  })
})
