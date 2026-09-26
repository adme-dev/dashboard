import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { completeAstroReleaseBuild } from '~~/server/utils/pageStudio/astroCompletion'
import { coordinateApprovedAstroBuild } from '~~/server/utils/pageStudio/astroBuildCoordinator'
import { registerAstroCandidatePreview } from '~~/server/utils/pageStudio/astroCandidatePreview'
import { issueAstroCandidateSession } from '~~/server/utils/pageStudio/astroCandidateSession'
import { createAstroCompilerBuildIdentity } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { reserveAstroReleaseBuild } from '~~/server/utils/pageStudio/astroBuilds'
import { buildApprovedPageStudioVersion, readApprovedBuildAuthority, persistSuccessfulBuild, type PageStudioBuildQueryClient } from '~~/server/utils/pageStudio/builds'
import { activatePageStudioRelease, rollbackPageStudioRelease, getPageStudioBuildPointer, getPageStudioReleasePointer } from '~~/server/utils/pageStudio/publishing'
import { authorizePageStudioPreview, resolvePageStudioReleaseHost } from '~~/server/utils/pageStudio/delivery'
import { signPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'
import { withPageStudioPublishAuthority, type PageStudioPublishPrincipal } from '~~/server/utils/pageStudio/publishAuthority'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/studio_cms(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) throw new Error('Disposable localhost studio_cms database required')
}
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const toolchain = { formatVersion: 1, kind: 'astro-compiler-toolchain', image: `registry.cloudflare.com/test-account/astro-compiler@sha256:${'a'.repeat(64)}`, hostPolicyDigest: 'b'.repeat(64) }

