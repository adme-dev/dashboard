/* eslint-disable @typescript-eslint/no-explicit-any -- Mock transport and database fixture shapes are intentionally partial. */
/** Local-only PostgreSQL proof: exact budget review, atomic rejection, concurrent replay and QR history. */
import { beforeAll, afterAll, expect, it, describe, vi } from 'vitest'
import pg from 'pg'
import { executeDepartmentBudgetProposal } from '~~/server/utils/ai/marketing/departmentBudgetReview'
import { executeDepartmentUtilityOperation } from '~~/server/utils/ai/marketing/departmentUtilityOperations'

const state = vi.hoisted(() => ({ pool: null as pg.Pool | null, schema: '' }))
vi.mock('~~/server/utils/db', () => {
  const read = async (sql: string, args?: unknown[]) => {
    const db = await state.pool!.connect()
    try {
      await db.query(`SET search_path TO ${state.schema}`)

      return (await db.query(sql, args)).rows
    } finally {
      db.release()
    }
  }

  const tx = async (fn: any) => {
    const db = await state.pool!.connect()
    try {
      await db.query('BEGIN')

      await db.query(`SET LOCAL search_path TO ${state.schema}`)

      const result = await fn(db)

      await db.query('COMMIT')

      return result
    } catch (e) {
      await db.query('ROLLBACK')

      throw e
    } finally {
      db.release()
    }
  }

  return { queryRowsFresh: read, queryOneFresh: async (sql: string, args?: unknown[]) => (await read(sql, args))[0] ?? null, transaction: tx, transactionWithoutRetry: tx }
})
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: async (ctx: unknown) => ctx }))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({ resolveMarketingReadScope: async () => ({}), requireScopedClient: async () => {

} }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({ assertMarketingCapabilityAtBoundary: async () => ({ permissionGroups: ['MARKETING_MANAGEMENT'] }), requireIndependentMarketingReviewer: async (_event: unknown, input: any) => {
  if (input.requesterId === input.reviewerId)
    throw new Error('Self review')
  return { id: input.reviewerId }
} }))
vi.mock('~~/server/utils/tokenStore', () => ({ getOrgTenant: async () => undefined }))
vi.mock('~~/server/utils/socialSpendCache', () => ({ invalidateSpendPeriodCaches: async () => undefined }))
const url = process.env.DEPARTMENT_ROOT_PG_URL
const local = !!url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
const clientId = '11111111-1111-4111-8111-111111111111', spendId = '22222222-2222-4222-8222-222222222222'
const author = '33333333-3333-4333-8333-333333333333', reviewer = '44444444-4444-4444-8444-444444444444'
const ctx = (userId: string) => ({ userId, event: {}, permissionGroups: ['MARKETING_MANAGEMENT', 'QR_CODES'], source: 'mcp' }) as any
const key = (letter: string) => `mcp:${letter.repeat(64)}`, digest = 'f'.repeat(64)
describe.skipIf(!local)('budget and utility real PostgreSQL boundary', () => {
  beforeAll(async () => {
    state.pool = new pg.Pool({ connectionString: url, max: 5 })

    state.schema = `dept_root_${Date.now()}`

    await state.pool.query(`CREATE SCHEMA ${state.schema};SET search_path TO ${state.schema};
CREATE TABLE agency_clients(id uuid PRIMARY KEY,is_active boolean NOT NULL);
CREATE TABLE media_spend(id uuid PRIMARY KEY,client_id uuid NOT NULL,budget_allocated numeric(12,2),budget_rolling boolean,period text DEFAULT '2026-10',platform text DEFAULT 'google_ads',updated_at timestamptz DEFAULT now());
CREATE TABLE budget_audit_log(id uuid DEFAULT gen_random_uuid(),media_spend_id uuid REFERENCES media_spend,previous_budget numeric(12,2),new_budget numeric(12,2),changed_by uuid,note text);
CREATE TABLE ai_pending_actions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,tool_name text NOT NULL,resolved_payload jsonb,status text,source text,conversation_id uuid,expires_at timestamptz DEFAULT now()+interval '1 hour',confirmed_by uuid,executed_at timestamptz,result_payload jsonb);
CREATE TABLE god_mode_execution_ledger(actor_user_id uuid,channel text,idempotency_key text,state text,correlation_id uuid,route_or_tool text,executor_class text,session_digest text,execution_phase text,client_id uuid,result_reference varchar(128),result_digest varchar(64),execution_metadata jsonb,updated_at timestamptz DEFAULT now(),PRIMARY KEY(actor_user_id,channel,idempotency_key));
CREATE TABLE qr_folders(id uuid PRIMARY KEY,client_id uuid);
CREATE TABLE qr_codes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,folder_id uuid,code varchar(10) UNIQUE,name text,destination_url text,style jsonb,created_by uuid,utm_enabled boolean,utm_medium text,utm_source text,frame jsonb,ab jsonb);
CREATE TABLE qr_scans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),qr_code_id uuid REFERENCES qr_codes,scanned_at timestamptz DEFAULT now(),ip_hash text);
CREATE TABLE qr_destination_history(qr_code_id uuid REFERENCES qr_codes,old_url text,new_url text,changed_by uuid);
INSERT INTO agency_clients VALUES('${clientId}',true);INSERT INTO media_spend(id,client_id,budget_allocated,budget_rolling) VALUES('${spendId}','${clientId}',100,false);`)
  })

  afterAll(async () => {
    if (state.pool) {
      await state.pool.query(`DROP SCHEMA ${state.schema} CASCADE`)

      await state.pool.end()
    }
  })

  it('requires an independent exact review, rolls back stale edits, and executes concurrent retries once', async () => {
    const input = { clientId, changes: [{ spendId, expectedBudget: 100, budget: 200, rolling: true }], acknowledgement: 'UPDATE_RECORDED_BUDGETS', note: 'Approved monthly plan' }

    const created = await executeDepartmentBudgetProposal('marketing_propose_budget_allocations', input, ctx(author), key('a'), digest)

    expect(created.ok).toBe(true)

    const p = (created as any).data

    const exact = { clientId, proposalId: p.proposalId, expectedRevision: p.revision, ack: true }

    const replay = await executeDepartmentBudgetProposal('marketing_propose_budget_allocations', input, ctx(author), key('a'), digest)

    expect((replay as any).data.proposalId).toBe(p.proposalId)

    expect(await executeDepartmentBudgetProposal('marketing_review_budget_allocations', { ...exact, decision: 'approve', reason: 'Monthly allocation verified' }, ctx(author), key('b'), digest)).toMatchObject({ ok: false })

    expect(await executeDepartmentBudgetProposal('marketing_review_budget_allocations', { ...exact, decision: 'approve', reason: 'Monthly allocation verified' }, ctx(reviewer), key('b'), digest)).toMatchObject({ ok: true })

    await state.pool!.query(`UPDATE ${state.schema}.media_spend SET budget_allocated=150 WHERE id=$1`, [spendId])

    expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', exact, ctx(author), key('c'), digest)).toMatchObject({ ok: false })

    expect((await state.pool!.query(`SELECT count(*)::int AS n FROM ${state.schema}.budget_audit_log`)).rows[0].n).toBe(0)

    expect((await state.pool!.query(`SELECT count(*)::int AS n FROM ${state.schema}.god_mode_execution_ledger`)).rows[0].n).toBe(0)

    await state.pool!.query(`UPDATE ${state.schema}.media_spend SET budget_allocated=100 WHERE id=$1`, [spendId])

    const done = await Promise.all([key('c'), key('d')].map(k => executeDepartmentBudgetProposal('marketing_set_budget_allocations', exact, ctx(author), k, digest)))

    expect(done.every(r => r.ok)).toBe(true)

    expect(done.filter(r => (r as any).data.replayed)).toHaveLength(1)

    expect((await state.pool!.query(`SELECT budget_allocated::text AS budget,budget_rolling FROM ${state.schema}.media_spend`)).rows[0]).toEqual({ budget: '200.00', budget_rolling: true })

    expect((await state.pool!.query(`SELECT count(*)::int AS n FROM ${state.schema}.budget_audit_log`)).rows[0].n).toBe(1)
  })

  it('creates a single native QR and one history row across concurrent identical requests', async () => {
    const input = { clientId, name: 'Spring campaign', destinationUrl: 'https://example.com/offer', ack: true }

    const results = await Promise.all([1, 2].map(() => executeDepartmentUtilityOperation('marketing_create_qr_code', input, ctx(author), key('e'), digest)))

    expect(results.every(r => r.ok)).toBe(true)

    expect((results[0] as any).data.qrCodeId).toBe((results[1] as any).data.qrCodeId)

    expect((await state.pool!.query(`SELECT count(*)::int AS n FROM ${state.schema}.qr_codes`)).rows[0].n).toBe(1)

    expect((await state.pool!.query(`SELECT count(*)::int AS n FROM ${state.schema}.qr_destination_history`)).rows[0].n).toBe(1)
  })

  it('reports empty and populated QR metrics using scoped SQL rather than a false zero for unknown codes', async () => {
    const q = (await state.pool!.query(`SELECT id FROM ${state.schema}.qr_codes LIMIT 1`)).rows[0]

    expect(await executeDepartmentUtilityOperation('marketing_get_qr_metrics', { clientId, qrCodeId: spendId, days: 30 }, ctx(author), key('f'), digest)).toMatchObject({ ok: false, code: 'not_found' })

    expect(await executeDepartmentUtilityOperation('marketing_get_qr_metrics', { clientId, qrCodeId: q.id, days: 30 }, ctx(author), key('f'), digest)).toMatchObject({ ok: true, data: { daily: [] } })

    await state.pool!.query(`INSERT INTO ${state.schema}.qr_scans(qr_code_id,ip_hash) VALUES($1,'hash1'),($1,'hash1'),($1,'hash2')`, [q.id])

    const result = await executeDepartmentUtilityOperation('marketing_get_qr_metrics', { clientId, qrCodeId: q.id, days: 30 }, ctx(author), key('f'), digest)

    expect(result).toMatchObject({ ok: true, data: { daily: [{ scans: 3, unique_devices: 2 }] } })
  })
})
