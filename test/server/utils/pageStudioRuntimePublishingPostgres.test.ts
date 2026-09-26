import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolvePageStudioReleaseHost } from '~~/server/utils/pageStudio/delivery'
import { readPageStudioRuntimeState } from '~~/server/utils/pageStudio/runtimeState'
import { activatePageStudioRuntimeRelease, rollbackPageStudioRuntimeRelease } from '~~/server/utils/pageStudio/runtimePublishing'
import type { PreparedRuntimeRelease } from '~~/server/utils/pageStudio/runtimeReleases'
import { verifyNativeAstroRuntimeRelease } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'

const url = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(target.pathname) || target.search) throw new Error('Disposable localhost studio_cms database required')
}
const directory = new URL('../../../server/database/migrations/', import.meta.url)
const migrations = ['402_page_studio_control_plane', '413_page_studio_release_metadata', '414_page_studio_atomic_release_metadata', '428_page_studio_client_staging', '429_page_studio_checkpoint_staging_outbox', '430_page_studio_astro_build_identity', '431_page_studio_astro_release_receipt', '432_page_studio_astro_approval', '433_page_studio_runtime_delivery']
const metadata = { defaultLocale: 'en-AU', footer: {}, integrations: {}, navigation: { items: [] }, seoDefaults: {}, theme: { tokens: {} } }
const renderer = { assetsDigest: 'a'.repeat(64), codeDigest: 'b'.repeat(64), generation: 'renderer_one', name: 'astro-runtime' as const }

