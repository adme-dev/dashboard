import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { readFileSync } from 'node:fs'

const pool = new Pool({ host: '127.0.0.1', port: 55473, user: 'xf_workflow_test', database: 'postgres', max: 8 })
const schema = `social_live_${process.pid}`
async function connection() {
  const db = await pool.connect()
  await db.query(`SET search_path TO ${schema}, public`)
  return db
}
async function rows(sql: string, params: unknown[] = []) {
  const db = await connection()
  try {
    return (await db.query(sql, params)).rows
  } finally {
    db.release()
  }
}
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async (sql: string, params: unknown[]) => (await rows(sql, params))[0],
  queryRowsFresh: rows,
  transactionWithoutRetry: async (fn: (db: PoolClient) => Promise<unknown>) => {
    const db = await connection()
    await db.query('BEGIN')
    try {
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
}))

const provider = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/socialPublishing/liveFacebook', async (load) => ({ ...await load<typeof import('~~/server/utils/socialPublishing/liveFacebook')>(), facebookLiveRequest: provider }))
const { manageLiveFacebook, readLiveFacebook } = await import('~~/server/utils/socialPublishing/liveOperations')
const ids = { post: '11111111-1111-4111-8111-111111111111', client: '22222222-2222-4222-8222-222222222222', account: '33333333-3333-4333-8333-333333333333', operation: '44444444-4444-4444-8444-444444444444', other: '55555555-5555-4555-8555-555555555555' }
let live = 'Original caption'
const input = () => ({ operationId: ids.operation, accountId: ids.account, action: 'edit' as const, expectedMessage: 'Original caption', message: 'Reviewed revision' })
const run = (patch = {}) => manageLiveFacebook(ids.post, ids.client, 'manager', { ...input(), ...patch })
const writes = () => provider.mock.calls.filter(c => c[2] !== 'GET')
const stored = async () => (await rows('SELECT * FROM social_live_operations'))[0]
describe.skipIf(process.env.XF_LOCAL_WORKFLOW_TESTS !== '1')('live Facebook operations with PostgreSQL', () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`)
    await rows(`CREATE TABLE agency_clients(id uuid PRIMARY KEY);
      CREATE TABLE team_members(id uuid PRIMARY KEY,name text);
      CREATE TABLE social_accounts(id uuid PRIMARY KEY,client_id uuid,platform text,platform_account_id text,access_token text,is_active boolean,account_name text);
      CREATE TABLE social_posts(id uuid PRIMARY KEY,client_id uuid,status text,client_approval_status text,metadata jsonb DEFAULT '{}',account_ids uuid[],platform_results jsonb,updated_at timestamptz);
      CREATE TABLE social_publishing_audit_events(client_id uuid,post_id uuid,social_account_id uuid,actor_id text,action text,metadata jsonb);`)
    await rows(readFileSync('server/database/migrations/448_social_live_operations.sql','utf8'))
  })
  beforeEach(async () => {
    await rows('TRUNCATE social_live_operations,social_publishing_audit_events,social_posts,social_accounts,agency_clients CASCADE')
    await rows('INSERT INTO agency_clients VALUES ($1),($2)',[ids.client,ids.other])
    await rows("INSERT INTO social_accounts VALUES($1,$2,'facebook','123','test-token',TRUE,'Example Page')",[ids.account,ids.client])
    await rows("INSERT INTO social_posts(id,client_id,status,account_ids,platform_results) VALUES($1,$2,'published',$3,$4::jsonb)",[ids.post,ids.client,[ids.account],JSON.stringify({facebook:{status:'success',platform:'facebook',accountId:ids.account,platformAccountId:'123',platformPostId:'123_456'}})])
    live='Original caption'
    provider.mockReset()
    provider.mockImplementation(async (_a,_id,method,message) => { if(method==='POST') live=message; return {message:live} })
  })
  afterAll(async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() })
  it('records caption revision and actor audit while preserving receipt',async () => {
    expect(await run()).toEqual({operationId:ids.operation,status:'succeeded'})
    expect((await stored()).before_message).toBe('Original caption')
    expect((await stored()).after_message).toBe('Reviewed revision')
    expect((await stored()).actor_id).toBe('manager')
    const post=(await rows('SELECT * FROM social_posts'))[0]
    expect(post.platform_results.facebook.platformPostId).toBe('123_456')
    expect(post.metadata.liveFacebook[ids.account].message).toBe('Reviewed revision')
    expect((await rows('SELECT * FROM social_publishing_audit_events'))).toHaveLength(2)
  })
  it('does not send a mutation when live caption changed',async () => {
    live='Someone edited on Facebook'
    await expect(run()).rejects.toThrow('caption changed')
    expect(writes()).toHaveLength(0)
    expect((await stored()).status).toBe('failed')
  })
  it('records failed preflight without a provider write',async () => {
    provider.mockRejectedValue(new Error('Unavailable'))
    await expect(run()).rejects.toThrow('No change was sent')
    expect(writes()).toHaveLength(0)
    expect((await stored()).status).toBe('failed')
  })
  it('keeps an ambiguous mutation blocked and never retries it',async () => {
    provider.mockImplementation(async (_a,_id,method) => { if(method==='POST') throw new Error('timeout'); return {message:live} })
    expect((await run()).status).toBe('uncertain')
    await run()
    expect(writes()).toHaveLength(1)
    await expect(run({operationId:ids.other})).rejects.toThrow('unresolved')
  })
  it('reconciles an ambiguous edit by readback only',async () => {
    provider.mockImplementation(async (_a,_id,method,message) => { if(method==='POST'){live=message;throw new Error('timeout')}return {message:live} })
    await run()
    const result=await run({action:'reconcile'})
    expect(result.status).toBe('succeeded')
    expect(writes()).toHaveLength(1)
  })
  it('keeps unmatched edit uncertain',async () => {
    provider.mockImplementation(async (_a,_id,method) => {if(method==='POST')throw new Error('timeout');return {message:live}})
    await run()
    await expect(run({action:'reconcile'})).rejects.toThrow('not confirmed')
    expect((await stored()).status).toBe('uncertain')
  })
  it('serializes concurrent changes and sends only one mutation',async () => {
    const results=await Promise.allSettled([run(),run({operationId:ids.other})])
    expect(results.some(r=>r.status==='fulfilled')).toBe(true)
    expect(writes()).toHaveLength(1)
  })
  it('treats repeated request id as idempotent',async () => {
    await Promise.all([run(),run()])
    expect(writes()).toHaveLength(1)
    expect(await rows('SELECT * FROM social_live_operations')).toHaveLength(1)
  })
  it('rejects reuse of an operation id for different text',async () => {
    await run()
    await expect(run({message:'Different'})).rejects.toThrow('different request')
    expect(writes()).toHaveLength(1)
  })
  it('retains archive on removal and prevents another removal',async () => {
    await run({action:'remove',message:undefined})
    expect((await stored()).status).toBe('succeeded')
    expect((await rows('SELECT * FROM social_posts'))[0].metadata.liveFacebook[ids.account].removed).toBe(true)
    await expect(rows('DELETE FROM social_posts')).rejects.toThrow()
    await expect(run({operationId:ids.other,action:'remove',message:undefined})).rejects.toThrow('removed')
    expect(writes()).toHaveLength(1)
    expect((await readLiveFacebook(ids.post,ids.client,ids.account)).removed).toBe(true)
  })
  it('does not infer removed from a failed read',async () => {
    provider.mockImplementation(async (_a,_id,method) => {if(method==='DELETE')throw new Error('timeout');return {message:live}})
    await run({action:'remove',message:undefined})
    await expect(run({action:'reconcile'})).rejects.toThrow('unconfirmed')
    expect((await stored()).status).toBe('uncertain')
  })
  it.each(['pending','approved','rejected','revision_requested'])('preserves customer approval gate %s',async status => {
    await rows('UPDATE social_posts SET client_approval_status=$1',[status])
    await expect(run()).rejects.toThrow('customer approval')
    expect(provider).not.toHaveBeenCalled()
  })
  it('rejects cross-client account',async () => {
    await rows('UPDATE social_accounts SET client_id=$1',[ids.other])
    await expect(run()).rejects.toThrow('unavailable')
    expect(provider).not.toHaveBeenCalled()
  })
  it('rolls back reservation if mandatory audit fails',async () => {
    await rows("ALTER TABLE social_publishing_audit_events ADD CONSTRAINT reject_test CHECK(action <> 'live_post_requested')")
    try {await expect(run()).rejects.toThrow();expect(provider).not.toHaveBeenCalled();expect(await rows('SELECT * FROM social_live_operations')).toHaveLength(0)}
    finally {await rows('ALTER TABLE social_publishing_audit_events DROP CONSTRAINT reject_test')}
  })
  it('keeps operation history visible when Facebook read fails',async () => {
    await run()
    provider.mockRejectedValue(new Error('provider down'))
    const result=await readLiveFacebook(ids.post,ids.client,ids.account)
    expect(result.message).toBeNull()
    expect(result.readError).toBeTruthy()
    expect(result.operations).toHaveLength(1)
  })
})
