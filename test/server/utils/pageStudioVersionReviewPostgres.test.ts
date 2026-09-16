import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { reviewPageStudioVersion, type PageStudioVersionQueryClient } from '~~/server/utils/pageStudio/versions'

const databaseUrl = process.env.PAGE_STUDIO_GRANT_DATABASE_TEST_URL
describe.runIf(Boolean(databaseUrl))('version review comparison on disposable PostgreSQL', () => {
  const schema = `studio_review_${randomUUID().replaceAll('-', '')}`
  const scope = { tenantId: 'review_fixture', clientId: randomUUID(), siteId: randomUUID() }
  const versionId = randomUUID(), releaseId = randomUUID(), digest = 'a'.repeat(64)
  const input = { ...scope, versionId, reviewerId: randomUUID(), decision: 'approved' as const,
    expectedComparison: { checkpointId: 'checkpoint', digest, releaseId, hostname: 'review.example.invalid' } }
  let db: pg.Client, concurrent: pg.Client
  let afterPointerLock: (() => Promise<void>) | undefined
  async function runTransaction<T>(work: (client: PageStudioVersionQueryClient) => Promise<T>) {
    await db.query('BEGIN')
    try {
      const result = await work({ query: async (sql: string, params?: unknown[]) => {
        const rows = await db.query(sql, params)
        if (sql.includes('SELECT active_release_id')) await afterPointerLock?.()
        return rows
      } })
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }
  beforeAll(async () => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(databaseUrl!).hostname)
    db = new pg.Client({ connectionString: databaseUrl })
    concurrent = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await concurrent.connect()
    await db.query(`CREATE SCHEMA ${schema}`)
    await db.query(`SET search_path TO ${schema}`)
    await concurrent.query(`SET search_path TO ${schema}`)
    await db.query(`
      CREATE TABLE page_studio_sites (tenant_id text, client_id uuid, id uuid PRIMARY KEY, current_version_id uuid, current_checkpoint_id text);
      CREATE TABLE page_studio_versions (tenant_id text, client_id uuid, site_id uuid, id uuid PRIMARY KEY, digest text, status text, checkpoint_id text, submitted_at timestamptz, updated_at timestamptz);
      CREATE TABLE page_studio_release_pointers (tenant_id text, client_id uuid, site_id uuid, environment text, normalized_hostname text, active_release_id uuid);
      CREATE TABLE page_studio_reviews (id uuid DEFAULT gen_random_uuid(), tenant_id text, client_id uuid, site_id uuid, version_id uuid, version_digest text, reviewer_id uuid, decision text, comment text, decided_at timestamptz DEFAULT NOW());
      CREATE TABLE page_studio_audit_events (tenant_id text, client_id uuid, site_id uuid, actor_id text, actor_role text, action text, resource_type text, resource_id text, metadata jsonb);
    `)
  })
  beforeEach(async () => {
    afterPointerLock = undefined
    await db.query('TRUNCATE page_studio_sites, page_studio_versions, page_studio_release_pointers, page_studio_reviews, page_studio_audit_events')
    await db.query('INSERT INTO page_studio_sites VALUES ($1,$2,$3,$4,$5)', [...Object.values(scope), versionId, 'checkpoint'])
    await db.query('INSERT INTO page_studio_versions (tenant_id,client_id,site_id,id,digest,status,checkpoint_id) VALUES ($1,$2,$3,$4,$5,\'in_review\',\'checkpoint\')', [...Object.values(scope), versionId, digest])
    await db.query('INSERT INTO page_studio_release_pointers VALUES ($1,$2,$3,\'production\',$4,$5)', [...Object.values(scope), input.expectedComparison.hostname, releaseId])
  })
  afterAll(async () => {
    await concurrent?.end()
    if (db) {
      await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await db.end()
    }
  })
  it('writes the decision and exact digest audit together', async () => {
    expect(await reviewPageStudioVersion(input, { runTransaction })).toMatchObject({ decision: 'approved', versionDigest: digest })
    expect((await db.query('SELECT status FROM page_studio_versions')).rows[0].status).toBe('approved')
    expect((await db.query('SELECT metadata FROM page_studio_audit_events')).rows[0].metadata.digest).toBe(digest)
  })
  it.each(['checkpoint', 'release'])('rejects a stale %s without a decision or audit', async (changed) => {
    if (changed === 'checkpoint') await db.query('UPDATE page_studio_sites SET current_checkpoint_id=\'new\'')
    else await db.query('UPDATE page_studio_release_pointers SET active_release_id=$1', [randomUUID()])
    await expect(reviewPageStudioVersion(input, { runTransaction })).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.query('SELECT * FROM page_studio_reviews')).rowCount).toBe(0)
    expect((await db.query('SELECT * FROM page_studio_audit_events')).rowCount).toBe(0)
  })
  it('holds both draft and live-pointer locks through the decision transaction', async () => {
    afterPointerLock = async () => {
      await concurrent.query('SET lock_timeout=\'100ms\'')
      await expect(concurrent.query('UPDATE page_studio_sites SET current_checkpoint_id=\'racing\'')).rejects.toMatchObject({ code: '55P03' })
      await expect(concurrent.query('UPDATE page_studio_release_pointers SET active_release_id=$1', [randomUUID()])).rejects.toMatchObject({ code: '55P03' })
    }
    await expect(reviewPageStudioVersion(input, { runTransaction })).resolves.toMatchObject({ decision: 'approved' })
  })
})
