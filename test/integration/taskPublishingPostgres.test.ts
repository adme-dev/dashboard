import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { readFileSync } from 'node:fs'

const pool = new Pool({ host: '127.0.0.1', port: 55473, user: 'xf_workflow_test', database: 'postgres', max: 8 })
const schema = `publishing_handoff_${process.pid}`
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
  transaction: async (fn: (db: PoolClient) => Promise<unknown>) => {
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
const { handoffTaskPublishing, getTaskPublishing } = await import('~~/server/utils/taskPublishing')
const ids = { task: '11111111-1111-4111-8111-111111111111', otherTask: '22222222-2222-4222-8222-222222222222', project: '33333333-3333-4333-8333-333333333333', client: '44444444-4444-4444-8444-444444444444', otherClient: '55555555-5555-4555-8555-555555555555', post: '66666666-6666-4666-8666-666666666666' }
const authorize = vi.fn().mockResolvedValue(undefined)
const run = (input: { postId?: string } = {}, taskId = ids.task) => handoffTaskPublishing(taskId, 'manager', input, authorize)
describe.skipIf(process.env.XF_LOCAL_WORKFLOW_TESTS !== '1')('task → Planner with isolated PostgreSQL', () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`)
    await rows(`CREATE TABLE agency_clients(id uuid PRIMARY KEY); CREATE TABLE projects(id uuid PRIMARY KEY, client_id uuid); CREATE TABLE briefs(id uuid PRIMARY KEY, client_id uuid); CREATE TABLE tasks(id uuid PRIMARY KEY, project_id uuid, brief_id uuid, department_id uuid, title text, description text); CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, created_by text, content text, status text DEFAULT 'draft', timezone text, platforms text[], metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT NOW(), approval_requested_at timestamptz, approved_at timestamptz, scheduled_at timestamptz, published_at timestamptz); CREATE TABLE social_publishing_audit_events(client_id uuid, post_id uuid, actor_id text, action text, metadata jsonb);`)
    await rows(readFileSync('server/database/migrations/447_task_publishing_handoff.sql', 'utf8'))
  })
  beforeEach(async () => {
    authorize.mockClear()
    authorize.mockResolvedValue(undefined)
    await rows('TRUNCATE social_publishing_audit_events, task_publishing_links, social_posts, tasks, projects, agency_clients CASCADE')
    await rows('INSERT INTO agency_clients VALUES ($1),($2)', [ids.client, ids.otherClient])
    await rows('INSERT INTO projects VALUES ($1,$2)', [ids.project, ids.client])
    await rows('INSERT INTO tasks VALUES ($1,$3,NULL,$4,\'Publish introduction\',\'Review exact video and caption\'),($2,$3,NULL,$4,\'Other delivery\',\'Criteria\')', [ids.task, ids.otherTask, ids.project, ids.client])
  })
  afterAll(async () => {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`)
    await pool.end()
  })
  it('creates one unscheduled draft across concurrent retries', async () => {
    const results = await Promise.all([run(), run(), run()])
    expect(new Set(results.map(r => r.post.id)).size).toBe(1)
    const posts = await rows('SELECT * FROM social_posts')
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ status: 'draft', client_id: ids.client, scheduled_at: null, approved_at: null, content: '' })
    expect(await rows('SELECT * FROM task_publishing_links')).toHaveLength(1)
    expect(await rows('SELECT * FROM social_publishing_audit_events')).toHaveLength(1)
    expect(authorize).toHaveBeenCalledWith(ids.client, ids.client)
  })
  it('links an existing same-client draft without replacing its creative', async () => {
    await rows('INSERT INTO social_posts(id,client_id,content) VALUES($1,$2,\'Approved source creative\')', [ids.post, ids.client])
    const result = await run({ postId: ids.post })
    expect(result.post.id).toBe(ids.post)
    expect((await rows('SELECT content FROM social_posts'))[0].content).toBe('Approved source creative')
    expect((await run()).post.id).toBe(ids.post)
  })
  it('rejects another client’s post', async () => {
    await rows('INSERT INTO social_posts(id,client_id) VALUES($1,$2)', [ids.post, ids.otherClient])
    await expect(run({ postId: ids.post })).rejects.toMatchObject({ statusCode: 409 })
    expect(await rows('SELECT * FROM task_publishing_links')).toHaveLength(0)
  })
  it('does not attach one post to two delivery tasks', async () => {
    const first = await run()
    await expect(run({ postId: first.post.id }, ids.otherTask)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('does not silently replace a linked draft', async () => {
    await run()
    await expect(run({ postId: ids.post })).rejects.toMatchObject({ statusCode: 409 })
  })
  it.each(['scheduled', 'published', 'publishing'])('rejects linking a %s post', async (status) => {
    await rows('INSERT INTO social_posts(id,client_id,status) VALUES($1,$2,$3)', [ids.post, ids.client, status])
    await expect(run({ postId: ids.post })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('rejects a draft already under review', async () => {
    await rows('INSERT INTO social_posts(id,client_id,approval_requested_at) VALUES($1,$2,NOW())', [ids.post, ids.client])
    await expect(run({ postId: ids.post })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('offers only same-client, unreviewed, unlinked drafts', async () => {
    await rows('INSERT INTO social_posts(id,client_id,content) VALUES($1,$2,\'Product video\')', [ids.post, ids.client])
    await rows('INSERT INTO social_posts(client_id,content) VALUES($1,\'Other client\')', [ids.otherClient])
    const available = await getTaskPublishing(ids.task, authorize)
    expect(available.drafts).toEqual([{ id: ids.post, content: 'Product video' }])
    await run({ postId: ids.post })
    expect((await getTaskPublishing(ids.otherTask, authorize)).drafts).toHaveLength(0)
  })
  it('reads the linked post’s current status without duplicating it', async () => {
    const linked = await run()
    await rows('UPDATE social_posts SET status=\'published\' WHERE id=$1', [linked.post.id])
    const state = await getTaskPublishing(ids.task, authorize)
    expect(state.post).toMatchObject({ id: linked.post.id, status: 'published' })
    expect(state.drafts).toHaveLength(0)
    expect((await run()).post).toMatchObject({ id: linked.post.id, status: 'published' })
  })
  it('denied access leaves no draft or link', async () => {
    authorize.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    expect(await rows('SELECT * FROM social_posts')).toHaveLength(0)
  })
  it('rolls back creation if its audit cannot persist', async () => {
    await rows('ALTER TABLE social_publishing_audit_events ADD CONSTRAINT reject_audit CHECK (action=\'impossible\')')
    try {
      await expect(run()).rejects.toThrow()
      expect(await rows('SELECT * FROM social_posts')).toHaveLength(0)
      expect(await rows('SELECT * FROM task_publishing_links')).toHaveLength(0)
    } finally { await rows('ALTER TABLE social_publishing_audit_events DROP CONSTRAINT reject_audit') }
  })
  it('detects project client changes before reopening a linked post', async () => {
    await run()
    await rows('UPDATE projects SET client_id=$1 WHERE id=$2', [ids.otherClient, ids.project])
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
  })
})
