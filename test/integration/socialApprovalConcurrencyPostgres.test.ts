import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { socialReviewVersionSql } from '../../server/utils/socialPublishing/reviewVersion'

const pool = new Pool({ host: '127.0.0.1', port: 55473, user: 'xf_workflow_test', database: 'postgres', max: 8 })
const schema = `approval_integrity_${process.pid}`
let beforeUpdate: (() => Promise<void>) | null = null
async function connection() {
  const c = await pool.connect()
  await c.query(`SET search_path TO ${schema},public`)
  return c
}
async function rows(sql: string, params: unknown[] = []) {
  if (/^\s*(UPDATE social_posts|WITH existing)/i.test(sql) && beforeUpdate) {
    const fn = beforeUpdate
    beforeUpdate = null
    await fn()
  }
  const c = await connection()
  try {
    return (await c.query(sql, params)).rows
  } finally {
    c.release()
  }
}
async function transaction(fn: (c: PoolClient) => Promise<unknown>) {
  const c = await connection()
  await c.query('BEGIN')
  try {
    const result = await fn(c)
    await c.query('COMMIT')
    return result
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    c.release()
  }
}
vi.mock('~~/server/utils/db', () => ({
  queryOne: async (sql: string, params: unknown[]) => (await rows(sql, params))[0],
  queryOneFresh: async (sql: string, params: unknown[]) => (await rows(sql, params))[0], queryRows: rows, queryRowsFresh: rows,
  execute: rows, transaction
}))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'manager' }), requireWriteAccess: async () => ({ id: 'manager' }) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: async () => ({ id: 'manager' }) }))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: vi.fn(), createBulkNotifications: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing/audit', () => ({ recordSocialPublishingAudit: vi.fn() }))
vi.mock('~~/server/utils/socialNewsFeedback', () => ({ recordSocialNewsFeedback: vi.fn() }))
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({ startSocialPublishingWorkflow: vi.fn() }))
const publish = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/socialPublishing', () => ({ publishPost: publish }))
vi.mock('~~/server/utils/socialNewsAutopostSource', () => ({ verifyAutomaticNewsSource: async () => 'ready' }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', (e: { id: string }) => e.id)
vi.stubGlobal('readBody', (e: { body?: unknown }) => e.body || {})
vi.stubGlobal('createError', (e: { statusCode: number, statusMessage: string }) => Object.assign(new Error(e.statusMessage), e))
const { default: approve } = await import('../../server/api/agency/social/publishing/posts/[id]/approve.post')
const { default: reject } = await import('../../server/api/agency/social/publishing/posts/[id]/reject.post')
const { default: request } = await import('../../server/api/agency/social/publishing/posts/[id]/request-approval.post')
const { default: patch } = await import('../../server/api/agency/social/publishing/posts/[id]/index.patch')
const { respondToPortalSocialNewsDraft } = await import('../../server/utils/socialNewsPortal')
const { claimAndPublishSocialPost } = await import('../../server/utils/socialPublishing/dispatch')
const id = '11111111-1111-4111-8111-111111111111', clientId = '22222222-2222-4222-8222-222222222222'
const read = async () => (await rows(`SELECT *, ${socialReviewVersionSql()} AS review_version FROM social_posts WHERE id=$1`, [id]))[0]
const event = (reviewVersion?: string) => ({ id, body: { reviewVersion, reason: 'Revise copy' } }) as never
const db = { queryRows: rows, transaction }
describe.skipIf(process.env.XF_LOCAL_WORKFLOW_TESTS !== '1')('approval integrity with PostgreSQL', () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`)
    await rows(`CREATE TABLE social_posts(id uuid PRIMARY KEY,client_id uuid,content text,status text,platforms text[],account_ids uuid[],metadata jsonb DEFAULT '{}',updated_at timestamptz DEFAULT NOW(),approval_requested_at timestamptz,approval_requested_by text,approved_at timestamptz,approved_by text,rejection_reason text,scheduled_at timestamptz,due_at timestamptz,client_approval_status text,client_approval_responded_by text,client_approval_responded_at timestamptz,client_approval_feedback text,last_attempt_at timestamptz,publish_attempts int DEFAULT 0);
      CREATE TABLE team_members(id text,role text);
      CREATE TABLE social_content_package_versions(id uuid,commercial_scope jsonb);
      CREATE TABLE social_content_package_assignments(id uuid,package_version_id uuid);
      CREATE TABLE social_news_autopost_rules(id uuid,client_id uuid,mode text,account_id uuid);`)
  })
  beforeEach(async () => {
    beforeUpdate = null
    publish.mockReset()
    await rows('TRUNCATE social_posts')
    await rows('INSERT INTO social_posts(id,client_id,content,status,platforms,account_ids,approval_requested_at) VALUES($1,$2,\'Original\',\'draft\',\'{facebook}\',\'{}\',NOW())', [id, clientId])
  })
  afterAll(async () => {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`)
    await pool.end()
  })
  it('accepts exactly one concurrent decision for the same reviewed row', async () => {
    const version = (await read()).review_version
    const result = await Promise.allSettled([approve(event(version)), approve(event(version))])
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await read()).status).toBe('approved')
  })
  it.each([approve, reject])('rejects a preview made stale before the request', async (action) => {
    const version = (await read()).review_version
    await rows('UPDATE social_posts SET content=\'Changed\' WHERE id=$1', [id])
    await expect(action(event(version))).rejects.toMatchObject({ statusCode: 409 })
    expect((await read()).status).toBe('draft')
  })
  it('rejects an edit that races the approval SQL update', async () => {
    const version = (await read()).review_version
    beforeUpdate = async () => {
      await rows('UPDATE social_posts SET content=\'Concurrent change\' WHERE id=$1', [id])
    }
    await expect(approve(event(version))).rejects.toMatchObject({ statusCode: 409 })
    expect((await read()).approved_at).toBeNull()
  })
  it('does not let an old patch overwrite approval that wins the race', async () => {
    beforeUpdate = async () => {
      await rows('UPDATE social_posts SET status=\'approved\',approved_at=NOW() WHERE id=$1', [id])
    }
    await expect(patch({ id, body: { content: 'Changed' } } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(await read()).toMatchObject({ content: 'Original', status: 'approved' })
  })
  it('resets any customer decision when editable content changes', async () => {
    await rows('UPDATE social_posts SET client_approval_status=\'approved\' WHERE id=$1', [id])
    await patch({ id, body: { content: 'Changed' } } as never)
    expect(await read()).toMatchObject({ content: 'Changed', client_approval_status: 'pending', approval_requested_at: null })
  })
  it.each(['published', 'partially_published', 'publishing', 'cancelled'])('preserves terminal %s records across request and reject', async (status) => {
    await rows('UPDATE social_posts SET status=$2 WHERE id=$1', [id, status])
    const version = (await read()).review_version
    await expect(request(event())).rejects.toMatchObject({ statusCode: 409 })
    await expect(reject(event(version))).rejects.toMatchObject({ statusCode: 409 })
    expect((await read()).status).toBe(status)
  })
  it('prevents re-requesting when the post changed concurrently', async () => {
    beforeUpdate = async () => {
      await rows('UPDATE social_posts SET status=\'publishing\' WHERE id=$1', [id])
    }
    await expect(request(event())).rejects.toMatchObject({ statusCode: 409 })
    expect((await read()).status).toBe('publishing')
  })
  it('rejects an outdated portal decision under a row lock', async () => {
    await rows('UPDATE social_posts SET client_approval_status=\'pending\',metadata=\'{"source":"mcp_news"}\' WHERE id=$1', [id])
    const version = (await read()).review_version
    await rows('UPDATE social_posts SET content=\'Changed again\' WHERE id=$1', [id])
    await expect(respondToPortalSocialNewsDraft(db as never, { clientId, clientUserId: 'customer', postId: id, reviewVersion: version, action: 'approve', feedback: null })).rejects.toMatchObject({ statusCode: 409 })
    expect((await read()).client_approval_status).toBe('pending')
  })
  it.each(['pending', 'rejected', 'revision_requested'])('never dispatches when customer status is %s', async (status) => {
    await rows('UPDATE social_posts SET status=\'approved\',client_approval_status=$2 WHERE id=$1', [id, status])
    const result = await claimAndPublishSocialPost({ postId: id, clientId, claimStatuses: ['approved'], source: 'manual', log: { log() {}, warn() {}, error() {} } })
    expect(result.skipped).toBe(true)
    expect(publish).not.toHaveBeenCalled()
    expect((await read()).status).toBe('approved')
  })
})