describe.runIf(Boolean(url))('runtime publication transactions on PostgreSQL', () => {
  let db: pg.Client, schema: string
  const tenant = 'runtime-publish'
  const actor = '30000000-0000-4000-8000-000000000901'
  let scope: { tenantId: string, clientId: string, siteId: string }
  const hostname = 'www.runtime.example'

  const runTransaction = async <T>(work: (client: never) => Promise<T>) => {
    await db.query('BEGIN')
    try {
      const result = await work(db as never)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }

  beforeEach(async () => {
    db = new pg.Client({ connectionString: url })
    await db.connect()
    schema = `runtime_publish_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", pg_catalog`)
    await db.query('CREATE TABLE team_members(id UUID PRIMARY KEY); CREATE TABLE agency_clients(id UUID PRIMARY KEY); CREATE TABLE client_users(id UUID PRIMARY KEY); CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT); CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group))')
    for (const name of migrations) await db.query(readFileSync(new URL(`${name}.sql`, directory), 'utf8'))
    await db.query('INSERT INTO team_members VALUES($1)', [actor])
    const clientId = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES($1)', [clientId])
    const entitlement = (await db.query('INSERT INTO page_studio_entitlements(tenant_id,client_id) VALUES($1,$2) RETURNING id', [tenant, clientId])).rows[0]
    const siteId = (await db.query('INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,delivery_mode) VALUES($1,$2,$3,\'Runtime\',\'runtime\',\'limousine-v1\',\'runtime\') RETURNING id', [tenant, clientId, entitlement.id])).rows[0].id
    scope = { tenantId: tenant, clientId, siteId }
  })
  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await db.end() }
  })

  /** A saved, reviewed version plus its verified runtime reference. */
  async function version(label: string, decision = 'approved'): Promise<PreparedRuntimeRelease> {
    const digest = createHash('sha256').update(label).digest('hex')
    const checkpoint = `checkpoint_${randomUUID().replaceAll('-', '')}`
    await db.query('INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,author_id,created_at) VALUES($1,$2,$3,$4,$5,$1,\'etag\',$6,NOW())', [checkpoint, tenant, scope.clientId, scope.siteId, digest, actor])
    const versionId = (await db.query('INSERT INTO page_studio_versions(tenant_id,client_id,site_id,checkpoint_id,digest,author_id,author_role,summary,status,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,\'agency\',$7,\'approved\',$7) RETURNING id', [tenant, scope.clientId, scope.siteId, checkpoint, digest, actor, label])).rows[0].id
    await db.query('INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,reviewer_id,decision) VALUES($1,$2,$3,$4,$5,$6,$7)', [tenant, scope.clientId, scope.siteId, versionId, digest, actor, decision])
    const prefix = `tenants/${tenant}/clients/${scope.clientId}/sites/${scope.siteId}/runtime`
    const { digest: releaseDigest, release } = await verifyNativeAstroRuntimeRelease({
      delivery: 'runtime', environment: 'production', images: [], redirects: {}, renderer, schemaVersion: 1, scope,
      snapshot: { bytes: 100, contentType: 'application/json; charset=utf-8', key: `${prefix}/versions/${digest}/site.json`, sha256: digest },
      versionDigest: digest, versionId
    })
    return { digest: releaseDigest, release, releaseMetadata: metadata as never }
  }

  const activate = (prepared: PreparedRuntimeRelease, expectedActiveReleaseId: string | null, idempotencyKey = randomUUID()) =>
    activatePageStudioRuntimeRelease({ actorId: actor, environment: 'production', expectedActiveReleaseId, hostname, idempotencyKey, prepared, scope }, { runTransaction })

  const state = async () => ({
    pointer: (await db.query('SELECT active_release_id, pointer_version::int FROM page_studio_release_pointers')).rows,
    site: (await db.query('SELECT current_release_id, current_version_id, status FROM page_studio_sites')).rows[0],
    releases: (await db.query('SELECT count(*)::int AS n FROM page_studio_releases')).rows[0].n
  })

  it('publishes the exact approved version and records audit', async () => {
    const v1 = await version('one')
    const pointer = await activate(v1, null)
    expect(pointer).toMatchObject({ delivery: 'runtime', environment: 'production', releaseDigest: v1.digest })
    const after = await state()
    expect(after.pointer).toEqual([{ active_release_id: pointer.releaseId, pointer_version: 1 }])
    expect(after.site).toEqual({ current_release_id: pointer.releaseId, current_version_id: v1.release.versionId, status: 'active' })
    const audit = (await db.query('SELECT action, metadata FROM page_studio_audit_events')).rows
    expect(audit).toEqual([{ action: 'release.activated', metadata: expect.objectContaining({ delivery: 'runtime', releaseDigest: v1.digest, versionId: v1.release.versionId }) }])
    expect((await db.query('SELECT status FROM page_studio_versions')).rows).toEqual([{ status: 'published' }])
  })

  it('replays an idempotent retry and rejects a reused key for another version', async () => {
    const v1 = await version('one')
    const v2 = await version('two')
    const first = await activate(v1, null, 'publish-key')
    expect(await activate(v1, null, 'publish-key')).toEqual(first)
    await expect(activate(v2, first.releaseId, 'publish-key')).rejects.toMatchObject({ code: 'RELEASE_IDEMPOTENCY_CONFLICT' })
    expect((await state()).releases).toBe(1)
  })

  it('changes nothing when the active release moved (compare-and-swap)', async () => {
    const v1 = await version('one')
    const v2 = await version('two')
    await activate(v1, null)
    const before = await state()
    await expect(activate(v2, null)).rejects.toMatchObject({ code: 'RELEASE_POINTER_CONFLICT' })
    expect(await state()).toEqual(before)
  })

  it('refuses unapproved versions, static sites and mismatched scope', async () => {
    const rejected = await version('rejected', 'rejected')
    await expect(activate(rejected, null)).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
    const v1 = await version('one')
    await expect(activatePageStudioRuntimeRelease({ actorId: actor, environment: 'staging', expectedActiveReleaseId: null, hostname, idempotencyKey: 'x', prepared: v1, scope }, { runTransaction })).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
    await db.query('UPDATE page_studio_sites SET delivery_mode=\'static\'')
    await expect(activate(v1, null)).rejects.toMatchObject({ code: 'RUNTIME_DELIVERY_DISABLED' })
    expect((await state()).releases).toBe(0)
  })

  it('does not let an approval float to a newer edit of the same version', async () => {
    const v1 = await version('one')
    const tampered = { ...v1, release: { ...v1.release, versionDigest: 'f'.repeat(64) } }
    await expect(activate(tampered, null)).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
  })

  it('rolls back to a retained release without rebuilding, and only on a deployed renderer', async () => {
    const v1 = await version('one')
    const v2 = await version('two')
    const first = await activate(v1, null)
    const second = await activate(v2, first.releaseId)
    const rollback = (retainedGenerations: string[], idempotencyKey = randomUUID()) => rollbackPageStudioRuntimeRelease({
      actorId: actor, environment: 'production', expectedActiveReleaseId: second.releaseId, hostname, idempotencyKey,
      retainedGenerations, scope, targetReleaseId: first.releaseId
    }, { runTransaction })
    await expect(rollback(['renderer_two'])).rejects.toMatchObject({ code: 'ROLLBACK_TARGET_INVALID' })
    const restored = await rollback(['renderer_one'], 'rollback-key')
    expect(restored.releaseId).toBe(first.releaseId)
    const after = await state()
    expect(after.pointer).toEqual([{ active_release_id: first.releaseId, pointer_version: 3 }])
    expect(after.site.current_version_id).toBe(v1.release.versionId)
    expect(after.releases).toBe(2)
    // A retried request with the same key replays the recorded rollback.
    expect(await rollback(['renderer_one'], 'rollback-key')).toEqual(restored)
    await expect(rollback(['renderer_one'])).rejects.toMatchObject({ code: 'RELEASE_POINTER_CONFLICT' })
  })

  it('resolves the published runtime release for its hostname through the real delivery query', async () => {
    const queryOne = (async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rows[0] ?? null) as never
    await db.query('UPDATE page_studio_entitlements SET status=\'active\', effective_from=NOW() - interval \'1 day\'')
    const v1 = await version('one')
    const published = await activate(v1, null)
    const resolved = await resolvePageStudioReleaseHost(hostname, { queryOne })
    expect(resolved).toEqual({ hostname, release: published })
    await db.query('UPDATE page_studio_sites SET delivery_mode=\'static\'')
    expect(await resolvePageStudioReleaseHost(hostname, { queryOne })).toBeNull()
  })

  it('reports draft, approved and live runtime versions for the publishing UI', async () => {
    const one = (async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rows[0] ?? null) as never
    const many = (async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rows) as never
    const v1 = await version('one')
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=(SELECT checkpoint_id FROM page_studio_versions WHERE id=$1)', [v1.release.versionId])
    const env = { PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME: 'preview.example', PAGE_STUDIO_RUNTIME_RENDERER: '{}' }
    const before = await readPageStudioRuntimeState(scope, env, { queryOne: one, queryRows: many })
    expect(before).toMatchObject({ approved: { live: false, versionId: v1.release.versionId }, deliveryMode: 'runtime', releases: [], rendererConfigured: true })
    expect(before.draft?.previewHostname).toBe(`draft-${scope.siteId.replaceAll('-', '')}.preview.example`)
    const published = await activate(v1, null)
    const after = await readPageStudioRuntimeState(scope, env, { queryOne: one, queryRows: many })
    expect(after.approved?.live).toBe(true)
    expect(after.releases).toEqual([expect.objectContaining({ active: true, releaseId: published.releaseId, renderer: 'renderer_one', versionId: v1.release.versionId })])
  })
})
