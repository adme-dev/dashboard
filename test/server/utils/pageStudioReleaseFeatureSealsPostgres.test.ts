import { readPublishedFeaturePage } from '~~/server/utils/pageStudio/publishedFeatureProjection'
import { readPublishedFeatureSnapshot } from '~~/server/utils/pageStudio/publishedFeatureAuthority'
import { coordinateFeatureActivation } from '~~/server/utils/pageStudio/releaseFeatureActivation'
import { activatePageStudioRelease, rollbackPageStudioRelease } from '~~/server/utils/pageStudio/publishing'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coordinateCmsGraphTransition } from '~~/server/utils/pageStudio/cmsGraphCoordinator'
import {
  coordinateSealedFeatureBuild,
  type FeatureBuildServices
} from '~~/server/utils/pageStudio/releaseFeatureBuild'
import {
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'
import {
  readFeaturePublisherSnapshot,
  withFeaturePublisher
} from '~~/server/utils/pageStudio/releaseFeatureAuthority'
import fixtureJson from '../../fixtures/pageStudioCmsGraph.json'
import type { ContentAuthorityRequest } from '~~/server/utils/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => {
    throw new Error('Use disposable transaction')
  },
  queryOneFresh: () => {
    throw new Error('Use locked transaction')
  }
}))
const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1'
    || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname)
    || url.search
  )
    throw new Error('Disposable localhost studio_cms database required')
}
describe.runIf(Boolean(databaseUrl))(
  'native feature publication authority on disposable PostgreSQL',
  () => {
    let observer: pg.Client,
      connections: pg.Client[],
      schema: string,
      scope: PageStudioContentScope,
      request: ContentAuthorityRequest
    async function connect() {
      const db = new pg.Client({ connectionString: databaseUrl })
      await db.connect()
      connections.push(db)
      await db.query(`SET search_path TO "${schema}", pg_catalog`)
      await db.query('SET statement_timeout=\'6s\'')
      return db
    }
    function transactionFor(db: pg.Client) {
      return async <T>(
        work: (db: PageStudioControlQueryClient) => Promise<T>
      ) => {
        await db.query('BEGIN')
        try {
          const result = await work(
            db as unknown as PageStudioControlQueryClient
          )
          await db.query('COMMIT')
          return result
        } catch (error) {
          await db.query('ROLLBACK')
          throw error
        }
      }
    }
    beforeEach(async () => {
      connections = []
      schema = `cms_${randomUUID().replaceAll('-', '')}`
      observer = await connect()
      await observer.query(`CREATE SCHEMA "${schema}"`)
      await observer.query(`CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
      CREATE TABLE visible_effects(id BIGSERIAL PRIMARY KEY);`)
      for (const file of [
        '402_page_studio_control_plane.sql',
        '404_page_studio_documents.sql',
        '420_page_studio_login_sessions.sql',
        '422_page_studio_cms_visibility.sql',
        '425_page_studio_cms_authoring_scope.sql',
        '413_page_studio_release_metadata.sql',
        '426_page_studio_release_feature_seals.sql'
      ]) {
        await observer.query(
          readFileSync(
            new URL(
              `../../../server/database/migrations/${file}`,
              import.meta.url
            ),
            'utf8'
          )
        )
      }
      const clientId = '10000000-0000-4000-8000-000000000001',
        userId = randomUUID(),
        roleId = randomUUID()
      await observer.query(
        'INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)',
        [userId]
      )
      await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [
        clientId
      ])
      await observer.query(
        'INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)',
        [roleId]
      )
      await observer.query(
        'INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\')',
        [roleId]
      )
      const entitlementId = (
        await observer.query(
          `INSERT INTO page_studio_entitlements(tenant_id,client_id,monthly_ai_operation_limit,active_site_limit,portal_creation_enabled,plan_metadata)
      VALUES('tenant',$1,0,2,TRUE,'{"builder":{"collectionSchemas":true}}') RETURNING id`,
          [clientId]
        )
      ).rows[0].id
      const siteId = (
        await observer.query(
          `INSERT INTO page_studio_sites(id,tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES('20000000-0000-4000-8000-000000000001','tenant',$1,$2,'CMS test','cms-test','fixture') RETURNING id`,
          [clientId, entitlementId]
        )
      ).rows[0].id
      scope = {
        tenantId: 'tenant',
        clientId,
        businessId: clientId,
        siteId,
        environment: 'staging'
      }
      const hash = randomUUID().replaceAll('-', '').repeat(2)
      const login = (
        await observer.query(
          `INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('agency',$1,$2,date_trunc('milliseconds',clock_timestamp())-INTERVAL '1hour',date_trunc('milliseconds',clock_timestamp())+INTERVAL '1day') RETURNING *`,
          [hash, userId]
        )
      ).rows[0]
      request = {
        siteId,
        actor: {
          role: 'agency',
          actorId: userId,
          tenantId: scope.tenantId,
          canEdit: true
        },
        login: {
          role: 'agency',
          userId,
          tokenHash: hash,
          issuedAt: login.issued_at,
          expiresAt: login.expires_at
        },
        env: {
          PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
          PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
          PAGE_STUDIO_CONTENT_ROUTER: {
            readContent() {
              throw new Error('No remote I/O')
            },
            writeContent() {
              throw new Error('No remote I/O')
            }
          }
        }
      }
    })
    afterEach(async () => {
      await Promise.all(
        connections.filter(db => db !== observer).map(db => db.end())
      )
      if (observer) {
        try {
          await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        } finally {
          await observer.end()
        }
      }
    })
    async function fixture(withInstance = false) {
      const f = structuredClone(fixtureJson)
      if (withInstance) {
        const pin = f.nextCheckpoint.manifest.builderLibrary.components.find(pin => pin.id === 'fleet_view')!
        const artifact = JSON.parse(f.artifactBytes.find(raw => JSON.parse(raw).id === 'fleet_view')!)
        f.nextCheckpoint.manifest.pages[0]!.components.push({ ...artifact.root, id: 'public_instance', builderInstance: { version: 1, pin, values: {} } } as never)
        for (const visibility of ['draft', 'hidden', 'archived'] as const) f.nextCheckpoint.manifest.pages.push({ ...structuredClone(f.nextCheckpoint.manifest.pages[0]!), id: `private_${visibility}`, route: `/${visibility}-page`, title: 'Private page content', visibility, components: [], forms: [] } as never)
        f.nextCheckpoint.digest = await collectionDigest(f.nextCheckpoint.manifest)
      }
      const actor = {
        kind: 'agency-user',
        userId: request.actor.actorId,
        loginSessionHash: request.login.tokenHash
      }
      const freezeBody = {
        createdAt: '2026-09-22T00:00:00.000Z',
        request: {
          formatVersion: 1,
          scope,
          actor,
          target: f.base.target,
          adoptionId: 'adoption_a'
        },
        state: 'frozen'
      }
      const freeze = {
        ...freezeBody,
        digest: await collectionDigest(freezeBody)
      }
      const prep = JSON.parse(f.preparations[0]!.requestBytes)
      prep.actor = actor
      prep.freezeDigest = freeze.digest
      const receipt = JSON.parse(f.preparations[0]!.receiptBytes)
      receipt.freezeDigest = freeze.digest
      for (const pin of receipt.items) pin.freezeDigest = freeze.digest
      receipt.requestDigest = await collectionDigest(prep)
      delete receipt.digest
      receipt.digest = await collectionDigest(receipt)
      const key = JSON.stringify([
        scope.tenantId,
        scope.clientId,
        scope.businessId,
        scope.siteId,
        scope.environment
      ])
      const cpKey = (id: string) =>
        `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${id}.json`
      await observer.query(
        `INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at) VALUES($1,$2,$3,$4,$5,$6,'base',clock_timestamp())`,
        [
          f.base.checkpoint.id,
          scope.tenantId,
          scope.clientId,
          scope.siteId,
          f.base.checkpoint.digest,
          cpKey(f.base.checkpoint.id)
        ]
      )
      await observer.query(
        'UPDATE page_studio_sites SET current_checkpoint_id=$1 WHERE id=$2',
        [f.base.checkpoint.id, scope.siteId]
      )
      await observer.query(
        `INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest) VALUES($1,$2,$3,$4,$5,$6,'legacy','adoption_a',$7,$8,$9)`,
        [
          key,
          scope.tenantId,
          scope.clientId,
          scope.businessId,
          scope.siteId,
          scope.environment,
          f.base.generation,
          f.base.target,
          freeze.digest
        ]
      )
      await observer.query(
        `INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id) VALUES($1,$2,$3,$4,$5,'adoption_a')`,
        [
          key,
          f.base.generation,
          f.base.application.manifest.applicationId,
          f.base.application.digest,
          f.base.application.manifest
        ]
      )
      await observer.query(
        `UPDATE page_studio_cms_scopes SET state='managed',current_application_id=$2 WHERE scope_key=$1`,
        [key, f.base.application.manifest.applicationId]
      )
      const texts = new Map<string, string>()
      const hash = async (value: string) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(value)
            )
          ),
          x => x.toString(16).padStart(2, '0')
        ).join('')
      for (const raw of f.artifactBytes) {
        const artifact = JSON.parse(raw),
          identity
            = artifact.kind === 'collection' ? artifact.definition : artifact
        texts.set(
          `builder-artifacts/v1/${await hash(key)}/${artifact.kind}/${identity.id}/${identity.version}/${await hash(raw)}.json`,
          raw
        )
      }
      texts.set(
        `builder-candidates/v1/${await hash(key)}/${f.request.candidateId}.json`,
        f.candidateBytes
      )
      for (const cp of [f.base.checkpoint, f.nextCheckpoint])
        texts.set(
          cpKey(cp.id),
          JSON.stringify({
            schemaVersion: 1,
            checkpointId: cp.id,
            digest: cp.digest,
            scope: {
              tenantId: scope.tenantId,
              clientId: scope.clientId,
              siteId: scope.siteId
            },
            manifest: cp.manifest
          })
        )
      let inTransaction = false
      const get = vi.fn(async (objectKey: string) => {
        expect(
          inTransaction,
          'R2 reads must be outside native transactions'
        ).toBe(false)
        const raw = texts.get(objectKey)
        if (!raw) return null
        const bytes = new TextEncoder().encode(raw)
        return {
          size: bytes.length,
          etag: 'fixture',
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(bytes)
              controller.close()
            }
          })
        }
      })
      request.env.PAGE_STUDIO_CHECKPOINTS = {
        get,
        put: async (key: string, raw: string) => {
          if (texts.has(key)) return null
          texts.set(key, raw)
          return { etag: 'fixture' }
        }
      }
      request.env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST = f.expectedRuntimeDigest
      request.env.PAGE_STUDIO_CONTENT_ROUTER = {
        readManagedCmsTarget: async () => {
          expect(
            inTransaction,
            'D1 reads must be outside native transactions'
          ).toBe(false)
          return f.base.target
        },
        readManagedCmsOperation: async () => ({ request: prep, receipt }),
        readManagedCmsFreeze: async () => freeze,
        readManagedCmsObjects: async ({ pins }: { pins: unknown[] }) =>
          pins.map(pin => ({
            pin,
            body: prep.items[0].body,
            schema: null,
            head: false,
            actorId: actor.userId,
            createdAt: receipt.createdAt
          }))
      }
      const input = {
        operationId: 'accept_feature_a',
        candidateId: f.request.candidateId,
        candidateDigest: f.request.candidateDigest,
        expectedApplication: f.request.expectedApplication,
        expectedCheckpoint: f.request.expectedCheckpoint,
        expectedContent: null,
        contentRevision: 0,
        nextCheckpoint: {
          checkpointId: f.nextCheckpoint.id,
          digest: f.nextCheckpoint.digest,
          objectKey: cpKey(f.nextCheckpoint.id),
          createdAt: receipt.createdAt,
          etag: 'next',
          userId: actor.userId,
          scope: {
            tenantId: scope.tenantId,
            clientId: scope.clientId,
            siteId: scope.siteId
          }
        },
        preparations: [
          {
            operationId: prep.operationId,
            requestDigest: receipt.requestDigest,
            receiptDigest: receipt.digest
          }
        ],
        summary: 'Add fleet'
      }
      const transaction = transactionFor(await connect())
      const runTransaction = async <T>(
        work: (db: PageStudioControlQueryClient) => Promise<T>
      ) => {
        inTransaction = true
        try {
          return await transaction(work)
        } finally {
          inTransaction = false
        }
      }
      return {
        manifest: f.nextCheckpoint.manifest,
        input,
        principal: { source: 'native-login' as const, request },
        deps: { runTransaction },
        get,
        texts,
        key
      }
    }
    async function admitted(withInstance = false) {
      const f = await fixture(withInstance)
      await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
      await observer.query(
        'INSERT INTO role_permission_groups SELECT id,\'PAGE_STUDIO_PUBLISH\' FROM custom_roles'
      )
      return f
    }
    async function approvedBuild(withInstance = false) {
      const f = await admitted(withInstance)
      request.env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST
        = 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e'
      const version = (
        await observer.query('SELECT * FROM page_studio_versions')
      ).rows[0]
      await observer.query('UPDATE page_studio_versions SET status=\'approved\'')
      await observer.query(
        'INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,reviewer_id,decision) VALUES($1,$2,$3,$4,$5,$6,\'approved\')',
        [
          scope.tenantId,
          scope.clientId,
          scope.siteId,
          version.id,
          version.digest,
          request.actor.actorId
        ]
      )
      const input = {
        actorId: request.actor.actorId,
        assets: [],
        idempotencyKey: 'build_feature',
        manifest: f.manifest,
        siteId: scope.siteId,
        tenantId: scope.tenantId,
        versionId: version.id
      }
      const services = {
        buildSealed: vi.fn(
          async ({
            request: build,
            recoveryBundle: bundle
          }: Parameters<FeatureBuildServices['buildSealed']>[0]) => {
            const raw = collectionCanonical(bundle),
              sha256 = await collectionDigest(bundle)
            const recovery = {
              key: `builder-recovery/v1/${await collectionDigest(scope)}/${build.versionDigest}/${sha256}.json`,
              bytes: new TextEncoder().encode(raw).byteLength,
              sha256
            }
            f.texts.set(recovery.key, raw)
            const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${build.versionDigest}`
            return {
              build: {
                artifactPrefix: prefix,
                buildId: `build_${build.versionDigest.slice(0, 32)}`,
                manifestDigest: 'd'.repeat(64),
                manifestKey: `${prefix}/release-manifest.json`,
                validationKey: `${prefix}/validation-report.json`,
                versionDigest: build.versionDigest,
                success: true as const
              },
              recovery,
              reference: {
                formatVersion: 1 as const,
                checkpointDigest: build.versionDigest,
                sha256
              }
            }
          }
        ),
        verifyFeatureBuild: vi.fn(async () => ({}))
      }
      return { ...f, input, services }
    }
    it('atomically installs exact immutable build seal and replays without duplicating audit', async () => {
      const f = await approvedBuild()
      const first = await coordinateSealedFeatureBuild(
        f.input,
        f.principal,
        f.services,
        f.deps
      )
      expect(
        await coordinateSealedFeatureBuild(
          f.input,
          f.principal,
          f.services,
          f.deps
        )
      ).toEqual(first)
      expect(
        (
          await observer.query(
            'SELECT * FROM page_studio_release_feature_seals'
          )
        ).rows
      ).toHaveLength(1)
      expect(
        (
          await observer.query(
            'SELECT * FROM page_studio_audit_events WHERE action=\'release.feature_sealed\''
          )
        ).rows
      ).toHaveLength(1)
      expect(
        (
          await observer.query(
            'SELECT release_metadata FROM page_studio_builds'
          )
        ).rows[0].release_metadata.featureSeal.sha256
      ).toMatch(/^[a-f0-9]{64}$/)
      await expect(
        observer.query(
          'UPDATE page_studio_release_feature_seals SET seal_digest=repeat(\'f\',64)'
        )
      ).rejects.toThrow('RELEASE_FEATURE_SEAL_IMMUTABLE')
    })
    it('does not persist build or seal when publish authority is revoked during artifact verification', async () => {
      const f = await approvedBuild()
      f.services.verifyFeatureBuild.mockImplementation(async () => {
        await observer.query(
          'DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_PUBLISH\''
        )
        return {}
      })
      await expect(
        coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      ).rejects.toMatchObject({ statusCode: 403 })
      expect(
        (await observer.query('SELECT * FROM page_studio_builds')).rows
      ).toHaveLength(0)
      expect(
        (
          await observer.query(
            'SELECT * FROM page_studio_release_feature_seals'
          )
        ).rows
      ).toHaveLength(0)
    })
    it('does not mark an unknown build response failed', async () => {
      const f = await approvedBuild()
      f.services.buildSealed.mockRejectedValueOnce(
        new Error('lost build response')
      )
      await expect(
        coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      ).rejects.toThrow('lost build response')
      expect(
        (await observer.query('SELECT * FROM page_studio_builds')).rows
      ).toHaveLength(0)
      await coordinateSealedFeatureBuild(
        f.input,
        f.principal,
        f.services,
        f.deps
      )
    })
    it('binds public feature activation to its pointer epoch and never rewinds on retry', async () => {
      const f = await approvedBuild(),
        build = await coordinateSealedFeatureBuild(
          f.input,
          f.principal,
          f.services,
          f.deps
        )
      const input = {
        actorId: request.actor.actorId,
        buildId: build.buildId,
        environment: 'production' as const,
        expectedActiveReleaseId: null,
        hostname: 'fixture.example.com',
        idempotencyKey: 'activate_feature',
        scope: {
          tenantId: scope.tenantId,
          clientId: scope.clientId,
          siteId: scope.siteId
        }
      }
      await expect(
        activatePageStudioRelease(input, f.deps)
      ).rejects.toMatchObject({ statusCode: 409 })
      const release = await coordinateFeatureActivation(
        input,
        f.principal,
        f.services,
        f.deps
      )
      expect(release.featureActivation.isCurrent).toBe(true)
      expect(
        await coordinateFeatureActivation(
          input,
          f.principal,
          f.services,
          f.deps
        )
      ).toEqual(release)
      await observer.query(
        'UPDATE page_studio_release_pointers SET pointer_version=pointer_version+2'
      )
      const replay = await coordinateFeatureActivation(
        input,
        f.principal,
        f.services,
        f.deps
      )
      expect(replay.releaseId).toBe(release.releaseId)
      expect(replay.featureActivation.isCurrent).toBe(false)
      expect(
        (
          await observer.query(
            'SELECT * FROM page_studio_release_feature_activations'
          )
        ).rows
      ).toHaveLength(1)
      await expect(
        observer.query('DELETE FROM page_studio_release_feature_activations')
      ).rejects.toThrow('RELEASE_FEATURE_ACTIVATION_IMMUTABLE')
    })
    it('late publisher revocation prevents both release and feature activation writes', async () => {
      const f = await approvedBuild(),
        build = await coordinateSealedFeatureBuild(
          f.input,
          f.principal,
          f.services,
          f.deps
        )
      f.services.verifyFeatureBuild.mockImplementation(async () => {
        await observer.query(
          'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'
        )
        return {}
      })
      const input = {
        actorId: request.actor.actorId,
        buildId: build.buildId,
        environment: 'production' as const,
        expectedActiveReleaseId: null,
        hostname: 'fixture.example.com',
        idempotencyKey: 'activate_feature',
        scope: {
          tenantId: scope.tenantId,
          clientId: scope.clientId,
          siteId: scope.siteId
        }
      }
      await expect(
        coordinateFeatureActivation(input, f.principal, f.services, f.deps)
      ).rejects.toMatchObject({ statusCode: 403 })
      expect(
        (await observer.query('SELECT * FROM page_studio_releases')).rows
      ).toHaveLength(0)
      expect(
        (
          await observer.query(
            'SELECT * FROM page_studio_release_feature_activations'
          )
        ).rows
      ).toHaveLength(0)
    })
    it('seals adopted definitions from actual D1 bytes without requiring collection wrapper R2 objects', async () => {
      const f = await approvedBuild()
      for (const key of f.texts.keys())
        if (key.includes('/collection/')) f.texts.delete(key)
      await coordinateSealedFeatureBuild(
        f.input,
        f.principal,
        f.services,
        f.deps
      )
    })
    it('rejects exact private recovery bytes changed after worker acknowledgement', async () => {
      const f = await approvedBuild(),
        original = f.services.buildSealed.getMockImplementation()!
      f.services.buildSealed.mockImplementation(async (input) => {
        const value = await original(input)
        f.texts.set(value.recovery.key, '{}')
        return value
      })
      await expect(
        coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      ).rejects.toMatchObject({ statusCode: 409 })
      expect(
        (await observer.query('SELECT * FROM page_studio_builds')).rows
      ).toHaveLength(0)
    })
    it('late approval withdrawal rolls back both build receipt and feature seal', async () => {
      const f = await approvedBuild()
      f.services.verifyFeatureBuild.mockImplementation(async () => {
        await observer.query(
          `INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,reviewer_id,decision,decided_at) SELECT tenant_id,client_id,site_id,version_id,version_digest,reviewer_id,'rejected',clock_timestamp()+interval '1second' FROM page_studio_reviews LIMIT 1`
        )
        return {}
      })
      await expect(
        coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      ).rejects.toMatchObject({ statusCode: 422 })
      expect(
        (await observer.query('SELECT * FROM page_studio_builds')).rows
      ).toHaveLength(0)
    })
    it('requires current publish permission in addition to original native editing authority', async () => {
      const f = await fixture()
      await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
      await expect(
        readFeaturePublisherSnapshot(f.principal, f.deps)
      ).rejects.toMatchObject({ statusCode: 403 })
      await observer.query(
        'INSERT INTO role_permission_groups SELECT id,\'PAGE_STUDIO_PUBLISH\' FROM custom_roles'
      )
      expect(
        (await readFeaturePublisherSnapshot(f.principal, f.deps)).scope
      ).toEqual(scope)
    })
    it('rolls back local writes when publish permission is removed before final checks', async () => {
      const f = await admitted()
      const snapshot = await readFeaturePublisherSnapshot(f.principal, f.deps)
      await expect(
        withFeaturePublisher(
          snapshot,
          f.principal,
          async (db) => {
            await db.query('INSERT INTO visible_effects DEFAULT VALUES')
            await db.query(
              'DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_PUBLISH\''
            )
          },
          f.deps
        )
      ).rejects.toMatchObject({ statusCode: 403 })
      expect(
        (await observer.query('SELECT * FROM visible_effects')).rows
      ).toHaveLength(0)
    })
    it('denies an expired original login on exact snapshot reuse', async () => {
      const f = await admitted()
      const snapshot = await readFeaturePublisherSnapshot(f.principal, f.deps)
      await observer.query(
        'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'
      )
      await expect(
        withFeaturePublisher(snapshot, f.principal, async () => null, f.deps)
      ).rejects.toMatchObject({ statusCode: 403 })
    })
    it.each(['current', 'publisher-logout', 'client-disabled', 'site-disabled', 'expired', 'activation-revoked', 'pointer-aba'] as const)('applies real published authority: %s', async (mode) => {
      const f = await approvedBuild()
      const build = await coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      const release = await coordinateFeatureActivation({ actorId: request.actor.actorId, buildId: build.buildId, environment: 'production', expectedActiveReleaseId: null, hostname: 'fixture.example.com', idempotencyKey: 'published_test', scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } }, f.principal, f.services, f.deps)
      const seal = (await observer.query('SELECT * FROM page_studio_release_feature_seals')).rows[0]
      const input = { hostname: 'fixture.example.com', releaseId: release.releaseId, buildId: build.buildId, versionDigest: build.versionDigest, manifestDigest: build.manifestDigest, sealDigest: seal.seal_digest, pageRoute: '/' }
      if (mode === 'publisher-logout') await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      if (mode === 'client-disabled') await observer.query('UPDATE agency_clients SET is_active=FALSE')
      if (mode === 'site-disabled') await observer.query('UPDATE page_studio_sites SET status=\'archived\'')
      if (mode === 'expired') await observer.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-INTERVAL \'1second\'')
      if (mode === 'activation-revoked') await observer.query('UPDATE page_studio_release_feature_activations SET state=\'revoked\',revoked_at=clock_timestamp()')
      if (mode === 'pointer-aba') await observer.query('UPDATE page_studio_release_pointers SET pointer_version=pointer_version+2')
      const result = readPublishedFeatureSnapshot(input, request.env, f.deps)
      if (mode === 'current' || mode === 'publisher-logout') {
        const snapshot = await result
        expect(snapshot.contentScope.environment).toBe('staging')
        expect(snapshot.release.releaseId).toBe(release.releaseId)
        expect(snapshot.release.pointerVersion).toBe(1)
      } else await expect(result).rejects.toThrow()
    })

    it.each(['current', 'revoked-during-read', 'record-head-removed', 'wrong-page', 'draft', 'hidden', 'archived', 'corrupt-bundle', 'oversize-stream'] as const)('projects sealed public page and current native record heads: %s', async (mode) => {
      const f = await approvedBuild(true)
      const build = await coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      const release = await coordinateFeatureActivation({ actorId: request.actor.actorId, buildId: build.buildId, environment: 'production', expectedActiveReleaseId: null, hostname: 'fixture.example.com', idempotencyKey: 'public_page', scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } }, f.principal, f.services, f.deps)
      const seal = (await observer.query('SELECT * FROM page_studio_release_feature_seals')).rows[0]
      const schemaObject = (await observer.query('SELECT * FROM page_studio_cms_objects WHERE kind=\'schema\'')).rows[0]
      const recordBody = { scope, collectionId: 'fleet', id: 'published_record', revision: 1, schemaVersion: 1, archived: false, values: { title: 'Live public value' } }
      const recordPin = { ...schemaObject.storage_pin, kind: 'record', recordId: recordBody.id, operationId: 'public_record', sha256: await collectionDigest(recordBody), bytes: new TextEncoder().encode(collectionCanonical(recordBody)).length }
      const recordId = randomUUID()
      const inserted = (await observer.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id) VALUES($1,$2,$3,'record','fleet',$4,1,$5,$6,FALSE,$7,clock_timestamp(),'adoption_a') RETURNING created_at`, [schemaObject.scope_key, schemaObject.generation, recordId, recordBody.id, recordPin, schemaObject.id, request.actor.actorId])).rows[0]
      await observer.query(`INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,'fleet',$3,$4)`, [schemaObject.scope_key, schemaObject.generation, recordBody.id, recordId])
      const router = request.env.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsObjects: (input: { pins: Array<{ kind: string }> }) => Promise<unknown[]> }
      const original = router.readManagedCmsObjects
      router.readManagedCmsObjects = async (input) => {
        return await Promise.all(input.pins.map(async (pin) => {
          if (pin.kind !== 'record') return (await original({ pins: [pin] }))[0]
          if (mode === 'record-head-removed') await observer.query('DELETE FROM page_studio_cms_record_heads')
          if (mode === 'revoked-during-read') await observer.query('UPDATE page_studio_release_feature_activations SET state=\'revoked\',revoked_at=clock_timestamp()')
          return { pin: recordPin, body: recordBody, actorId: request.actor.actorId, createdAt: new Date(inserted.created_at).toISOString(), schema: schemaObject.storage_pin, head: false }
        }))
      }
      await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      const input = { hostname: 'fixture.example.com', releaseId: release.releaseId, buildId: build.buildId, versionDigest: build.versionDigest, manifestDigest: build.manifestDigest, sealDigest: seal.seal_digest, pageRoute: mode === 'wrong-page' ? '/private' : ['draft', 'hidden', 'archived'].includes(mode) ? `/${mode}-page` : f.manifest.pages[0]!.route }
      if (mode === 'corrupt-bundle') f.texts.set(seal.recovery_key, f.texts.get(seal.recovery_key)!.replace('public_instance', 'forged_instance'))
      if (mode === 'oversize-stream') {
        const originalGet = f.get.getMockImplementation()!
        f.get.mockImplementation(async key => key === seal.recovery_key
          ? { size: seal.recovery_bytes, etag: 'oversized', body: new ReadableStream({ start(controller) {
              controller.enqueue(new Uint8Array(seal.recovery_bytes + 1))
              controller.close()
            } }) }
          : await originalGet(key))
      }
      const result = readPublishedFeaturePage(input, request.env, f.deps)
      if (mode !== 'current') await expect(result).rejects.toThrow()
      else {
        const page = await result
        expect(page.contentScope.environment).toBe('staging')
        expect(page.page).toEqual(f.manifest.pages[0])
        expect(page.components).toHaveLength(1)
        expect(page.routes).toHaveLength(1)
        expect(JSON.stringify(page)).not.toContain('Private page content')
        expect(Object.values(page.components[0]!.data)).toEqual([[{ id: recordBody.id, values: recordBody.values }]])
        expect(JSON.stringify(page)).not.toMatch(/"source"|loginSessionHash|recovery_key|accountId/)
      }
    })
    it('keeps staging and production authority independent for the same immutable seal', async () => {
      const f = await approvedBuild()
      const build = await coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      const seal = (await observer.query('SELECT * FROM page_studio_release_feature_seals')).rows[0]
      const base = { actorId: request.actor.actorId, buildId: build.buildId, expectedActiveReleaseId: null, scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } }
      const production = await coordinateFeatureActivation({ ...base, environment: 'production', hostname: 'production.example.com', idempotencyKey: 'publish_prod' }, f.principal, f.services, f.deps)
      request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
      const staging = await coordinateFeatureActivation({ ...base, environment: 'staging', hostname: 'staging.example.com', idempotencyKey: 'publish_stage' }, f.principal, f.services, f.deps)
      const input = (hostname: string, releaseId: string) => ({ hostname, releaseId, buildId: build.buildId, versionDigest: build.versionDigest, manifestDigest: build.manifestDigest, sealDigest: seal.seal_digest, pageRoute: f.manifest.pages[0]!.route })
      expect((await readPublishedFeaturePage(input('staging.example.com', staging.releaseId), request.env, f.deps)).release.releaseId).toBe(staging.releaseId)
      const prodEnv = { ...request.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }
      expect((await readPublishedFeaturePage(input('production.example.com', production.releaseId), prodEnv, f.deps)).release.releaseId).toBe(production.releaseId)
      expect((await observer.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(staging.releaseId)
      await expect(readPublishedFeaturePage(input('staging.example.com', staging.releaseId), prodEnv, f.deps)).rejects.toThrow()
      await expect(readPublishedFeaturePage(input('production.example.com', production.releaseId), request.env, f.deps)).rejects.toThrow()
      const newerRelease = (await observer.query(`INSERT INTO page_studio_releases(tenant_id,client_id,site_id,build_id,environment,normalized_hostname,idempotency_key) VALUES($1,$2,$3,$4,'production','production.example.com','newer_publication') RETURNING id`, [scope.tenantId, scope.clientId, scope.siteId, build.buildId])).rows[0].id
      await observer.query('UPDATE page_studio_release_pointers SET active_release_id=$1,pointer_version=pointer_version+1 WHERE environment=\'production\'', [newerRelease])
      const before = (await observer.query('SELECT * FROM page_studio_release_pointers ORDER BY environment')).rows
      await expect(rollbackPageStudioRelease({ actorId: request.actor.actorId, environment: 'production', hostname: 'production.example.com', idempotencyKey: 'rollback_feature', scope: base.scope, targetReleaseId: production.releaseId, expectedActiveReleaseId: newerRelease }, f.deps)).rejects.toMatchObject({ statusCode: 409 })
      expect((await observer.query('SELECT * FROM page_studio_release_pointers ORDER BY environment')).rows).toEqual(before)
    })
  }
)
