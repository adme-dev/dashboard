import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import type { H3Event } from 'h3'
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: vi.fn() }))
vi.mock('~~/server/utils/video/assetLinks', () => ({ videoAssetPublicUrl: async (id: string) => `https://app.test/api/public/video-assets/${id}` }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.test' }))
import { createBannerSocialDraft } from '../../server/utils/banner/socialDraft'
const pool = new Pool({ host: '127.0.0.1', port: 55473, user: 'xf_workflow_test', database: 'postgres', max: 8 })
const schema = `banner_draft_${process.pid}`
const project = '22222222-2222-4222-8222-222222222222', job = '11111111-1111-4111-8111-111111111111'
async function using<T>(fn: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect()
  try { await db.query(`SET search_path TO ${schema}, public`); return await fn(db) } finally { db.release() }
}
async function run() {
  return using(async db => {
    await db.query('BEGIN')
    try {
      const result = await createBannerSocialDraft({ context: { cloudflare: { env: { MEDIA_BUCKET: { head: async () => ({ size: 123 }) } } } } } as unknown as H3Event, job, 'actor', db as any)
      await db.query('COMMIT')
      return result
    } catch (e) { await db.query('ROLLBACK'); throw e }
  })
}
describe.skipIf(process.env.XF_LOCAL_WORKFLOW_TESTS !== '1')('Banner social draft transactions', () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`)
    await using(db => db.query(`CREATE TABLE banner_projects(id uuid PRIMARY KEY,client_id text,name text);
      CREATE TABLE banner_render_jobs(id uuid PRIMARY KEY,project_id uuid,status text,r2_key text,width int,height int,quality int,format_key text);
      CREATE TABLE video_assets(id uuid PRIMARY KEY,client_id text,created_by text,title text,source_project_id uuid,source_job_id uuid,r2_key text,format text,width int,height int);
      CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id text,created_by text,content text,media_urls text[],platforms text[],tags text[],status text,metadata jsonb);
      CREATE TABLE social_publishing_audit_events(client_id text,post_id uuid,actor_id text,action text,metadata jsonb);`))
  })
  beforeEach(async () => using(async db => {
    await db.query('TRUNCATE banner_projects,banner_render_jobs,video_assets,social_posts,social_publishing_audit_events')
    await db.query('INSERT INTO banner_projects VALUES($1,\'client\',\'Demo\')', [project])
    await db.query('INSERT INTO banner_render_jobs VALUES($1,$2,\'done\',$3,1080,1350,1,\'ig_port\')', [job, project, `banner-videos/${project}/demo.mp4`])
  }))
  afterAll(async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() })
  it('serializes six concurrent requests to one asset, post and audit record', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, run))
    expect(new Set(results.map(r => r.postId)).size).toBe(1)
    await using(async db => {
      for (const table of ['video_assets', 'social_posts', 'social_publishing_audit_events']) {
        expect((await db.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count).toBe('1')
      }
      expect((await db.query('SELECT status, content FROM social_posts')).rows[0]).toEqual({ status: 'draft', content: '' })
    })
  })
  it('rolls back both asset and post when audit storage rejects the write', async () => {
    await using(db => db.query("ALTER TABLE social_publishing_audit_events ADD CONSTRAINT reject_audit CHECK (action <> 'post_created')"))
    try {
      await expect(run()).rejects.toThrow('reject_audit')
      await using(async db => {
        expect((await db.query('SELECT COUNT(*) FROM social_posts')).rows[0].count).toBe('0')
        expect((await db.query('SELECT COUNT(*) FROM video_assets')).rows[0].count).toBe('0')
      })
    } finally { await using(db => db.query('ALTER TABLE social_publishing_audit_events DROP CONSTRAINT reject_audit')) }
  })
})
