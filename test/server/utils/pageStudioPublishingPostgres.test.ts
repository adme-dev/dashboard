import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  activatePageStudioRelease, rollbackPageStudioRelease,
  type PageStudioPublishingQueryClient
} from '~~/server/utils/pageStudio/publishing'

const databaseUrl = process.env.PAGE_STUDIO_GRANT_DATABASE_TEST_URL

describe.runIf(Boolean(databaseUrl))('Page Studio publication lifecycle on disposable PostgreSQL', () => {
  let client: pg.Client
  const scope = { tenantId: 'lifecycle-fixture', clientId: randomUUID(), siteId: randomUUID() }
  const versionId = randomUUID()
  const digest = 'a'.repeat(64)
  const buildId = `build_${digest.slice(0, 32)}`
  const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${digest}`
  const input = {
    scope, buildId, actorId: randomUUID(), environment: 'staging' as const,
    hostname: 'lifecycle.example.invalid', expectedActiveReleaseId: null,
    idempotencyKey: 'first-publish'
  }
  async function runTransaction<T>(operation: (db: PageStudioPublishingQueryClient) => Promise<T>): Promise<T> {
    await client.query('BEGIN')
    try {
      const result = await operation(client as unknown as PageStudioPublishingQueryClient)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
  const activate = (overrides = {}) => activatePageStudioRelease({ ...input, ...overrides }, { runTransaction })
  async function snapshot() {
    const site = (await client.query('SELECT status, current_release_id FROM page_studio_sites')).rows[0]
    const version = (await client.query('SELECT status FROM page_studio_versions')).rows[0]
    const counts = (await client.query(`SELECT
      (SELECT COUNT(*)::int FROM page_studio_releases) AS releases,
      (SELECT COUNT(*)::int FROM page_studio_release_pointers) AS pointers,
      (SELECT COUNT(*)::int FROM page_studio_audit_events) AS audits`)).rows[0]
    return { site, version, counts }
  }
  beforeAll(async () => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    // Connection-private tables model the columns used by the real publishing SQL.
    await client.query(`
      CREATE TEMP TABLE page_studio_sites (tenant_id text, client_id uuid, id uuid PRIMARY KEY,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','archived')),
        current_release_id uuid, updated_at timestamptz);
      CREATE TEMP TABLE page_studio_versions (tenant_id text, client_id uuid, site_id uuid,
        id uuid PRIMARY KEY, digest text, status text, updated_at timestamptz);
      CREATE TEMP TABLE page_studio_builds (tenant_id text, client_id uuid, site_id uuid,
        id text PRIMARY KEY, version_id uuid, version_digest text, state text, artifact_prefix text,
        release_manifest_key text, release_manifest_digest text);
      CREATE TEMP TABLE page_studio_reviews (tenant_id text, client_id uuid, site_id uuid,
        id uuid DEFAULT gen_random_uuid(), version_id uuid, version_digest text, decision text,
        decided_at timestamptz DEFAULT NOW());
      CREATE TEMP TABLE page_studio_releases (tenant_id text, client_id uuid, site_id uuid,
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), build_id text, environment text,
        normalized_hostname text, published_by uuid, superseded_release_id uuid, idempotency_key text);
      CREATE TEMP TABLE page_studio_release_pointers (tenant_id text, client_id uuid, site_id uuid,
        environment text, normalized_hostname text, active_release_id uuid, updated_by uuid,
        pointer_version int DEFAULT 1, updated_at timestamptz,
        UNIQUE(environment, normalized_hostname));
      CREATE TEMP TABLE page_studio_audit_events (tenant_id text, client_id uuid, site_id uuid,
        actor_id text, actor_role text, action text, resource_type text, resource_id text,
        idempotency_key text, metadata jsonb);
    `)
  })
  afterAll(async () => {
    await client?.end()
  })
  beforeEach(async () => {
    await client.query(`TRUNCATE page_studio_sites, page_studio_versions, page_studio_builds,
      page_studio_reviews, page_studio_releases, page_studio_release_pointers, page_studio_audit_events`)
    await client.query('INSERT INTO page_studio_sites (tenant_id,client_id,id) VALUES ($1,$2,$3)', Object.values(scope))
    await client.query(`INSERT INTO page_studio_versions (tenant_id,client_id,site_id,id,digest,status)
      VALUES ($1,$2,$3,$4,$5,'approved')`, [...Object.values(scope), versionId, digest])
    await client.query(`INSERT INTO page_studio_builds VALUES ($1,$2,$3,$4,$5,$6,'succeeded',$7,$8,$9)`,
      [...Object.values(scope), buildId, versionId, digest, prefix, `${prefix}/release-manifest.json`, 'b'.repeat(64)])
    await client.query(`INSERT INTO page_studio_reviews (tenant_id,client_id,site_id,version_id,version_digest,decision)
      VALUES ($1,$2,$3,$4,$5,'approved')`, [...Object.values(scope), versionId, digest])
  })

  it.each(['staging', 'production'] as const)('activates a new draft atomically in %s and replays without duplicate state', async (environment) => {
    const release = await activate({ environment })
    expect(await snapshot()).toEqual({
      site: { status: 'active', current_release_id: release.releaseId },
      version: { status: 'published' }, counts: { releases: 1, pointers: 1, audits: 1 }
    })
    expect((await activate({ environment })).releaseId).toBe(release.releaseId)
    expect((await snapshot()).counts).toEqual({ releases: 1, pointers: 1, audits: 1 })
  })

  it.each(['archived', 'suspended'])('denies %s activation before writing anything', async (status) => {
    await client.query('UPDATE page_studio_sites SET status=$1', [status])
    const before = await snapshot()
    await expect(activate()).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE', statusCode: 409 })
    expect(await snapshot()).toEqual(before)
  })

  it('keeps a draft unchanged when the caller has a stale release pointer', async () => {
    const before = await snapshot()
    await expect(activate({ expectedActiveReleaseId: randomUUID() })).rejects.toMatchObject({ code: 'RELEASE_POINTER_CONFLICT' })
    expect(await snapshot()).toEqual(before)
  })

  it.each(['failed-build', 'rejected-review', 'wrong-digest'])('keeps a draft unchanged for %s', async (failure) => {
    if (failure === 'failed-build') await client.query('UPDATE page_studio_builds SET state=\'failed\'')
    if (failure === 'rejected-review') await client.query('UPDATE page_studio_reviews SET decision=\'rejected\'')
    if (failure === 'wrong-digest') await client.query('UPDATE page_studio_versions SET digest=\'mismatch\'')
    const before = await snapshot()
    await expect(activate()).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
    expect(await snapshot()).toEqual(before)
  })

  it('rolls back status, release, pointer and version if the final audit write fails', async () => {
    const before = await snapshot()
    await client.query('ALTER TABLE page_studio_audit_events ADD CONSTRAINT force_audit_failure CHECK (action <> \'release.activated\')')
    try {
      await expect(activate()).rejects.toMatchObject({ code: '23514' })
      expect(await snapshot()).toEqual(before)
    } finally {
      await client.query('ALTER TABLE page_studio_audit_events DROP CONSTRAINT force_audit_failure')
    }
  })

  it('preserves active status while republishing and rolling back a published version', async () => {
    const first = await activate()
    const second = await activate({ idempotencyKey: 'second-publish', expectedActiveReleaseId: first.releaseId })
    const rolledBack = await rollbackPageStudioRelease({
      ...input, idempotencyKey: 'rollback', expectedActiveReleaseId: second.releaseId, targetReleaseId: first.releaseId
    }, { runTransaction })
    expect(rolledBack.releaseId).toBe(first.releaseId)
    expect(await snapshot()).toEqual({
      site: { status: 'active', current_release_id: first.releaseId },
      version: { status: 'published' }, counts: { releases: 2, pointers: 1, audits: 3 }
    })
  })

  it.each(['archived', 'suspended'])('rejects replay and rollback after a published site becomes %s', async (status) => {
    const first = await activate()
    const second = await activate({ idempotencyKey: 'second-publish', expectedActiveReleaseId: first.releaseId })
    await client.query('UPDATE page_studio_sites SET status=$1', [status])
    const before = await snapshot()
    await expect(activate()).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
    await expect(rollbackPageStudioRelease({
      ...input, idempotencyKey: 'rollback', expectedActiveReleaseId: second.releaseId, targetReleaseId: first.releaseId
    }, { runTransaction })).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
    expect(await snapshot()).toEqual(before)
  })
})
