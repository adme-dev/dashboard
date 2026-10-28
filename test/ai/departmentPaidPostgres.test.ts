/* eslint-disable @stylistic/max-statements-per-line -- compact fixture tables */
/** Disposable localhost-only PostgreSQL proof for the paid proposal SQL, never the application DB. */
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { preparePaidProposal, claimPaidProposal, readPaidProposal, savePaidReceipt } from '~~/server/utils/ai/marketing/departmentPaidProposals'

const state = vi.hoisted(() => ({ pool: null as pg.Pool | null, schema: '' }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async (sql: string, args?: unknown[]) => {
    const db = await state.pool!.connect()
    try { await db.query(`SET search_path TO ${state.schema}`); return (await db.query(sql, args)).rows[0] ?? null } finally { db.release() }
  },
  transactionWithoutRetry: async (run: (db: pg.PoolClient) => unknown) => {
    const db = await state.pool!.connect()
    try { await db.query('BEGIN'); await db.query(`SET LOCAL search_path TO ${state.schema}`); const r = await run(db); await db.query('COMMIT'); return r } catch (e) { await db.query('ROLLBACK'); throw e } finally { db.release() }
  }
}))
const url = process.env.DEPARTMENT_PAID_PG_URL
const allowed = !!url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
const actor = '11111111-1111-4111-8111-111111111111'
const input = { clientId: '22222222-2222-4222-8222-222222222222', catalogId: '123456' }
describe.skipIf(!allowed)('paid proposal real PostgreSQL concurrency', () => {
  beforeAll(async () => {
    state.pool = new pg.Pool({ connectionString: url, max: 5 })
    state.schema = `paid_test_${Date.now()}`
    await state.pool.query(`CREATE SCHEMA ${state.schema}; CREATE TABLE ${state.schema}.ai_pending_actions (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, tool_name text NOT NULL, resolved_payload jsonb NOT NULL,
   status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','executed','cancelled','expired')), source text NOT NULL,
   conversation_id uuid, expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour', executed_at timestamptz, result_payload jsonb); CREATE TABLE ${state.schema}.meta_catalog_feed_bindings (product_catalog_id text,client_id uuid)`)
  })
  afterAll(async () => { if (state.pool) { await state.pool.query(`DROP SCHEMA ${state.schema} CASCADE`); await state.pool.end() } })
  it('serializes concurrent preparation, rejects changed intent, and admits exactly one durable claim', async () => {
    const args = ['department_catalog_change', actor, input, { mapping: 'one' }, `mcp:${'a'.repeat(64)}`, 'b'.repeat(64)] as const
    const proposals = await Promise.all([preparePaidProposal(...args), preparePaidProposal(...args)])
    expect(proposals[0].id).toBe(proposals[1].id)
    await expect(preparePaidProposal(args[0], actor, { ...input, catalogId: 'other' }, {}, args[4], args[5])).rejects.toMatchObject({ campaignCode: 'idempotency_conflict' })
    const claims = await Promise.allSettled(proposals.map(claimPaidProposal))
    expect(claims.filter(c => c.status === 'fulfilled')).toHaveLength(1)
    await savePaidReceipt(proposals[0], { complete: false, creativeId: '987654' })
    const held = await readPaidProposal(proposals[0].id, args[0], input.clientId)
    expect(held.status).toBe('executed')
    expect(held.result_payload).toEqual({ complete: false, creativeId: '987654' })
    await expect(claimPaidProposal(held)).rejects.toMatchObject({ campaignCode: 'reconciliation_required' })
  })
  it('holds the catalog resource across separate client proposals with uncertain outcomes', async () => {
    const a = await preparePaidProposal('department_catalog_change', actor, { ...input, catalogId: 'resource-race' }, {}, `mcp:${'e'.repeat(64)}`, 'f'.repeat(64))
    const b = await preparePaidProposal('department_catalog_change', actor, { ...input, clientId: actor, catalogId: 'resource-race' }, {}, `mcp:${'1'.repeat(64)}`, '2'.repeat(64))
    const claims = await Promise.allSettled([claimPaidProposal(a), claimPaidProposal(b)])
    expect(claims.filter(c => c.status === 'fulfilled')).toHaveLength(1)
  })
  it('denies another client and a changed reviewed snapshot at claim', async () => {
    const p = await preparePaidProposal('department_meta_ad_launch', actor, input, {}, `mcp:${'c'.repeat(64)}`, 'd'.repeat(64))
    await expect(readPaidProposal(p.id, 'department_meta_ad_launch', actor)).rejects.toMatchObject({ campaignCode: 'not_found' })
    await state.pool!.query(`UPDATE ${state.schema}.ai_pending_actions SET result_payload='{"reviewerId":"new-review"}' WHERE id=$1`, [p.id])
    await expect(claimPaidProposal(p)).rejects.toMatchObject({ campaignCode: 'reconciliation_required' })
  })
})