describe.runIf(Boolean(databaseUrl))('Astro release identity migration and admission on PostgreSQL', () => {
  let db: pg.Client
  let schema: string
  let scope: { tenantId: string, clientId: string, siteId: string }
  let versionId: string
  let legacyReleaseId: string
  let legacyResult: { success: true, buildId: string, versionDigest: string, artifactPrefix: string, manifestKey: string, manifestDigest: string, validationKey: string }
  const actorId = '30000000-0000-4000-8000-000000000701'
  const digest = 'c'.repeat(64)
  const checkpointId = 'checkpoint_astro'
  async function transact<T>(client: pg.Client, work: (client: PageStudioBuildQueryClient) => Promise<T>) {
    await client.query('BEGIN')
    try {
      const value = await work(client)
      await client.query('COMMIT')
      return value
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
  const runTransaction = <T>(work: (client: PageStudioBuildQueryClient) => Promise<T>) => transact(db, work)
  const input = () => ({ scope, versionId, environment: 'production' as const, renderInputDigest: digest, featureRecoveryDigest: null, idempotencyKey: 'astro-request' })
  const reserve = (change = {}, select = () => toolchain) => runTransaction(client => reserveAstroReleaseBuild(client, { ...input(), ...change }, select))
  const activateInput = () => ({ scope, actorId, buildId: legacyResult.buildId, environment: 'production' as const, hostname: 'astro-test.example.invalid', expectedActiveReleaseId: null, idempotencyKey: 'legacy-release' })
  beforeEach(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    schema = `astro_build_test_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN DEFAULT TRUE,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ); CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY); CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));`)
    for (const name of ['402_page_studio_control_plane.sql', '403_page_studio_sessions.sql', '413_page_studio_release_metadata.sql', '414_page_studio_atomic_release_metadata.sql', '420_page_studio_login_sessions.sql', '428_page_studio_client_staging.sql', '430_page_studio_astro_build_identity.sql', '431_page_studio_astro_release_receipt.sql', '432_page_studio_astro_approval.sql', '433_page_studio_runtime_delivery.sql']) await db.query(migration(name))
    await db.query('INSERT INTO team_members(id) VALUES($1)', [actorId])
    const clientId = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    const entitlement = (await db.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id) VALUES('astro-test',$1) RETURNING id`, [clientId])).rows[0]
    const site = (await db.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES('astro-test',$1,$2,'Astro fixture','astro-fixture','test-v1') RETURNING id`, [clientId, entitlement.id])).rows[0]
    scope = { tenantId: 'astro-test', clientId, siteId: site.id }
    await db.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
      VALUES($1,$2,$3,$4,$5,'checkpoints/current','etag',NOW())`, [checkpointId, scope.tenantId, clientId, site.id, digest])
    versionId = (await db.query(`INSERT INTO page_studio_versions(tenant_id,client_id,site_id,checkpoint_id,digest,author_id,author_role,summary,status,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,'agency','Fixture','approved','version') RETURNING id`, [scope.tenantId, clientId, site.id, checkpointId, digest, actorId])).rows[0].id
    await db.query('UPDATE page_studio_sites SET current_version_id=$1,current_checkpoint_id=$2 WHERE id=$3', [versionId, checkpointId, site.id])
    await db.query(`INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,decision,reviewer_id)
      VALUES($1,$2,$3,$4,$5,'approved',$6)`, [scope.tenantId, clientId, site.id, versionId, digest, actorId])
    const prefix = `tenants/${scope.tenantId}/clients/${clientId}/sites/${site.id}/builds/${digest}`
    legacyResult = { success: true, buildId: `build_${digest.slice(0, 32)}`, versionDigest: digest, artifactPrefix: prefix, manifestKey: `${prefix}/release-manifest.json`, manifestDigest: 'd'.repeat(64), validationKey: `${prefix}/validation-report.json` }
    await db.query(`INSERT INTO page_studio_builds(id,tenant_id,client_id,site_id,version_id,version_digest,artifact_prefix,release_manifest_key,release_manifest_digest,validation_report_key,state,idempotency_key,release_metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'succeeded','legacy-build',$11::jsonb)`, [legacyResult.buildId, ...Object.values(scope), versionId, digest, prefix, legacyResult.manifestKey, legacyResult.manifestDigest, legacyResult.validationKey,
      JSON.stringify({ theme: { label: 'historical' }, navigation: {}, footer: {}, seoDefaults: {}, integrations: {}, defaultLocale: 'en-AU' })])
    legacyReleaseId = (await activatePageStudioRelease(activateInput(), { runTransaction })).releaseId
    // Exercise migration against retained rows and live release foreign keys.
    await db.query(migration('430_page_studio_astro_build_identity.sql'))
  })
  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      if (schema) await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await db.end()
    }
  })

  const resultFor = (retained: Awaited<ReturnType<typeof reserve>>) => {
    const artifactDigest = 'e'.repeat(64)
    const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/astro/production/${retained.buildId}/${artifactDigest}`
    return {
      artifactPrefix: prefix,
      astro: { context: { buildId: retained.buildId, identity: retained.identity, identityDigest: retained.identityDigest }, manifestDigest: artifactDigest, policyDigest: 'f'.repeat(64) },
      buildId: retained.buildId, manifestDigest: 'a'.repeat(64), manifestKey: `${prefix}/release-manifest.json`,
      renderer: 'astro', success: true, validationKey: `${prefix}/validation-report.json`, versionDigest: digest
    }
  }

  async function advanceSource(kind: 'checkpoint' | 'version' = 'checkpoint') {
    if (kind === 'checkpoint') {
      await db.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
        VALUES('checkpoint_new',$1,$2,$3,$4,'checkpoints/new','new',NOW())`, [...Object.values(scope), '9'.repeat(64)])
      await db.query('UPDATE page_studio_sites SET current_checkpoint_id=\'checkpoint_new\' WHERE id=$1', [scope.siteId])
    } else {
      const next = (await db.query(`INSERT INTO page_studio_versions(tenant_id,client_id,site_id,checkpoint_id,digest,author_id,author_role,summary,status,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$6,'agency','New version','draft','next-version') RETURNING id`, [...Object.values(scope), checkpointId, digest, actorId])).rows[0].id
      await db.query('UPDATE page_studio_sites SET current_version_id=$1 WHERE id=$2', [next, scope.siteId])
    }
  }
  it.each(['checkpoint', 'version'] as const)('rejects a new reservation after the current %s changes without quota admission', async (kind) => {
    await advanceSource(kind)
    await expect(reserve()).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(0)
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_builds WHERE renderer=\'astro\'')).rows[0].count).toBe(0)
  })

  describe('fresh native publish authority', () => {
    let principal: PageStudioPublishPrincipal
    beforeEach(async () => {
      const roleId = randomUUID()
      await db.query('INSERT INTO custom_roles VALUES($1,\'publisher\',TRUE,FALSE)', [roleId])
      await db.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_PUBLISH\')', [roleId])
      await db.query('UPDATE team_members SET user_role=\'publisher\' WHERE id=$1', [actorId])
      principal = { actorId, tenantId: scope.tenantId, login: {
        role: 'agency', userId: actorId, tokenHash: 'a'.repeat(64), issuedAt: new Date(Date.now() - 3_600_000), expiresAt: new Date(Date.now() + 3_600_000)
      } }
      await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
        VALUES('agency',$1,$2,$3,$4)`, [principal.login.tokenHash, actorId, principal.login.issuedAt, principal.login.expiresAt])
    })
    const run = (work: (client: PageStudioBuildQueryClient) => Promise<unknown>) => withPageStudioPublishAuthority(scope, principal, work, { runTransaction })
    const finish = (retained: Awaited<ReturnType<typeof reserve>>, receipt = resultFor(retained), verifyBuild = async (pointer: unknown) => pointer) =>
      completeAstroReleaseBuild({ reservation: retained, receipt, principal, policyDigest: 'f'.repeat(64) }, { runTransaction, verifyBuild })
    const metadata = { defaultLocale: 'en-AU', theme: {}, navigation: {}, footer: {}, seoDefaults: {}, integrations: {} }
    const coordinate = (overrides = {}, requestKey = 'astro-request', recoverCandidate = false) => coordinateApprovedAstroBuild({ scope, versionId, environment: 'production', idempotencyKey: requestKey }, principal, {
      selectGeneration: async (_environment, selectedDigest) => {
        const context = await createAstroCompilerBuildIdentity({ scope, environment: 'production', source: { kind: 'approved-version', versionId, versionDigest: digest, checkpoint: { id: checkpointId, digest } }, renderInputDigest: digest, featureRecoveryDigest: null }, toolchain)
        if (selectedDigest && selectedDigest !== context.identity.toolchainDigest) throw new Error('Unknown generation')
        return { environment: 'production' as const, toolchainDigest: context.identity.toolchainDigest, toolchain: toolchain as never, policyDigest: 'f'.repeat(64) }
      },
      loadCheckpoint: async () => ({ checkpointId, digest, manifest: { fixture: true }, releaseMetadata: metadata }),
      buildAstroApproved: async ({ context, request }) => {
        expect(request.approval.approvalId).toBe((await db.query('SELECT astro_approval_id FROM page_studio_builds WHERE id=$1', [context.buildId])).rows[0].astro_approval_id)
        return resultFor({ ...context, toolchain, approvalId: request.approval.approvalId, state: 'pending', receipt: null })
      },
      verifyBuild: async pointer => pointer,
      ...overrides
    }, { runTransaction, recoverCandidate })
    const preview = (buildId: string, verifyBuild = async (pointer: unknown) => pointer) => registerAstroCandidatePreview({
      scope, versionId, buildId, environment: 'production', previewHostname: 'review.example.invalid'
    }, principal, { runTransaction, queryOne: async (sql, params) => (await db.query(sql, params)).rows[0] ?? null, verifyBuild })

    it('rejects first completion when a new checkpoint arrives during artifact verification', async () => {
      const retained = await reserve()
      await expect(finish(retained, resultFor(retained), async (pointer) => {
        await advanceSource()
        return pointer
      })).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
      expect((await db.query('SELECT state,astro_release_receipt FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0]).toEqual({ state: 'pending', astro_release_receipt: null })
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events WHERE action=\'build.succeeded\'')).rows[0].count).toBe(0)
      await expect(reserve()).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    })
    it('rejects a new candidate when a new checkpoint arrives during artifact verification', async () => {
      const build = await coordinate()
      await expect(preview(build.buildId, async (pointer) => {
        await advanceSource()
        return pointer
      })).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_releases WHERE environment=\'preview\'')).rows[0].count).toBe(0)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_release_pointers WHERE environment=\'preview\'')).rows[0].count).toBe(0)
    })
    it('rejects new activation of a stale artifact without changing the live release or metadata', async () => {
      const build = await coordinate()
      await advanceSource()
      const before = (await db.query('SELECT current_release_id,theme,navigation,footer FROM page_studio_sites')).rows[0]
      await expect(activatePageStudioRelease({ ...activateInput(), buildId: build.buildId, expectedActiveReleaseId: legacyReleaseId, idempotencyKey: 'stale-activation' }, { runTransaction })).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
      expect((await db.query('SELECT current_release_id,theme,navigation,footer FROM page_studio_sites')).rows[0]).toEqual(before)
      expect((await db.query('SELECT active_release_id FROM page_studio_release_pointers')).rows).toEqual([{ active_release_id: legacyReleaseId }])
    })
    it('preserves exact completed build, preview and activation retries and historical rollback after source advancement', async () => {
      const retained = await reserve(), build = await finish(retained)
      const candidate = await preview(build.buildId)
      const request = { ...activateInput(), buildId: build.buildId, expectedActiveReleaseId: legacyReleaseId, idempotencyKey: 'completed-activation' }
      const activated = await activatePageStudioRelease(request, { runTransaction })
      await advanceSource()
      expect((await reserve()).state).toBe('succeeded')
      expect(await finish(retained)).toEqual(build)
      expect(await preview(build.buildId)).toEqual(candidate)
      expect(await activatePageStudioRelease(request, { runTransaction })).toEqual(activated)
      await rollbackPageStudioRelease({ ...activateInput(), expectedActiveReleaseId: activated.releaseId, targetReleaseId: legacyReleaseId, idempotencyKey: 'historical-legacy' }, { runTransaction })
      expect(await rollbackPageStudioRelease({ ...activateInput(), expectedActiveReleaseId: legacyReleaseId, targetReleaseId: activated.releaseId, idempotencyKey: 'historical-astro' }, { runTransaction })).toEqual(activated)
    })

    it('recovers the retained candidate across new browser request keys without source reads or a new admission', async () => {
      const first = await coordinate()
      const second = await coordinate({ loadCheckpoint: async () => {
        throw new Error('Source unavailable')
      }, buildAstroApproved: async () => {
        throw new Error('Must reuse artifact')
      } }, 'new-browser-request', true)
      expect(second).toEqual(first)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
    })

    it('registers an immutable preview of the exact production artifact without publishing or recompiling', async () => {
      const build = await coordinate()
      const candidate = await preview(build.buildId)
      expect(candidate.release).toEqual({ ...build, environment: 'preview', releaseId: expect.any(String) })
      expect(candidate.hostname).toMatch(/^[a-z0-9-]+\.review\.example\.invalid$/)
      expect(await preview(build.buildId)).toEqual(candidate)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_releases WHERE environment=\'preview\'')).rows[0].count).toBe(1)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events WHERE action=\'release.preview_registered\'')).rows[0].count).toBe(1)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
      expect((await db.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(legacyReleaseId)
      expect(await resolvePageStudioReleaseHost(candidate.hostname, { queryOne: async (sql, params) => (await db.query(sql, params)).rows[0] ?? null })).toBeNull()
    })
    it.each(['verification failure', 'revoked publisher', 'changed approval'])('does not register a preview after %s', async (scenario) => {
      const build = await coordinate()
      await expect(preview(build.buildId, async (pointer) => {
        if (scenario === 'verification failure') throw new Error('Missing artifact')
        if (scenario === 'revoked publisher') await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        if (scenario === 'changed approval') await db.query(`INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,reviewer_id,decision,decided_at)
          VALUES($1,$2,$3,$4,$5,$6,'approved',clock_timestamp()+INTERVAL '1 second')`, [...Object.values(scope), versionId, digest, actorId])
        return pointer
      })).rejects.toThrow()
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_releases WHERE environment=\'preview\'')).rows[0].count).toBe(0)
    })
    it('rejects legacy, missing, foreign-scope and wrong-environment candidates before artifact verification', async () => {
      let verified = false
      const verifyBuild = async (p: unknown) => {
        verified = true
        return p
      }
      await expect(preview(legacyResult.buildId, verifyBuild)).rejects.toThrow()
      await expect(preview('astro_missing', verifyBuild)).rejects.toThrow()
      const build = await coordinate()
      for (const change of [{ scope: { ...scope, tenantId: 'foreign' } }, { environment: 'staging' }]) {
        await expect(registerAstroCandidatePreview({ scope, versionId, buildId: build.buildId, environment: 'production',
          previewHostname: 'review.example.invalid', ...change }, principal, { runTransaction,
          queryOne: async (sql, params) => (await db.query(sql, params)).rows[0] ?? null, verifyBuild })).rejects.toThrow()
      }
      expect(verified).toBe(false)
    })
    it('does not overwrite an occupied candidate address or create a second preview release', async () => {
      const build = await coordinate(), candidate = await preview(build.buildId)
      await db.query('UPDATE page_studio_releases SET build_id=$1 WHERE id=$2', [legacyResult.buildId, candidate.release.releaseId])
      await expect(preview(build.buildId)).rejects.toMatchObject({ code: 'RELEASE_POINTER_CONFLICT' })
      expect((await db.query('SELECT build_id FROM page_studio_releases WHERE id=$1', [candidate.release.releaseId])).rows[0].build_id).toBe(legacyResult.buildId)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_releases WHERE environment=\'preview\'')).rows[0].count).toBe(1)
    })
    it('does not persist or return a review grant if the publisher logs out during signing', async () => {
      await expect(issueAstroCandidateSession(scope, principal, { runTransaction, signToken: async () => {
        await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        return 'signed-but-not-returned'
      } })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_sessions')).rows[0].count).toBe(0)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events WHERE action=\'session.issued\'')).rows[0].count).toBe(0)
    })
    it.each(['logout', 'publish permission', 'inactive client'])('revokes candidate preview access immediately after loss of %s', async (revocation) => {
      const build = await coordinate(), candidate = await preview(build.buildId)
      const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const issuer = 'https://agency.example.invalid'
      const issuedAt = Math.floor(Date.now() / 1000)
      const session = await issueAstroCandidateSession(scope, principal, { runTransaction,
        signToken: claims => signPageStudioSessionToken(claims, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), issuer) })
      const { token } = session
      expect(session.capabilities).toEqual(['workspace:preview'])
      expect(session.expiresAt).toBeLessThanOrEqual(issuedAt + 301)
      const read = () => authorizePageStudioPreview({ hostname: candidate.hostname, token }, { issuer,
        publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
        queryOne: async (sql, params) => (await db.query(sql, params)).rows[0] ?? null })
      expect(await read()).toEqual(candidate)
      if (revocation === 'logout') await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      if (revocation === 'publish permission') await db.query('DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_PUBLISH\'')
      if (revocation === 'inactive client') await db.query('UPDATE agency_clients SET is_active=FALSE')
      expect(await read()).toBeNull()
    })
    it('coordinates the approved build and retries after source images/checkpoint storage become unavailable', async () => {
      const first = await coordinate()
      const retry = await coordinate({
        loadCheckpoint: async () => {
          throw new Error('Source storage no longer available')
        },
        buildAstroApproved: async () => {
          throw new Error('Must not recompile a completed artifact')
        }
      })
      expect(retry).toEqual(first)
      expect((await db.query('SELECT release_metadata FROM page_studio_builds WHERE id=$1', [first.buildId])).rows[0].release_metadata).toEqual(metadata)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
    })
    it('keeps an unknown compiler outcome pending and retries with the retained compiler after rollout', async () => {
      await expect(coordinate({ buildAstroApproved: async () => {
        throw new Error('RPC disconnected')
      } })).rejects.toThrow('RPC disconnected')
      expect((await db.query('SELECT state FROM page_studio_builds WHERE renderer=\'astro\'')).rows[0].state).toBe('pending')
      const retained = await reserve()
      const result = await coordinate({ selectGeneration: async (_environment: string, selectedDigest?: string) => {
        if (!selectedDigest) throw new Error('Must not select the newly active compiler')
        expect(selectedDigest).toBe(retained.identity.toolchainDigest)
        return { environment: 'production', toolchainDigest: selectedDigest, toolchain, policyDigest: 'f'.repeat(64) }
      } })
      expect(result.buildId).toBe(retained.buildId)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
    })
    it('completes the reserved receipt once after delivery verification, without new quota or activation', async () => {
      const retained = await reserve(), receipt = resultFor(retained)
      const pointer = await finish(retained, receipt, async (candidate) => {
        expect((await db.query('SELECT state FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].state).toBe('pending')
        return candidate
      })
      expect(pointer).toMatchObject({ buildId: retained.buildId, astro: receipt.astro, manifestDigest: receipt.manifestDigest })
      expect(await finish(retained)).toEqual(pointer)
      expect((await db.query('SELECT astro_release_receipt FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].astro_release_receipt).toEqual(receipt)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events WHERE action=\'build.succeeded\'')).rows[0].count).toBe(1)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
      expect((await db.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(legacyReleaseId)
    })
    it.each(['delivery failure', 'login revocation', 'changed approval', 'replaced checkpoint', 'wrong delivery pointer'])('keeps completion pending after %s', async (scenario) => {
      const retained = await reserve()
      await expect(finish(retained, resultFor(retained), async (pointer) => {
        if (scenario === 'delivery failure') throw new Error('Delivery unavailable')
        if (scenario === 'login revocation') await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        if (scenario === 'changed approval') await db.query(`INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,decision,reviewer_id) VALUES($1,$2,$3,$4,$5,'approved',$6)`, [scope.tenantId, scope.clientId, scope.siteId, versionId, digest, actorId])
        if (scenario === 'replaced checkpoint') await db.query('UPDATE page_studio_checkpoints SET digest=$1', ['e'.repeat(64)])
        return scenario === 'wrong delivery pointer' ? { ...pointer as object, manifestDigest: 'b'.repeat(64) } : pointer
      })).rejects.toThrow()
      expect((await db.query('SELECT state,astro_release_receipt FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0]).toEqual({ state: 'pending', astro_release_receipt: null })
    })
    it('rejects a conflicting completion and preserves the first receipt', async () => {
      const retained = await reserve(), receipt = resultFor(retained)
      await finish(retained)
      await expect(finish(retained, { ...receipt, manifestDigest: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'BUILD_CONFLICT' })
      expect((await db.query('SELECT astro_release_receipt FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].astro_release_receipt).toEqual(receipt)
    })
    it('rejects an untrusted compiler policy before calling delivery', async () => {
      const retained = await reserve(), receipt = resultFor(retained)
      let called = false
      await expect(finish(retained, { ...receipt, astro: { ...receipt.astro, policyDigest: 'b'.repeat(64) } }, async (pointer) => {
        called = true
        return pointer
      })).rejects.toThrow()
      expect(called).toBe(false)
    })
    it('permits publish-only staff without editor or CMS capabilities', async () => {
      expect(await run(async client => (await client.query('SELECT id FROM page_studio_sites WHERE id=$1', [scope.siteId])).rows[0])).toEqual({ id: scope.siteId })
      expect((await db.query('SELECT permission_group FROM role_permission_groups')).rows.some(row => row.permission_group === 'PAGE_STUDIO_EDIT')).toBe(false)
    })
    it.each([
      ['logout', 'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'],
      ['expired login', 'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-INTERVAL \'1 second\''],
      ['session invalidation', 'UPDATE team_members SET sessions_invalidated_at=clock_timestamp()'],
      ['disabled staff', 'UPDATE team_members SET is_active=FALSE'],
      ['changed role', 'UPDATE team_members SET user_role=\'viewer\''],
      ['custom role reassignment', 'UPDATE team_members SET custom_role_id=\'30000000-0000-4000-8000-000000000799\''],
      ['removed permission', 'DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_PUBLISH\''],
      ['read-only role', 'UPDATE custom_roles SET is_read_only=TRUE'],
      ['disabled client', 'UPDATE agency_clients SET is_active=FALSE'],
      ['suspended entitlement', 'UPDATE page_studio_entitlements SET status=\'suspended\''],
      ['expired entitlement', 'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-INTERVAL \'1 second\''],
      ['inactive site', 'UPDATE page_studio_sites SET status=\'suspended\'']
    ])('denies %s after remote work, before completion SQL', async (_kind, sql) => {
      await db.query(sql)
      let called = false
      await expect(run(async () => {
        called = true
      })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
      expect(called).toBe(false)
    })
    it('rolls back SQL if authority changes before the transaction returns', async () => {
      await expect(run(async (client) => {
        await client.query('UPDATE page_studio_sites SET name=\'changed\' WHERE id=$1', [scope.siteId])
        await client.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
      })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
      expect((await db.query('SELECT name FROM page_studio_sites')).rows[0].name).toBe('Astro fixture')
      expect((await db.query('SELECT status FROM page_studio_entitlements')).rows[0].status).toBe('active')
    })
    it('rejects a foreign tenant or a client login without running work', async () => {
      for (const candidate of [{ ...principal, tenantId: 'foreign' }, { ...principal, login: { ...principal.login, role: 'client' as const } }]) {
        await expect(withPageStudioPublishAuthority(scope, candidate, async () => {
          throw new Error('Must not run')
        }, { runTransaction }))
          .rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
      }
    })
    it('checks wall-clock expiry again after SQL work and rolls back its writes', async () => {
      principal.login.expiresAt = new Date(Date.now() + 500)
      await db.query('UPDATE page_studio_login_sessions SET expires_at=$1', [principal.login.expiresAt])
      await expect(run(async (client) => {
        await client.query('UPDATE page_studio_sites SET name=\'expired write\' WHERE id=$1', [scope.siteId])
        await client.query('SELECT pg_sleep(0.6)')
      })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
      expect((await db.query('SELECT name FROM page_studio_sites')).rows[0].name).toBe('Astro fixture')
    })
    it('returns a retryable error if concurrent revocation holds an authority row', async () => {
      const other = new pg.Client({ connectionString: databaseUrl })
      await other.connect()
      await other.query(`SET search_path TO "${schema}", pg_catalog`)
      try {
        await other.query('BEGIN')
        await other.query('SELECT token_hash FROM page_studio_login_sessions FOR UPDATE')
        await expect(run(async () => {
          throw new Error('Must not run')
        })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_BUSY' })
      } finally {
        await other.query('ROLLBACK')
        await other.end()
      }
    })
  })

  describe('immutable completion receipt', () => {
    beforeEach(async () => {
      await db.query(migration('431_page_studio_astro_release_receipt.sql'))
    })
    const complete = (result: ReturnType<typeof resultFor>, receipt: unknown = result, client = db) => client.query(`UPDATE page_studio_builds
      SET state='succeeded',completed_at=NOW(),artifact_prefix=$2,release_manifest_key=$3,release_manifest_digest=$4,
        validation_report_key=$5,astro_release_receipt=$6::jsonb WHERE id=$1`,
    [result.buildId, result.artifactPrefix, result.manifestKey, result.manifestDigest, result.validationKey, JSON.stringify(receipt)])

    it('rejects successful Astro completion without a retained receipt', async () => {
      const retained = await reserve()
      await expect(db.query('UPDATE page_studio_builds SET state=\'succeeded\',completed_at=NOW() WHERE id=$1', [retained.buildId]))
        .rejects.toMatchObject({ code: '23514', constraint: 'page_studio_astro_release_receipt_valid' })
      expect((await db.query('SELECT state FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].state).toBe('pending')
      expect((await db.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(legacyReleaseId)
    })
    it('retains a complete receipt across metadata replacement, reconnect and repeated migration', async () => {
      const retained = await reserve()
      const result = resultFor(retained)
      await complete(result)
      await db.query('UPDATE page_studio_builds SET release_metadata=\'{"theme":{"label":"new"}}\'::jsonb WHERE id=$1', [retained.buildId])
      await db.end()
      db = new pg.Client({ connectionString: databaseUrl })
      await db.connect()
      await db.query(`SET search_path TO "${schema}", pg_catalog`)
      await db.query(migration('431_page_studio_astro_release_receipt.sql'))
      expect((await db.query('SELECT astro_release_receipt FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].astro_release_receipt).toEqual(result)
      expect((await reserve({}, () => {
        throw new Error('Must keep retained toolchain')
      })).state).toBe('succeeded')
      expect((await db.query('SELECT resource_id FROM page_studio_build_admissions')).rows).toEqual([{ resource_id: retained.buildId }])
      expect((await db.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(legacyReleaseId)
    })
    it('rejects changed terminal receipts, artifact locations, digests and success downgrades', async () => {
      const retained = await reserve()
      const result = resultFor(retained)
      await complete(result)
      for (const change of [
        'state=\'failed\'', 'state=\'pending\'', 'failure_summary=\'changed\'', 'completed_at=completed_at+INTERVAL \'1 second\'',
        'artifact_prefix=artifact_prefix || \'/changed\'', 'release_manifest_key=release_manifest_key || \'.changed\'',
        'release_manifest_digest=repeat(\'b\',64)', 'validation_report_key=validation_report_key || \'.changed\'',
        'astro_release_receipt=NULL', 'astro_release_receipt=jsonb_set(astro_release_receipt,\'{astro,policyDigest}\',to_jsonb(repeat(\'b\',64)))'
      ]) {
        await expect(db.query(`UPDATE page_studio_builds SET ${change} WHERE id=$1`, [retained.buildId])).rejects.toThrow('ASTRO_RELEASE_RECEIPT_IMMUTABLE')
      }
      await db.query('UPDATE page_studio_builds SET astro_release_receipt=$2::jsonb,state=\'succeeded\' WHERE id=$1', [retained.buildId, JSON.stringify(result)])
      expect((await db.query('SELECT astro_release_receipt FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].astro_release_receipt).toEqual(result)
    })
    it('rejects mismatched or incomplete receipts before completion', async () => {
      const retained = await reserve()
      const result = resultFor(retained)
      for (const receipt of [
        {}, { ...result, success: false }, { ...result, renderer: 'legacy' }, { ...result, versionDigest: 'b'.repeat(64) },
        { ...result, manifestDigest: 'b'.repeat(64) }, { ...result, artifactPrefix: result.artifactPrefix + '/foreign' },
        { ...result, astro: { ...result.astro, policyDigest: 'invalid' } },
        { ...result, astro: { ...result.astro, manifestDigest: 'b'.repeat(64) } },
        { ...result, astro: { ...result.astro, context: { ...result.astro.context, identityDigest: 'b'.repeat(64) } } },
        { ...result, astro: { ...result.astro, context: { ...result.astro.context, identity: { ...retained.identity, environment: 'staging' } } } }
      ]) {
        await expect(complete(result, receipt)).rejects.toMatchObject({ code: '23514', constraint: 'page_studio_astro_release_receipt_valid' })
      }
      expect((await db.query('SELECT state,astro_release_receipt FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0]).toEqual({ state: 'pending', astro_release_receipt: null })
    })
    it('does not attach Astro receipts to legacy builds or unfinished reservations', async () => {
      const retained = await reserve()
      const receipt = JSON.stringify(resultFor(retained))
      for (const id of [retained.buildId, legacyResult.buildId]) {
        await expect(db.query('UPDATE page_studio_builds SET astro_release_receipt=$2::jsonb WHERE id=$1', [id, receipt]))
          .rejects.toMatchObject({ code: '23514', constraint: 'page_studio_astro_release_receipt_valid' })
      }
      await db.query('UPDATE page_studio_builds SET state=\'failed\',failure_summary=\'retryable\' WHERE id=$1', [retained.buildId])
      await expect(db.query('UPDATE page_studio_builds SET astro_release_receipt=$2::jsonb WHERE id=$1', [retained.buildId, receipt]))
        .rejects.toMatchObject({ code: '23514', constraint: 'page_studio_astro_release_receipt_valid' })
      expect((await reserve()).state).toBe('failed')
    })
    it('allows only one of two concurrent conflicting completion receipts', async () => {
      const retained = await reserve()
      const first = resultFor(retained)
      const second = { ...first, manifestDigest: 'b'.repeat(64) }
      const other = new pg.Client({ connectionString: databaseUrl })
      await other.connect()
      await other.query(`SET search_path TO "${schema}", pg_catalog`)
      try {
        const outcomes = await Promise.allSettled([complete(first), complete(second, second, other)])
        expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
        const rejected = outcomes.find(result => result.status === 'rejected')
        expect(rejected?.status === 'rejected' && rejected.reason.message).toContain('ASTRO_RELEASE_RECEIPT_IMMUTABLE')
        const stored = (await db.query('SELECT astro_release_receipt FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].astro_release_receipt
        expect([first, second]).toContainEqual(stored)
      } finally { await other.end() }
    })
    it('preserves activation and rollback of the retained legacy release', async () => {
      const second = await activatePageStudioRelease({ ...activateInput(), expectedActiveReleaseId: legacyReleaseId, idempotencyKey: 'receipt-legacy-release' }, { runTransaction })
      await rollbackPageStudioRelease({ ...activateInput(), expectedActiveReleaseId: second.releaseId, targetReleaseId: legacyReleaseId, idempotencyKey: 'receipt-legacy-rollback' }, { runTransaction })
      expect((await db.query('SELECT current_release_id,theme FROM page_studio_sites')).rows[0]).toEqual({ current_release_id: legacyReleaseId, theme: { label: 'historical' } })
    })
    it('preserves one Astro artifact through activation, replay, host resolution and historical rollback', async () => {
      const retained = await reserve()
      const result = resultFor(retained)
      await complete(result)
      await db.query('UPDATE page_studio_builds SET release_metadata=(SELECT release_metadata FROM page_studio_builds WHERE id=$2) WHERE id=$1', [retained.buildId, legacyResult.buildId])
      const queryOne = async <T>(sql: string, params?: unknown[]) => (await db.query(sql, params)).rows[0] as T | null
      const expected = { artifactPrefix: result.artifactPrefix, buildId: retained.buildId, manifestKey: result.manifestKey,
        manifestDigest: result.manifestDigest, versionDigest: result.versionDigest, astro: result.astro, scope }
      expect(await getPageStudioBuildPointer(scope, retained.buildId, { queryOne })).toEqual(expected)
      const input = { ...activateInput(), buildId: retained.buildId, expectedActiveReleaseId: legacyReleaseId, idempotencyKey: 'astro-activate' }
      const activated = await activatePageStudioRelease(input, { runTransaction })
      expect(activated).toEqual({ ...expected, environment: 'production', releaseId: activated.releaseId })
      expect(await activatePageStudioRelease(input, { runTransaction })).toEqual(activated)
      expect(await getPageStudioReleasePointer(scope, activated.releaseId, { queryOne })).toEqual(activated)
      expect(await resolvePageStudioReleaseHost(input.hostname, { queryOne })).toEqual({ hostname: input.hostname, release: activated })
      await rollbackPageStudioRelease({ ...activateInput(), expectedActiveReleaseId: activated.releaseId, targetReleaseId: legacyReleaseId, idempotencyKey: 'astro-to-legacy' }, { runTransaction })
      expect(await rollbackPageStudioRelease({ ...activateInput(), expectedActiveReleaseId: legacyReleaseId, targetReleaseId: activated.releaseId, idempotencyKey: 'legacy-to-astro' }, { runTransaction })).toEqual(activated)
      await db.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
      expect(await resolvePageStudioReleaseHost(input.hostname, { queryOne })).toBeNull()
    })
    it('rejects activation in another environment before release mutation', async () => {
      const retained = await reserve()
      await complete(resultFor(retained))
      await expect(activatePageStudioRelease({ ...activateInput(), buildId: retained.buildId,
        environment: 'staging', hostname: 'other.example.invalid', idempotencyKey: 'wrong-environment' }, { runTransaction }))
        .rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_releases')).rows[0].count).toBe(1)
    })
  })

  it('refuses the receipt migration atomically if an old Astro success has no verified receipt', async () => {
    const retained = await reserve()
    // Simulate the pre-431 schema in this disposable test schema only.
    await db.query(`DROP TRIGGER page_studio_astro_release_receipt_guard ON page_studio_builds;
      ALTER TABLE page_studio_builds DROP CONSTRAINT page_studio_astro_release_receipt_valid;
      ALTER TABLE page_studio_builds DROP COLUMN astro_release_receipt`)
    await db.query('UPDATE page_studio_builds SET state=\'succeeded\',completed_at=NOW() WHERE id=$1', [retained.buildId])
    await expect(db.query(migration('431_page_studio_astro_release_receipt.sql')))
      .rejects.toMatchObject({ code: '23514', constraint: 'page_studio_astro_release_receipt_valid' })
    await db.query('ROLLBACK')
    expect((await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1
      AND table_name='page_studio_builds' AND column_name='astro_release_receipt'`, [schema])).rows).toHaveLength(0)
    expect((await db.query('SELECT state FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].state).toBe('succeeded')
    expect((await db.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(legacyReleaseId)
  })

  it('retains a separate Astro build of the same approved version and charges one admission', async () => {
    const first = await reserve()
    expect(await reserve()).toEqual(first)
    const rows = (await db.query('SELECT id,renderer,state FROM page_studio_builds ORDER BY renderer')).rows
    expect(rows).toEqual([{ id: first.buildId, renderer: 'astro', state: 'pending' }, { id: legacyResult.buildId, renderer: 'legacy', state: 'succeeded' }])
    expect((await db.query('SELECT resource_id FROM page_studio_build_admissions')).rows).toEqual([{ resource_id: first.buildId }])
    expect((await db.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(legacyReleaseId)
    await db.query(migration('430_page_studio_astro_build_identity.sql'))
    expect(await reserve()).toEqual(first)
  })
  it('recovers the retained toolchain after a reconnect and rollout without invoking current selection', async () => {
    const first = await reserve()
    await db.end()
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    expect(await reserve({}, () => {
      throw new Error('Must not select a new toolchain on retry')
    })).toEqual(first)
  })
  it('does not replace the original approval on a retry after the version is reviewed again', async () => {
    const first = await reserve()
    await db.query(`INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,decision,reviewer_id)
      VALUES($1,$2,$3,$4,$5,'approved',$6)`, [scope.tenantId, scope.clientId, scope.siteId, versionId, digest, actorId])
    await expect(reserve()).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    expect((await db.query('SELECT astro_approval_id FROM page_studio_builds WHERE id=$1', [first.buildId])).rows[0].astro_approval_id).toBe(first.approvalId)
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
  })
  it('protects retained approval and rejects unprovable migration backfills', async () => {
    const retained = await reserve()
    await db.query(migration('432_page_studio_astro_approval.sql'))
    await expect(db.query('UPDATE page_studio_builds SET astro_approval_id=NULL WHERE id=$1', [retained.buildId])).rejects.toThrow('ASTRO_BUILD_APPROVAL_IMMUTABLE')
    await expect(db.query('DELETE FROM page_studio_reviews WHERE id=$1', [retained.approvalId])).rejects.toThrow('page_studio_reviews is append-only')
    // Disposable schema only: emulate a pre-432 reservation lacking proof.
    await db.query(`DROP TRIGGER page_studio_astro_approval_guard ON page_studio_builds;
      ALTER TABLE page_studio_builds DROP CONSTRAINT page_studio_astro_approval_required;
      ALTER TABLE page_studio_builds DROP CONSTRAINT page_studio_astro_approval_scope;
      ALTER TABLE page_studio_builds DROP COLUMN astro_approval_id`)
    await expect(db.query(migration('432_page_studio_astro_approval.sql'))).rejects.toMatchObject({ code: '23514', constraint: 'page_studio_astro_approval_required' })
    await db.query('ROLLBACK')
    expect((await db.query('SELECT state FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].state).toBe('pending')
  })
  it('conflicts before quota when an operation key changes its materialized input', async () => {
    await reserve()
    await expect(reserve({ renderInputDigest: 'e'.repeat(64), featureRecoveryDigest: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'BUILD_CONFLICT' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
    await expect(reserve({ idempotencyKey: 'legacy-build' })).rejects.toMatchObject({ code: 'BUILD_CONFLICT' })
  })
  it('rechecks revoked entitlement before returning the retained identity', async () => {
    await reserve()
    await db.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
    await expect(reserve()).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
  })
  it('rejects a checkpoint that no longer matches the approved version before admission', async () => {
    await db.query('UPDATE page_studio_checkpoints SET digest=$1 WHERE id=$2', ['e'.repeat(64), checkpointId])
    await expect(reserve()).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM page_studio_builds WHERE renderer=\'astro\'')).rows).toHaveLength(0)
  })
  it('retains the original identity and toolchain when deletion is attempted', async () => {
    const first = await reserve()
    await expect(db.query('DELETE FROM page_studio_builds WHERE id=$1', [first.buildId])).rejects.toThrow('ASTRO_BUILD_IDENTITY_IMMUTABLE')
    expect(await reserve({}, () => {
      throw new Error('Must retain the original toolchain')
    })).toEqual(first)
  })
  it('rejects changed input without a recovery pin and a second operation key for the same build', async () => {
    await expect(reserve({ renderInputDigest: 'e'.repeat(64) })).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
    await reserve()
    await expect(reserve({ idempotencyKey: 'duplicate-operation' })).rejects.toMatchObject({ code: 'BUILD_CONFLICT' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
  })
  it('rolls back quota admission when persisting the reservation fails', async () => {
    await db.query(`CREATE FUNCTION reject_astro_insert() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.renderer='astro' THEN RAISE EXCEPTION 'synthetic persistence failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_astro_insert BEFORE INSERT ON page_studio_builds FOR EACH ROW EXECUTE FUNCTION reject_astro_insert();`)
    await expect(reserve()).rejects.toThrow('synthetic persistence failure')
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM page_studio_builds WHERE renderer=\'astro\'')).rows).toHaveLength(0)
    await db.query('DROP TRIGGER reject_astro_insert ON page_studio_builds')
    expect((await reserve()).state).toBe('pending')
  })
  it('enforces source, scope and descriptor consistency on direct inserts', async () => {
    const retained = await reserve()
    const row = (await db.query('SELECT * FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0]
    for (const change of [
      { renderer: 'legacy', astro_approval_id: null }, { build_identity: {} }, { compiler_toolchain: null },
      { build_identity: { ...row.build_identity, scope: { ...scope, clientId: randomUUID() } } },
      { build_identity: { ...row.build_identity, source: { ...row.build_identity.source, versionDigest: 'e'.repeat(64) } } },
      { build_identity: { ...row.build_identity, source: { kind: 'checkpoint', checkpointId, checkpointDigest: digest } } },
      { compiler_toolchain: { ...toolchain, image: 'registry.cloudflare.com/test-account/astro-compiler:latest' } }
    ]) {
      await expect(db.query('INSERT INTO page_studio_builds SELECT * FROM jsonb_populate_record(NULL::page_studio_builds,$1::jsonb)', [JSON.stringify({ ...row, ...change })])).rejects.toMatchObject({ code: '23514', constraint: 'page_studio_build_renderer_identity' })
    }
  })
  it.each(['tenantId', 'clientId', 'siteId'] as const)('denies foreign %s without admission', async (key) => {
    await expect(reserve({ scope: { ...scope, [key]: key === 'tenantId' ? 'foreign' : randomUUID() } })).rejects.toThrow()
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
  })
  it('serializes simultaneous retries into one retained identity and admission', async () => {
    const other = new pg.Client({ connectionString: databaseUrl })
    await other.connect()
    await other.query(`SET search_path TO "${schema}", pg_catalog`)
    try {
      const [left, right] = await Promise.all([reserve(), transact(other, client => reserveAstroReleaseBuild(client, input(), () => toolchain))])
      expect(left).toEqual(right)
      expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
    } finally { await other.end() }
  })
  it('preserves the original accounting month and does not double-count the retained build', async () => {
    await db.query('UPDATE page_studio_entitlements SET monthly_build_limit=2')
    const first = await reserve()
    await db.query('UPDATE page_studio_build_admissions SET created_at=date_trunc(\'month\',NOW())-INTERVAL \'1 day\'')
    expect((await reserve()).buildId).toBe(first.buildId)
    await runTransaction(client => client.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',\'build_second\')', Object.values(scope)))
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(2)
  })
  it('protects Astro source and toolchain columns while permitting operational updates', async () => {
    const retained = await reserve()
    for (const mutation of ['renderer=\'legacy\'', 'compiler_toolchain=\'{}\'::jsonb', 'build_identity_digest=repeat(\'9\',64)', 'version_digest=repeat(\'9\',64)', 'idempotency_key=\'changed\'', 'build_identity=\'{}\'::jsonb']) {
      await expect(db.query(`UPDATE page_studio_builds SET ${mutation} WHERE id=$1`, [retained.buildId])).rejects.toThrow('ASTRO_BUILD_IDENTITY_IMMUTABLE')
    }
    await db.query('UPDATE page_studio_builds SET state=\'failed\',failure_summary=\'synthetic\',release_metadata=\'{}\'::jsonb WHERE id=$1', [retained.buildId])
  })
  it('keeps legacy persistence and failure recovery separate from an Astro row', async () => {
    const retained = await reserve()
    await db.query('UPDATE page_studio_sites SET current_release_id=NULL')
    await db.query('DELETE FROM page_studio_release_pointers')
    await db.query('DELETE FROM page_studio_releases')
    await db.query('DELETE FROM page_studio_builds WHERE id=$1', [legacyResult.buildId])
    const authority = await runTransaction(client => readApprovedBuildAuthority(client, { tenantId: scope.tenantId, siteId: scope.siteId, versionId }))
    const legacyInput = { tenantId: scope.tenantId, siteId: scope.siteId, versionId, actorId, assets: [], manifest: {}, idempotencyKey: 'legacy-build' }
    expect((await persistSuccessfulBuild(legacyInput, authority, legacyResult, runTransaction)).buildId).toBe(legacyResult.buildId)
    await db.query('DELETE FROM page_studio_builds WHERE id=$1', [legacyResult.buildId])
    await expect(buildApprovedPageStudioVersion(legacyInput, { queryOne: async () => authority as never, runTransaction, worker: { build: async () => {
      throw new Error('synthetic worker failure')
    } } })).rejects.toMatchObject({ code: 'BUILD_WORKER_UNAVAILABLE' })
    expect((await db.query('SELECT state FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].state).toBe('pending')
    expect((await db.query('SELECT state FROM page_studio_builds WHERE id=$1', [legacyResult.buildId])).rows[0].state).toBe('failed')
  })
  it('denies Astro activation and preserves historical rollback with metadata restoration', async () => {
    const retained = await reserve()
    await expect(db.query('UPDATE page_studio_builds SET state=\'succeeded\' WHERE id=$1', [retained.buildId]))
      .rejects.toMatchObject({ constraint: 'page_studio_astro_release_receipt_valid' })
    await expect(activatePageStudioRelease({ ...activateInput(), buildId: retained.buildId, expectedActiveReleaseId: legacyReleaseId, idempotencyKey: 'astro-activation' }, { runTransaction })).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_releases')).rows[0].count).toBe(1)
    const second = await activatePageStudioRelease({ ...activateInput(), expectedActiveReleaseId: legacyReleaseId, idempotencyKey: 'second-release' }, { runTransaction })
    await db.query('UPDATE page_studio_sites SET theme=\'{}\'::jsonb')
    await rollbackPageStudioRelease({ ...activateInput(), expectedActiveReleaseId: second.releaseId, targetReleaseId: legacyReleaseId, idempotencyKey: 'rollback' }, { runTransaction })
    expect((await db.query('SELECT current_release_id,theme FROM page_studio_sites')).rows[0]).toEqual({ current_release_id: legacyReleaseId, theme: { label: 'historical' } })
  })
})
