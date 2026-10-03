import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { readFileSync } from 'node:fs'

const pool = new Pool({ host: '127.0.0.1', port: 55473, user: 'xf_workflow_test', database: 'postgres', max: 8 })
const schema = `social_live_review_${process.pid}`
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
vi.mock('~~/server/utils/socialPublishing/liveFacebook', async load => ({ ...await load<typeof import('~~/server/utils/socialPublishing/liveFacebook')>(), facebookLiveRequest: provider }))
const { manageLiveFacebook } = await import('~~/server/utils/socialPublishing/liveOperations')
const { requestLiveReview, respondLiveReview, listLiveReviews } = await import('~~/server/utils/socialPublishing/liveReviews')
const ids = { post: '11111111-1111-4111-8111-111111111111', client: '22222222-2222-4222-8222-222222222222', account: '33333333-3333-4333-8333-333333333333', operation: '44444444-4444-4444-8444-444444444444', other: '55555555-5555-4555-8555-555555555555' }
let live = 'Original caption'
const input = () => ({ operationId: ids.operation, accountId: ids.account, action: 'edit' as const, expectedMessage: 'Original caption', message: 'Reviewed revision' })
const run = (patch = {}) => manageLiveFacebook(ids.post, ids.client, 'manager', { ...input(), ...patch })
const writes = () => provider.mock.calls.filter(c => c[2] !== 'GET')
const stored = async () => (await rows('SELECT * FROM social_live_operations'))[0]
const propose = (patch = {}) => requestLiveReview(ids.post, ids.client, 'manager', { ...input(), ...patch })
const decide = (action: string) => respondLiveReview(ids.client, 'customer', ids.operation, action, 'Please revise')
const apply = (patch = {}) => run({ reviewRequestId: ids.operation, ...patch })
const requests = () => rows('SELECT * FROM social_live_review_requests')
describe.skipIf(process.env.XF_LOCAL_WORKFLOW_TESTS !== '1')('live Facebook operations with PostgreSQL', () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`)
    await rows(`CREATE TABLE agency_clients(id uuid PRIMARY KEY);
      CREATE TABLE client_users(id text PRIMARY KEY,client_id uuid,name text);
      CREATE TABLE team_members(id uuid PRIMARY KEY,name text);
      CREATE TABLE social_accounts(id uuid PRIMARY KEY,client_id uuid,platform text,platform_account_id text,access_token text,is_active boolean,account_name text);
      CREATE TABLE social_posts(id uuid PRIMARY KEY,client_id uuid,status text,client_approval_status text,metadata jsonb DEFAULT '{}',account_ids uuid[],platform_results jsonb,updated_at timestamptz);
      CREATE TABLE social_publishing_audit_events(client_id uuid,post_id uuid,social_account_id uuid,actor_id text,action text,metadata jsonb);`)
    await rows(readFileSync('server/database/migrations/448_social_live_operations.sql', 'utf8'))
    await rows(readFileSync('server/database/migrations/449_social_live_review_requests.sql', 'utf8'))
  })
  beforeEach(async () => {
    await rows('TRUNCATE social_live_review_requests,social_live_operations,social_publishing_audit_events,social_posts,social_accounts,agency_clients CASCADE')
    await rows('INSERT INTO agency_clients VALUES ($1),($2)', [ids.client, ids.other])
    await rows('INSERT INTO social_accounts VALUES($1,$2,\'facebook\',\'123\',\'test-token\',TRUE,\'Example Page\')', [ids.account, ids.client])
    await rows('INSERT INTO social_posts(id,client_id,status,account_ids,platform_results) VALUES($1,$2,\'published\',$3,$4::jsonb)', [ids.post, ids.client, [ids.account], JSON.stringify({ facebook: { status: 'success', platform: 'facebook', accountId: ids.account, platformAccountId: '123', platformPostId: '123_456' } })])
    await rows('UPDATE social_posts SET client_approval_status=\'approved\'')
    live = 'Original caption'
    provider.mockReset()
    provider.mockImplementation(async (_a, _id, method, message) => {
      if (method === 'POST') live = message
      return { message: live }
    })
  })
  afterAll(async () => {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`)
    await pool.end()
  })
  it('requires a customer decision and a separate staff apply', async () => {
    const request = await propose()
    expect(request.status).toBe('pending')
    expect(writes()).toHaveLength(0)
    await expect(apply()).rejects.toThrow('approved')
    await decide('approve')
    expect(writes()).toHaveLength(0)
    expect((await apply()).status).toBe('succeeded')
    expect(writes()).toHaveLength(1)
    expect((await requests())[0].status).toBe('submitted')
    const events = await rows('SELECT * FROM social_publishing_audit_events')
    expect(events.some(e => e.actor_id === 'client:customer')).toBe(true)
    expect(events.some(e => e.actor_id === 'manager')).toBe(true)
  })
  it('rejects direct changes even after the customer approves a request', async () => {
    await propose()
    await decide('approve')
    await expect(run()).rejects.toThrow('customer approval')
    expect(writes()).toHaveLength(0)
  })
  it.each(['reject', 'request_changes'])('retains %s feedback without provider writes', async (action) => {
    await propose()
    await decide(action)
    await expect(apply()).rejects.toThrow('approved')
    expect((await requests())[0].feedback).toBe('Please revise')
    expect(writes()).toHaveLength(0)
  })
  it('prevents cross-client decisions and history reads', async () => {
    await propose()
    expect(await listLiveReviews(ids.other)).toHaveLength(0)
    await expect(respondLiveReview(ids.other, 'customer', ids.operation, 'approve', '')).rejects.toMatchObject({ statusCode: 404 })
    expect(writes()).toHaveLength(0)
  })
  it('accepts only one concurrent customer decision', async () => {
    await propose()
    const results = await Promise.allSettled([decide('approve'), decide('reject')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(writes()).toHaveLength(0)
  })
  it('makes request creation idempotent and rejects reusing its ID with different text', async () => {
    await propose()
    await propose()
    expect(await requests()).toHaveLength(1)
    await expect(propose({ message: 'Different' })).rejects.toThrow('different request')
  })
  it('supersedes an approved version when staff submits a replacement', async () => {
    await propose()
    await decide('approve')
    await propose({ operationId: ids.other, message: 'Replacement' })
    await expect(apply()).rejects.toThrow('approved')
    expect((await requests()).find(r => r.id === ids.operation).status).toBe('superseded')
    expect(writes()).toHaveLength(0)
  })
  it('rejects expiry before customer approval and before manager apply', async () => {
    await propose()
    await rows('UPDATE social_live_review_requests SET expires_at=NOW()-INTERVAL \'1 second\'')
    await expect(decide('approve')).rejects.toMatchObject({ statusCode: 409 })
    await rows('UPDATE social_live_review_requests SET status=\'approved\'')
    await expect(apply()).rejects.toThrow('approved')
    expect(writes()).toHaveLength(0)
  })
  it('rejects an approved request if the underlying post changed', async () => {
    await propose()
    await decide('approve')
    await rows('UPDATE social_posts SET metadata=\'{"changed":true}\'')
    await expect(apply()).rejects.toThrow('changed')
    expect(writes()).toHaveLength(0)
  })
  it('rejects a mismatched action or caption', async () => {
    await propose()
    await decide('approve')
    await expect(apply({ message: 'Tampered' })).rejects.toThrow('match')
    await expect(apply({ action: 'remove', message: undefined })).rejects.toThrow('match')
    expect(writes()).toHaveLength(0)
  })
  it('does not send an approved change after an external Facebook edit', async () => {
    await propose()
    await decide('approve')
    live = 'External edit'
    await expect(apply()).rejects.toThrow('caption changed')
    expect(writes()).toHaveLength(0)
    expect((await stored()).status).toBe('failed')
  })
  it('serializes concurrent applies and repeated requests without duplicate provider writes', async () => {
    await propose()
    await decide('approve')
    await Promise.allSettled([apply(), apply()])
    await apply()
    expect(writes()).toHaveLength(1)
    expect(await rows('SELECT * FROM social_live_operations')).toHaveLength(1)
  })
  it('supports reviewed removal while retaining the publication', async () => {
    await propose({ action: 'remove', message: undefined })
    await decide('approve')
    expect((await apply({ action: 'remove', message: undefined })).status).toBe('succeeded')
    expect(writes()[0][2]).toBe('DELETE')
    expect(await rows('SELECT * FROM social_posts')).toHaveLength(1)
  })
  it('rolls back consumption when the mandatory operation audit fails', async () => {
    await propose()
    await decide('approve')
    await rows('ALTER TABLE social_publishing_audit_events ADD CONSTRAINT reject_test CHECK(action <> \'live_post_requested\')')
    try {
      await expect(apply()).rejects.toThrow()
      expect((await requests())[0].status).toBe('approved')
      expect(writes()).toHaveLength(0)
    } finally { await rows('ALTER TABLE social_publishing_audit_events DROP CONSTRAINT reject_test') }
  })
})
