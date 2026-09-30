import { readPublishedRuntimeFeatureForms } from '~~/server/utils/pageStudio/publishedRuntimeFeatureForms'
import { rollbackRuntimeFeature } from '~~/server/utils/pageStudio/runtimeFeatureRollback'
import { readPublishedRuntimeFeatureSnapshot } from '~~/server/utils/pageStudio/publishedRuntimeFeatureAuthority'
import { readPublishedRuntimeFeaturePage } from '~~/server/utils/pageStudio/publishedRuntimeFeatureProjection'
import { createPublicCmsFixture } from '../../fixtures/pageStudioPublicCms'
import { prepareApprovedRuntimeFeature } from '~~/server/utils/pageStudio/runtimeFeaturePreparation'
import { activateRuntimeFeature } from '~~/server/utils/pageStudio/runtimeFeatureActivation'
import { CmsPreparationSchema, cmsItemIdentity, cmsPreparationActorId } from '~~/shared/pageStudio/cmsManaged'
import { builderActionResultKey } from '~~/shared/pageStudio/actionInvocation'
import { admitPublishedFormAction, acknowledgePublishedFormAction, completePublishedFormAction, recoverPublishedFormAction } from '~~/server/utils/pageStudio/publicActionInvocations'
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
import secondCanaryFixture from '../../fixtures/pageStudioCmsGraphSecondCanary.json'
import { runtimeTargetPolicy } from '~~/server/utils/pageStudio/runtimeTarget'
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
    let fixtureSource = fixtureJson
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
      fixtureSource = fixtureJson
      schema = `cms_${randomUUID().replaceAll('-', '')}`
      observer = await connect()
      await observer.query(`CREATE SCHEMA "${schema}"`)
      await observer.query(`CREATE TYPE user_role AS ENUM ('owner','admin','member','viewer','guest');
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role user_role,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
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
        '426_page_studio_release_feature_seals.sql',
        '421_page_studio_ai_usage.sql', '427_page_studio_public_action_invocations.sql', '428_page_studio_client_staging.sql',
        '430_page_studio_astro_build_identity.sql', '431_page_studio_astro_release_receipt.sql',
        '433_page_studio_runtime_delivery.sql', '434_page_studio_runtime_draft_isolation.sql',
        '435_page_studio_runtime_features.sql'
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
    async function fixture(withInstance = false, withForm: boolean | 'ordinary' = false) {
      const f = structuredClone(fixtureSource)
      if (withInstance) {
        const pin = f.nextCheckpoint.manifest.builderLibrary.components.find(pin => pin.id === 'fleet_view')!
        const artifact = JSON.parse(f.artifactBytes.find(raw => JSON.parse(raw).id === 'fleet_view')!)
        f.nextCheckpoint.manifest.pages[0]!.components.push({ ...artifact.root, id: 'public_instance', builderInstance: { version: 1, pin, values: {} } } as never)
        for (const visibility of ['draft', 'hidden', 'archived'] as const) f.nextCheckpoint.manifest.pages.push({ ...structuredClone(f.nextCheckpoint.manifest.pages[0]!), id: `private_${visibility}`, route: `/${visibility}-page`, title: 'Private page content', visibility, components: [], forms: [] } as never)
        f.nextCheckpoint.digest = await collectionDigest(f.nextCheckpoint.manifest)
      }
      if (withForm) {
        f.nextCheckpoint.manifest.pages[0]!.forms = [{ id: 'contact', name: 'Contact', fields: [{ id: 'title', name: 'Title', type: 'text', required: true }], submission: { mode: 'action', version: 1, trigger: 'form-submit', action: f.nextCheckpoint.manifest.builderApplication.actions[0], mappings: [{ conversion: 'string', fieldId: 'title', inputKey: 'title' }] } }] as never
        if (withForm === 'ordinary') delete (f.nextCheckpoint.manifest.pages[0]!.forms![0] as unknown as { submission?: unknown }).submission
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
        async readManagedCmsObjectsAtTarget({ target: expectedTarget, ...input }: { target: unknown, pins: unknown[], scope: unknown }) {
          expect(expectedTarget).toEqual(f.base.target)
          return await this.readManagedCmsObjects(input)
        },
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
    async function admitted(withInstance = false, withForm: boolean | 'ordinary' = false) {
      const f = await fixture(withInstance, withForm)
      await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
      await observer.query(
        'INSERT INTO role_permission_groups SELECT id,\'PAGE_STUDIO_PUBLISH\' FROM custom_roles ON CONFLICT DO NOTHING'
      )
      return f
    }
    async function approvedBuild(withInstance = false, withForm: boolean | 'ordinary' = false) {
      const f = await admitted(withInstance, withForm)
      request.env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST
        = 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e'
      const version = (
        await observer.query('SELECT * FROM page_studio_versions WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3', [scope.tenantId, scope.clientId, scope.siteId])
      ).rows[0]
      await observer.query('UPDATE page_studio_versions SET status=\'approved\' WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3', [scope.tenantId, scope.clientId, scope.siteId])
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
    async function publishedAction() {
      const f = await approvedBuild(false, true)
      await observer.query(`UPDATE page_studio_entitlements SET monthly_ai_operation_limit=2,plan_metadata='{"builder":{"collectionSchemas":true,"actionExecution":true}}'`)
      const build = await coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      const release = await coordinateFeatureActivation({ actorId: request.actor.actorId, buildId: build.buildId, environment: 'production', expectedActiveReleaseId: null, hostname: 'fixture.example.com', idempotencyKey: 'public_form', scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } }, f.principal, f.services, f.deps)
      const seal = (await observer.query('SELECT * FROM page_studio_release_feature_seals')).rows[0]
      const input = { hostname: 'fixture.example.com', releaseId: release.releaseId, buildId: build.buildId, versionDigest: build.versionDigest, manifestDigest: build.manifestDigest, sealDigest: seal.seal_digest, pageRoute: '/' }
      const snapshot = await readPublishedFeatureSnapshot(input, request.env, f.deps)
      request.env.PAGE_STUDIO_PUBLIC_FORM_TURNSTILE_SECRET = 'test-only-secret'
      const fetch = vi.fn(async () => Response.json({ success: true, hostname: input.hostname, action: 'page_studio_public_form' }))
      const form = f.manifest.pages[0]!.forms![0]!
      const body = { version: 1, publication: { ...input, activationId: snapshot.release.activationId, pointerVersion: snapshot.release.pointerVersion }, pageId: 'home', formId: 'contact', formDigest: await collectionDigest(form), fields: { title: 'New enquiry' }, intentId: randomUUID(), receiptSecret: 'a'.repeat(64), clientAddress: '192.0.2.10', turnstileToken: 'test-challenge' }
      return { ...f, body, fetch }
    }
    async function runtimePreparation(onWrite: (key: string) => Promise<void> = async () => {}, environment: 'staging' | 'production' = 'production', withForm: boolean | 'ordinary' = 'ordinary') {
      const f = await approvedBuild(true, withForm)
      const bucket = {
        get: async (key: string) => {
          const object = await f.get(key)
          if (!object) return null
          const body = f.texts.get(key)!
          return { ...object, arrayBuffer: async () => new TextEncoder().encode(body).buffer }
        },
        put: async (key: string, bytes: Uint8Array) => {
          f.texts.set(key, new TextDecoder().decode(bytes))
          await onWrite(key)
        }
      }
      const preparation = {
        bucket, environment, versionId: f.input.versionId,
        scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId },
        renderer: { name: 'astro-runtime', generation: 'renderer_a', codeDigest: 'a'.repeat(64), assetsDigest: 'b'.repeat(64) }
      } as const
      request.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS = JSON.stringify(['renderer_a', 'renderer_b'].map(generation => ({
        scope: preparation.scope, environment, renderer: { ...preparation.renderer, generation }
      })))
      return { ...f, preparation, prepare: () => prepareApprovedRuntimeFeature(preparation, f.principal, f.deps) }
    }
    it.each(['missing', 'malformed', 'scope', 'tenant', 'client', 'environment', 'generation', 'code', 'assets'] as const)('rejects unadmitted CMS runtime preparation before retaining content: %s', async (mode) => {
      const f = await runtimePreparation()
      const before = [...f.texts.keys()]
      const admissions = JSON.parse(String(request.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS))
      if (mode === 'scope') admissions[0].scope.siteId = randomUUID()
      if (mode === 'tenant') admissions[0].scope.tenantId = 'other-tenant'
      if (mode === 'client') admissions[0].scope.clientId = randomUUID()
      if (mode === 'environment') admissions[0].environment = 'staging'
      if (mode === 'generation') admissions[0].renderer.generation = 'old_renderer'
      if (mode === 'code') admissions[0].renderer.codeDigest = 'c'.repeat(64)
      if (mode === 'assets') admissions[0].renderer.assetsDigest = 'c'.repeat(64)
      request.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS = mode === 'missing' ? undefined : mode === 'malformed' ? '{' : JSON.stringify(admissions)
      await expect(f.prepare()).rejects.toMatchObject({ code: 'RUNTIME_CMS_NOT_ADMITTED', statusCode: 503 })
      expect([...f.texts.keys()]).toEqual(before)
      expect((await observer.query('SELECT * FROM page_studio_releases')).rows).toHaveLength(0)
    })
    async function rejectLatestRuntimeApproval() {
      await observer.query(`INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,reviewer_id,decision)
        SELECT tenant_id,client_id,site_id,version_id,version_digest,reviewer_id,'rejected'
        FROM page_studio_reviews ORDER BY decided_at DESC,id DESC LIMIT 1`)
    }
    it('prepares approved runtime CMS recovery without compiling or activating a release', async () => {
      const f = await runtimePreparation()
      const prepared = await f.prepare()
      expect(prepared.feature.reference.releaseDigest).toBe(prepared.prepared.digest)
      expect(prepared.feature.contentScope).toEqual(scope)
      expect(prepared.prepared.release.versionId).toBe(f.input.versionId)
      expect(f.services.buildSealed).not.toHaveBeenCalled()
      expect((await observer.query('SELECT * FROM page_studio_releases')).rows).toHaveLength(0)
      expect((await observer.query('SELECT * FROM page_studio_builds')).rows).toHaveLength(0)
      expect(await f.prepare()).toEqual(prepared)
    })
    it.each([15_000, 30_001])('bounds cold publication retention across all stages: %dms', async (elapsed) => {
      let now = Date.now()
      const f = await runtimePreparation(async (key) => {
        if (key.includes('/runtime/versions/')) now += elapsed
      })
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
      try {
        if (elapsed < 30_000) {
          const result = await f.prepare()
          expect(result.prepared.release.versionId).toBe(f.input.versionId)
        } else {
          await expect(f.prepare()).rejects.toThrow('timed out')
        }
        expect((await observer.query('SELECT * FROM page_studio_releases')).rows).toHaveLength(0)
      } finally {
        clock.mockRestore()
      }
    })
    it('rechecks SQL authority after storage without charging SQL latency to the storage deadline', async () => {
      let retained = false
      const f = await runtimePreparation(async (key) => {
        if (key.startsWith('builder-recovery/')) retained = true
      })
      let now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
      let rechecked = false
      try {
        const result = await prepareApprovedRuntimeFeature(f.preparation, f.principal, {
          ...f.deps,
          runTransaction: async work => f.deps.runTransaction(async (db) => {
            if (retained) {
              now += 11_000
              rechecked = true
            }
            return await work(db)
          })
        })
        expect(rechecked).toBe(true)
        expect(result.prepared.release.versionId).toBe(f.input.versionId)
        expect((await observer.query('SELECT * FROM page_studio_releases')).rows).toHaveLength(0)
      } finally {
        clock.mockRestore()
      }
    })
    it.each(['approval', 'permission', 'login'])('rejects runtime preparation after %s is revoked during retention', async (kind) => {
      const f = await runtimePreparation(async (key) => {
        if (!key.startsWith('builder-recovery/')) return
        if (kind === 'approval') await rejectLatestRuntimeApproval()
        if (kind === 'permission') await observer.query('DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_PUBLISH\'')
        if (kind === 'login') await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      })
      await expect(f.prepare()).rejects.toMatchObject({ statusCode: kind === 'approval' ? 422 : 403 })
      expect((await observer.query('SELECT * FROM page_studio_releases')).rows).toHaveLength(0)
    })
    it('rejects an unapproved runtime CMS version before retaining runtime content', async () => {
      const f = await runtimePreparation()
      await rejectLatestRuntimeApproval()
      const before = [...f.texts.keys()]
      await expect(f.prepare()).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED', statusCode: 422 })
      expect([...f.texts.keys()]).toEqual(before)
    })
    async function runtimeActivation(environment: 'staging' | 'production' = 'production', withForm: boolean | 'ordinary' = 'ordinary') {
      const f = await runtimePreparation(undefined, environment, withForm)
      await observer.query('UPDATE page_studio_sites SET delivery_mode=\'runtime\'')
      await observer.query(`INSERT INTO page_studio_domains(tenant_id,client_id,site_id,normalized_hostname,cloudflare_hostname_id,hostname_status,tls_status,dns_status,lifecycle_state,verified_at)
        VALUES($1,$2,$3,'fixture.example.com','cf-test','active','active','active','active',NOW())`, [scope.tenantId, scope.clientId, scope.siteId])
      const hostname = environment === 'production' ? 'fixture.example.com' : `preview-${scope.siteId.replaceAll('-', '')}.xeroflow.io`
      if (environment === 'staging') await observer.query(`INSERT INTO page_studio_staging_sites(tenant_id,client_id,site_id,hostname,host_state,provider_domain_id,provider_verified_at) VALUES($1,$2,$3,$4,'ready','cf-staging',NOW())`, [scope.tenantId, scope.clientId, scope.siteId, hostname])
      const activation = {
        actorId: request.actor.actorId, environment,
        hostname, expectedActiveReleaseId: null,
        idempotencyKey: 'runtime-feature', preparation: f.preparation
      }
      const policy = { deploymentEnvironment: 'production' as const }
      return { ...f, activation, activate: () => activateRuntimeFeature(activation, f.principal, { ...f.deps, policy }) }
    }
    it('rejects generated action forms before runtime retention and preserves the existing published pointer', async () => {
      const f = await runtimeActivation('production', true)
      await observer.query(`UPDATE page_studio_entitlements SET plan_metadata='{"builder":{"collectionSchemas":true,"actionExecution":true}}'`)
      const build = await coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      const previous = await coordinateFeatureActivation({ actorId: request.actor.actorId, buildId: build.buildId,
        environment: 'production', expectedActiveReleaseId: null, hostname: f.activation.hostname,
        idempotencyKey: 'previous-static-action', scope: f.preparation.scope }, f.principal, f.services, f.deps)
      const pointers = (await observer.query('SELECT * FROM page_studio_release_pointers')).rows
      const keys = [...f.texts.keys()]
      await expect(activateRuntimeFeature({ ...f.activation, expectedActiveReleaseId: previous.releaseId }, f.principal,
        { ...f.deps, policy: { deploymentEnvironment: 'production' } })).rejects.toMatchObject({ code: 'RUNTIME_ACTION_FORMS_UNAVAILABLE', statusCode: 422 })
      expect([...f.texts.keys()]).toEqual(keys)
      expect((await observer.query('SELECT * FROM page_studio_release_pointers')).rows).toEqual(pointers)
      expect((await observer.query('SELECT * FROM page_studio_runtime_feature_seals')).rows).toHaveLength(0)
    })

    async function publishedRuntime(environment: 'staging' | 'production' = 'production') {
      const f = await runtimeActivation(environment)
      const release = await f.activate()
      const seal = (await observer.query('SELECT * FROM page_studio_runtime_feature_seals')).rows[0]
      const input = { hostname: f.activation.hostname, releaseId: release.releaseId, releaseDigest: release.releaseDigest,
        versionDigest: release.release.versionDigest, sealDigest: seal.identity.reference.recovery.sha256,
        activationId: release.featureActivation.id, pointerVersion: release.featureActivation.pointerVersion, pageRoute: '/' }
      return { ...f, release, seal, publishedInput: input }
    }
    it.each(['current', 'publisher-logout', 'client-disabled', 'site-disabled', 'expired', 'activation-revoked', 'pointer-aba', 'wrong-env', 'wrong-digest', 'wrong-activation'] as const)('applies real runtime published authority: %s', async (mode) => {
      const f = await publishedRuntime()
      if (mode === 'publisher-logout') await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      if (mode === 'client-disabled') await observer.query('UPDATE agency_clients SET is_active=FALSE')
      if (mode === 'site-disabled') await observer.query('UPDATE page_studio_sites SET status=\'archived\'')
      if (mode === 'expired') await observer.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-INTERVAL \'1second\'')
      if (mode === 'activation-revoked') await observer.query('UPDATE page_studio_runtime_feature_activations SET state=\'revoked\',revoked_at=clock_timestamp()')
      if (mode === 'pointer-aba') await observer.query('UPDATE page_studio_release_pointers SET pointer_version=pointer_version+2')
      if (mode === 'wrong-env') request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
      if (mode === 'wrong-digest') f.publishedInput.releaseDigest = 'f'.repeat(64)
      if (mode === 'wrong-activation') f.publishedInput.activationId = randomUUID()
      const result = readPublishedRuntimeFeatureSnapshot(f.publishedInput, request.env, f.deps)
      if (mode === 'current' || mode === 'publisher-logout') {
        expect((await result).release).toEqual({ ...f.publishedInput, pageRoute: undefined })
      } else await expect(result).rejects.toThrow()
    })
    it.each(['ready', 'suspended', 'unverified', 'missing', 'wrong-owner'] as const)('reads shared staging CMS on production only for a ready owned hostname: %s', async (mode) => {
      const f = await publishedRuntime('staging')
      if (mode === 'suspended') await observer.query('UPDATE page_studio_staging_sites SET host_state=\'suspended\'')
      if (mode === 'unverified') await observer.query('UPDATE page_studio_staging_sites SET host_state=\'provisioning\',provider_verified_at=NULL')
      if (mode === 'missing' || mode === 'wrong-owner') await observer.query('DELETE FROM page_studio_staging_sites')
      if (mode === 'wrong-owner') {
        // Valid hostname owned by a different site must not authorize this pointer.
        const otherId = randomUUID()
        await observer.query(`INSERT INTO page_studio_sites(id,tenant_id,client_id,entitlement_id,name,route,starter_version)
          SELECT $1,tenant_id,client_id,entitlement_id,'Other','other','fixture' FROM page_studio_sites WHERE id=$2`, [otherId, scope.siteId])
        const otherHost = `preview-${otherId.replaceAll('-', '')}.xeroflow.io`
        await observer.query(`INSERT INTO page_studio_staging_sites(tenant_id,client_id,site_id,hostname,host_state,provider_domain_id,provider_verified_at) VALUES($1,$2,$3,$4,'ready','cf-other',NOW())`, [scope.tenantId, scope.clientId, otherId, otherHost])
        await observer.query('UPDATE page_studio_release_pointers SET normalized_hostname=$1', [otherHost])
        f.publishedInput.hostname = otherHost
      }
      const result = readPublishedRuntimeFeaturePage(f.publishedInput, request.env, f.deps)
      if (mode === 'ready') {
        expect((await result).release.releaseId).toBe(f.release.releaseId)
        expect((await readPublishedRuntimeFeatureSnapshot(f.publishedInput, request.env, f.deps)).releaseEnvironment).toBe('staging')
      } else await expect(result).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
    })

    it('publishes and restores shared staging CMS while preserving an independent production pointer', async () => {
      const f = await publishedRuntime()
      const hostname = `preview-${scope.siteId.replaceAll('-', '')}.xeroflow.io`
      await observer.query(`INSERT INTO page_studio_staging_sites(tenant_id,client_id,site_id,hostname,host_state,provider_domain_id,provider_verified_at) VALUES($1,$2,$3,$4,'ready','cf-staging',NOW())`, [scope.tenantId, scope.clientId, scope.siteId, hostname])
      const admissions = JSON.parse(String(request.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS))
      request.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS = JSON.stringify([...admissions, ...admissions.map((entry: Record<string, unknown>) => ({ ...entry, environment: 'staging' }))])
      const preparation = { ...f.preparation, environment: 'staging' as const }
      const activation = { ...f.activation, preparation, environment: 'staging' as const, hostname, idempotencyKey: 'staging-first' }
      const dependencies = { ...f.deps, policy: { deploymentEnvironment: 'production' as const } }
      const first = await activateRuntimeFeature(activation, f.principal, dependencies)
      const second = await activateRuntimeFeature({ ...activation, idempotencyKey: 'staging-second', expectedActiveReleaseId: first.releaseId,
        preparation: { ...preparation, renderer: { ...preparation.renderer, generation: 'renderer_b' } } }, f.principal, dependencies)
      const restored = await rollbackRuntimeFeature({ actorId: request.actor.actorId, environment: 'staging', hostname,
        expectedActiveReleaseId: second.releaseId, targetReleaseId: first.releaseId, idempotencyKey: 'staging-restore',
        retainedGenerations: ['renderer_a', 'renderer_b'], scope: preparation.scope }, f.principal, dependencies)
      const seal = (await observer.query('SELECT * FROM page_studio_runtime_feature_seals WHERE release_id=$1', [first.releaseId])).rows[0]
      const stageInput = { hostname, releaseId: first.releaseId, releaseDigest: first.releaseDigest,
        versionDigest: first.release.versionDigest, sealDigest: seal.identity.reference.recovery.sha256,
        activationId: restored.featureActivation.id, pointerVersion: restored.featureActivation.pointerVersion, pageRoute: '/' }
      expect(restored.featureActivation.pointerVersion).toBe(3)
      expect((await readPublishedRuntimeFeaturePage(stageInput, request.env, f.deps)).release.releaseId).toBe(first.releaseId)
      expect((await readPublishedRuntimeFeaturePage(f.publishedInput, request.env, f.deps)).release.releaseId).toBe(f.release.releaseId)
      expect((await observer.query('SELECT active_release_id,pointer_version FROM page_studio_release_pointers WHERE environment=\'production\'')).rows).toEqual([{ active_release_id: f.release.releaseId, pointer_version: '1' }])
      await expect(readPublishedRuntimeFeaturePage(f.publishedInput, { ...request.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, f.deps)).rejects.toThrow()
    })

    it.each(['current', 'non-synthetic', 'wrong-config', 'production'] as const)('keeps isolated synthetic staging canary admission scoped: %s', async (mode) => {
      const f = await runtimeActivation('staging')
      await observer.query('DELETE FROM page_studio_staging_sites')
      await observer.query(`UPDATE page_studio_sites SET integrations='{"synthetic":true}'`)
      const hostname = 'page-studio-staging.xeroflow.io'
      const canary = { ...f.preparation.scope, hostname }
      request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
      request.env.PAGE_STUDIO_RUNTIME_STAGING_CANARY = JSON.stringify(canary)
      const release = await activateRuntimeFeature({ ...f.activation, hostname }, f.principal,
        { ...f.deps, policy: { deploymentEnvironment: 'staging', stagingCanary: canary } })
      const seal = (await observer.query('SELECT * FROM page_studio_runtime_feature_seals')).rows[0]
      if (mode === 'non-synthetic') await observer.query(`UPDATE page_studio_sites SET integrations='{}'`)
      if (mode === 'wrong-config') request.env.PAGE_STUDIO_RUNTIME_STAGING_CANARY = JSON.stringify({ ...canary, siteId: randomUUID() })
      if (mode === 'production') request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'production'
      const input = { hostname, releaseId: release.releaseId, releaseDigest: release.releaseDigest,
        versionDigest: release.release.versionDigest, sealDigest: seal.identity.reference.recovery.sha256,
        activationId: release.featureActivation.id, pointerVersion: release.featureActivation.pointerVersion, pageRoute: '/' }
      const result = readPublishedRuntimeFeaturePage(input, request.env, f.deps)
      if (mode === 'current') expect((await result).release.releaseId).toBe(release.releaseId)
      else await expect(result).rejects.toThrow()
    })

    it('keeps two tenant canaries independent through activation, projection, rollback and revocation', async () => {
      const first = await runtimePreparation(undefined, 'staging')
      const firstScope = scope, firstRequest = request
      fixtureSource = secondCanaryFixture
      scope = secondCanaryFixture.base.scope as PageStudioContentScope
      const actorId = randomUUID(), tokenHash = randomUUID().replaceAll('-', '').repeat(2)
      await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [actorId])
      await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [scope.clientId])
      const entitlement = (await observer.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,monthly_ai_operation_limit,active_site_limit,portal_creation_enabled,plan_metadata)
        VALUES($1,$2,0,2,TRUE,'{"builder":{"collectionSchemas":true}}') RETURNING id`, [scope.tenantId, scope.clientId])).rows[0].id
      await observer.query(`INSERT INTO page_studio_sites(id,tenant_id,client_id,entitlement_id,name,route,starter_version)
        VALUES($1,$2,$3,$4,'Second canary','second-canary','fixture')`, [scope.siteId, scope.tenantId, scope.clientId, entitlement])
      const login = (await observer.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
        VALUES('agency',$1,$2,date_trunc('milliseconds',clock_timestamp())-INTERVAL '1hour',date_trunc('milliseconds',clock_timestamp())+INTERVAL '1day') RETURNING *`, [tokenHash, actorId])).rows[0]
      request = { ...firstRequest, siteId: scope.siteId, actor: { role: 'agency', actorId, tenantId: scope.tenantId, canEdit: true },
        login: { role: 'agency', userId: actorId, tokenHash, issuedAt: login.issued_at, expiresAt: login.expires_at }, env: { ...firstRequest.env } }
      const second = await runtimePreparation(undefined, 'staging')
      const secondRequest = request
      const canaries = [
        { ...first.preparation.scope, hostname: 'page-studio-staging.xeroflow.io' },
        { ...second.preparation.scope, hostname: 'cms-second-staging.xeroflow.io' }
      ]
      const admissions = [firstRequest, secondRequest].flatMap(item => JSON.parse(String(item.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS)))
      for (const item of [firstRequest, secondRequest]) {
        item.env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
        item.env.PAGE_STUDIO_RUNTIME_STAGING_CANARIES = JSON.stringify(canaries)
        item.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS = JSON.stringify(admissions)
      }
      await observer.query(`UPDATE page_studio_sites SET delivery_mode='runtime',integrations='{"synthetic":true}' WHERE id=ANY($1::uuid[])`, [[firstScope.siteId, scope.siteId]])
      const policy = runtimeTargetPolicy(firstRequest.env)
      const firstInput = { actorId: firstRequest.actor.actorId, environment: 'staging' as const, hostname: canaries[0]!.hostname,
        expectedActiveReleaseId: null, idempotencyKey: 'canary-first', preparation: first.preparation }
      const secondInput = { ...firstInput, actorId, hostname: canaries[1]!.hostname, idempotencyKey: 'canary-second', preparation: second.preparation }
      const firstRelease = await activateRuntimeFeature(firstInput, first.principal, { ...first.deps, policy })
      const secondRelease = await activateRuntimeFeature(secondInput, second.principal, { ...second.deps, policy })
      async function projectionInput(hostname: string, release: typeof firstRelease) {
        const seal = (await observer.query('SELECT * FROM page_studio_runtime_feature_seals WHERE release_id=$1', [release.releaseId])).rows[0]
        return { hostname, releaseId: release.releaseId, releaseDigest: release.releaseDigest, versionDigest: release.release.versionDigest,
          sealDigest: seal.identity.reference.recovery.sha256, activationId: release.featureActivation.id, pointerVersion: release.featureActivation.pointerVersion, pageRoute: '/' }
      }
      const firstPublic = await projectionInput(firstInput.hostname, firstRelease)
      const secondPublic = await projectionInput(secondInput.hostname, secondRelease)
      expect((await readPublishedRuntimeFeaturePage(firstPublic, firstRequest.env, first.deps)).release.releaseId).toBe(firstRelease.releaseId)
      expect((await readPublishedRuntimeFeaturePage(secondPublic, secondRequest.env, second.deps)).release.releaseId).toBe(secondRelease.releaseId)
      await expect(readPublishedRuntimeFeaturePage({ ...firstPublic, hostname: secondPublic.hostname }, secondRequest.env, second.deps)).rejects.toThrow()
      await expect(activateRuntimeFeature({ ...firstInput, hostname: secondInput.hostname, idempotencyKey: 'wrong-canary-host' }, first.principal, { ...first.deps, policy })).rejects.toThrow()
      const replacement = await activateRuntimeFeature({ ...firstInput, idempotencyKey: 'canary-replacement', expectedActiveReleaseId: firstRelease.releaseId,
        preparation: { ...first.preparation, renderer: { ...first.preparation.renderer, generation: 'renderer_b' } } }, first.principal, { ...first.deps, policy })
      scope = firstScope
      request = firstRequest
      const recordId = await addLiveRuntimeRecord('Current first-tenant records survive rollback')
      const restored = await rollbackRuntimeFeature({ actorId: firstRequest.actor.actorId, environment: 'staging', hostname: firstInput.hostname,
        expectedActiveReleaseId: replacement.releaseId, targetReleaseId: firstRelease.releaseId, idempotencyKey: 'canary-rollback',
        retainedGenerations: ['renderer_a', 'renderer_b'], scope: first.preparation.scope }, first.principal, { ...first.deps, policy })
      const currentFirst = { ...firstPublic, activationId: restored.featureActivation.id, pointerVersion: restored.featureActivation.pointerVersion }
      const projected = await readPublishedRuntimeFeaturePage(currentFirst, firstRequest.env, first.deps)
      expect(JSON.stringify(projected.components)).toContain('Current first-tenant records survive rollback')
      expect(restored.featureActivation.pointerVersion).toBe(3)
      expect((await observer.query('SELECT object_id FROM page_studio_cms_record_heads')).rows[0].object_id).toBe(recordId)
      const secondProjected = await readPublishedRuntimeFeaturePage(secondPublic, secondRequest.env, second.deps)
      expect(secondProjected.release.releaseId).toBe(secondRelease.releaseId)
      expect(JSON.stringify(secondProjected.components)).not.toContain('Current first-tenant records survive rollback')
      const secondReplacement = await activateRuntimeFeature({ ...secondInput, idempotencyKey: 'second-replacement', expectedActiveReleaseId: secondRelease.releaseId,
        preparation: { ...second.preparation, renderer: { ...second.preparation.renderer, generation: 'renderer_b' } } }, second.principal, { ...second.deps, policy })
      scope = secondCanaryFixture.base.scope as PageStudioContentScope
      request = secondRequest
      await addLiveRuntimeRecord('Current second-tenant records survive rollback')
      const secondRestored = await rollbackRuntimeFeature({ actorId, environment: 'staging', hostname: secondInput.hostname,
        expectedActiveReleaseId: secondReplacement.releaseId, targetReleaseId: secondRelease.releaseId, idempotencyKey: 'second-rollback',
        retainedGenerations: ['renderer_a', 'renderer_b'], scope: second.preparation.scope }, second.principal, { ...second.deps, policy })
      const currentSecond = { ...secondPublic, activationId: secondRestored.featureActivation.id, pointerVersion: secondRestored.featureActivation.pointerVersion }
      const currentSecondProjection = await readPublishedRuntimeFeaturePage(currentSecond, secondRequest.env, second.deps)
      expect(JSON.stringify(currentSecondProjection.components)).toContain('Current second-tenant records survive rollback')
      expect(JSON.stringify(currentSecondProjection.components)).not.toContain('Current first-tenant records survive rollback')
      expect(secondRestored.featureActivation.pointerVersion).toBe(3)
      expect(JSON.stringify((await readPublishedRuntimeFeaturePage(currentFirst, firstRequest.env, first.deps)).components)).toContain('Current first-tenant records survive rollback')
      await expect(readPublishedRuntimeFeaturePage(secondPublic, secondRequest.env, second.deps)).rejects.toThrow()
      await expect(readPublishedRuntimeFeaturePage(currentSecond, { ...secondRequest.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }, second.deps)).rejects.toThrow()
      await expect(readPublishedRuntimeFeaturePage(firstPublic, firstRequest.env, first.deps)).rejects.toThrow()
      firstRequest.env.PAGE_STUDIO_RUNTIME_STAGING_CANARIES = JSON.stringify([canaries[1]])
      await expect(readPublishedRuntimeFeaturePage(currentFirst, firstRequest.env, first.deps)).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHABLE' })
      expect((await readPublishedRuntimeFeaturePage(currentSecond, { ...secondRequest.env, PAGE_STUDIO_RUNTIME_STAGING_CANARIES: firstRequest.env.PAGE_STUDIO_RUNTIME_STAGING_CANARIES }, second.deps)).release.releaseId).toBe(secondRelease.releaseId)
      expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_staging_sites')).rows[0].count).toBe(0)
    })

    async function addLiveRuntimeRecord(title: string) {
      const actorId = request.actor.actorId
      const schemaObject = (await observer.query('SELECT * FROM page_studio_cms_objects WHERE kind=\'schema\' AND scope_key=$1', [JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment])])).rows[0]
      const body = { scope, collectionId: 'fleet', id: 'runtime_record', revision: 1, schemaVersion: 1, archived: false, values: { title } }
      const pin = { ...schemaObject.storage_pin, kind: 'record', recordId: body.id, operationId: 'runtime_record', sha256: await collectionDigest(body), bytes: new TextEncoder().encode(collectionCanonical(body)).length }
      const id = randomUUID()
      const inserted = (await observer.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id)
        VALUES($1,$2,$3,'record','fleet',$4,1,$5,$6,FALSE,$7,clock_timestamp(),'adoption_a') RETURNING created_at`, [schemaObject.scope_key, schemaObject.generation, id, body.id, pin, schemaObject.id, actorId])).rows[0]
      await observer.query('INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,\'fleet\',$3,$4)', [schemaObject.scope_key, schemaObject.generation, body.id, id])
      const router = request.env.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsObjects: (input: { pins: Array<{ kind: string }> }) => Promise<unknown[]> }
      const original = router.readManagedCmsObjects
      router.readManagedCmsObjects = async input => await Promise.all(input.pins.map(async item => item.kind === 'record'
        ? { pin, body, actorId, createdAt: new Date(inserted.created_at).toISOString(), schema: schemaObject.storage_pin, head: false }
        : (await original({ pins: [item] }))[0]))
      return id
    }
    it('restores a retained runtime template with a new activation epoch and current CMS authority', async () => {
      const f = await publishedRuntime()
      const second = await activateRuntimeFeature({ ...f.activation, idempotencyKey: 'second-runtime', expectedActiveReleaseId: f.release.releaseId,
        preparation: { ...f.preparation, renderer: { ...f.preparation.renderer, generation: 'renderer_b' } } }, f.principal, { ...f.deps, policy: { deploymentEnvironment: 'production' } })
      const input = { actorId: request.actor.actorId, environment: 'production' as const, hostname: f.activation.hostname,
        expectedActiveReleaseId: second.releaseId, targetReleaseId: f.release.releaseId, idempotencyKey: 'rollback-runtime',
        retainedGenerations: ['renderer_a', 'renderer_b'], scope: f.preparation.scope }
      const currentRecordId = await addLiveRuntimeRecord('Saved after the older publication')
      const rollback = () => rollbackRuntimeFeature(input, f.principal, { ...f.deps, policy: { deploymentEnvironment: 'production' } })
      const restored = await rollback()
      expect(restored.releaseId).toBe(f.release.releaseId)
      expect(restored.featureActivation.pointerVersion).toBe(3)
      expect(restored.featureActivation.id).not.toBe(f.release.featureActivation.id)
      expect(await rollback()).toEqual(restored)
      await expect(readPublishedRuntimeFeatureSnapshot(f.publishedInput, request.env, f.deps)).rejects.toThrow()
      const projection = await readPublishedRuntimeFeaturePage({ ...f.publishedInput, activationId: restored.featureActivation.id, pointerVersion: 3 }, request.env, f.deps)
      expect(projection.release.releaseId).toBe(f.release.releaseId)
      expect(JSON.stringify(projection.components)).toContain('Saved after the older publication')
      expect((await observer.query('SELECT object_id FROM page_studio_cms_record_heads')).rows[0].object_id).toBe(currentRecordId)
      await observer.query('UPDATE page_studio_runtime_feature_activations SET state=\'revoked\',revoked_at=clock_timestamp() WHERE id=$1', [restored.featureActivation.id])
      await expect(rollback()).rejects.toThrow()
    })
    it('refuses rollback to an unadmitted CMS renderer without moving the current pointer', async () => {
      const f = await publishedRuntime()
      const second = await activateRuntimeFeature({ ...f.activation, idempotencyKey: 'second-runtime', expectedActiveReleaseId: f.release.releaseId,
        preparation: { ...f.preparation, renderer: { ...f.preparation.renderer, generation: 'renderer_b' } } }, f.principal, { ...f.deps, policy: { deploymentEnvironment: 'production' } })
      request.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS = JSON.stringify(JSON.parse(String(request.env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS)).filter((entry: { renderer: { generation: string } }) => entry.renderer.generation === 'renderer_b'))
      const pointers = (await observer.query('SELECT * FROM page_studio_release_pointers')).rows
      await expect(rollbackRuntimeFeature({ actorId: request.actor.actorId, environment: 'production', hostname: f.activation.hostname,
        expectedActiveReleaseId: second.releaseId, targetReleaseId: f.release.releaseId, idempotencyKey: 'unadmitted-rollback',
        retainedGenerations: ['renderer_a', 'renderer_b'], scope: f.preparation.scope }, f.principal,
      { ...f.deps, policy: { deploymentEnvironment: 'production' } })).rejects.toMatchObject({ code: 'RUNTIME_CMS_NOT_ADMITTED', statusCode: 503 })
      expect((await observer.query('SELECT * FROM page_studio_release_pointers')).rows).toEqual(pointers)
    })

    it('projects ordinary public runtime forms without borrowing the publisher login', async () => {
      const f = await publishedRuntime()
      await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      const result = await readPublishedRuntimeFeatureForms(f.publishedInput, request.env, f.deps)
      expect(result.release.releaseId).toBe(f.release.releaseId)
      expect(result.runtime.siteId).toBe(scope.siteId)
      expect(result.runtime.forms).toHaveLength(1)
      expect(result.runtime.forms[0]!.form.id).toBe('contact')
      expect(result.runtime.forms.every(item => !item.form.submission)).toBe(true)
      await observer.query('UPDATE page_studio_runtime_feature_activations SET state=\'revoked\',revoked_at=clock_timestamp()')
      await expect(readPublishedRuntimeFeatureForms(f.publishedInput, request.env, f.deps)).rejects.toThrow()
    })
    it('prevents direct changes to retained runtime identity or activation epochs', async () => {
      const f = await publishedRuntime()
      await expect(observer.query('UPDATE page_studio_runtime_feature_seals SET release_digest=$1', ['f'.repeat(64)])).rejects.toThrow('RUNTIME_FEATURE_SEAL_IMMUTABLE')
      await expect(observer.query('DELETE FROM page_studio_runtime_feature_seals')).rejects.toThrow('RUNTIME_FEATURE_SEAL_IMMUTABLE')
      await expect(observer.query('UPDATE page_studio_runtime_feature_activations SET pointer_version=pointer_version+1')).rejects.toThrow('RUNTIME_FEATURE_ACTIVATION_IMMUTABLE')
      await expect(observer.query('DELETE FROM page_studio_runtime_feature_activations')).rejects.toThrow('RUNTIME_FEATURE_ACTIVATION_IMMUTABLE')
      expect((await readPublishedRuntimeFeatureSnapshot(f.publishedInput, request.env, f.deps)).release.activationId).toBe(f.publishedInput.activationId)
    })
    it('atomically activates runtime CMS recovery at one pointer epoch and retries idempotently', async () => {
      const f = await runtimeActivation()
      const first = await f.activate()
      const again = await f.activate()
      expect(again).toEqual(first)
      const seal = (await observer.query('SELECT * FROM page_studio_runtime_feature_seals')).rows[0]
      const activation = (await observer.query('SELECT * FROM page_studio_runtime_feature_activations')).rows[0]
      const pointer = (await observer.query('SELECT * FROM page_studio_release_pointers')).rows[0]
      expect(seal.release_id).toBe(first.releaseId)
      expect(seal.release_digest).toBe(first.releaseDigest)
      expect(activation.release_id).toBe(first.releaseId)
      expect(activation.pointer_version).toBe(pointer.pointer_version)
      expect(pointer.active_release_id).toBe(first.releaseId)
      expect((await observer.query('SELECT * FROM page_studio_builds')).rows).toHaveLength(0)
    })
    it('does not revive a revoked runtime activation on an idempotent retry', async () => {
      const f = await runtimeActivation()
      await f.activate()
      await observer.query('UPDATE page_studio_runtime_feature_activations SET state=\'revoked\',revoked_at=clock_timestamp()')
      await expect(f.activate()).rejects.toThrow()
      await expect(observer.query('UPDATE page_studio_runtime_feature_activations SET state=\'enabled\',revoked_at=NULL')).rejects.toThrow('RUNTIME_FEATURE_ACTIVATION_IMMUTABLE')
    })
    it('rolls back the runtime pointer and seal if activation storage fails', async () => {
      const f = await runtimeActivation()
      await observer.query(`CREATE FUNCTION reject_runtime_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic activation failure'; END $$;
        CREATE TRIGGER reject_runtime_activation BEFORE INSERT ON page_studio_runtime_feature_activations FOR EACH ROW EXECUTE FUNCTION reject_runtime_activation()`)
      await expect(f.activate()).rejects.toThrow('synthetic activation failure')
      for (const table of ['page_studio_releases', 'page_studio_release_pointers', 'page_studio_runtime_feature_seals']) {
        expect((await observer.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0)
      }
    })
    it('rejects a runtime activation retry after an intervening pointer epoch', async () => {
      const f = await runtimeActivation()
      await f.activate()
      await observer.query('UPDATE page_studio_release_pointers SET pointer_version=pointer_version+2')
      await expect(f.activate()).rejects.toThrow()
      expect((await observer.query('SELECT * FROM page_studio_runtime_feature_activations')).rows).toHaveLength(1)
    })
    it('allows only one concurrent runtime activation to claim the expected pointer', async () => {
      const f = await runtimeActivation()
      const outcomes = await Promise.allSettled(['race_a', 'race_b'].map(async (idempotencyKey) => {
        return await activateRuntimeFeature({ ...f.activation, idempotencyKey }, f.principal, {
          runTransaction: transactionFor(await connect()), policy: { deploymentEnvironment: 'production' }
        })
      }))
      expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
      expect((await observer.query('SELECT * FROM page_studio_releases')).rows).toHaveLength(1)
      expect((await observer.query('SELECT * FROM page_studio_runtime_feature_activations')).rows).toHaveLength(1)
    })
    it('claims a public action once with empty guest data, without borrowing the publisher login', async () => {
      const f = await publishedAction()
      await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      const first = await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch })
      expect(first.admission).toMatchObject({ dispatchGranted: true, state: 'dispatch_claimed', input: { title: 'New enquiry' }, data: {} })
      expect(first.prepared.request.context).not.toHaveProperty('expectedApplication')
      const retry = { ...f.body, turnstileToken: undefined, clientAddress: '192.0.2.11' }
      const second = await admitPublishedFormAction(retry, request.env, { ...f.deps, fetch: f.fetch })
      expect(second.admission).toMatchObject({ dispatchGranted: false, state: 'dispatch_claimed', execution: first.admission.execution })
      expect(f.fetch).toHaveBeenCalledTimes(1)
      expect((await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows).toHaveLength(1)
      expect((await observer.query('SELECT * FROM page_studio_ai_usage')).rows).toHaveLength(0)
      const saved = JSON.stringify((await observer.query('SELECT identity,execution FROM page_studio_public_action_invocations')).rows)
      expect(saved).not.toContain('New enquiry')
      expect(saved).not.toContain('test-challenge')
      expect(saved).not.toContain(f.body.receiptSecret)
    })
    it.each(['secret', 'fields', 'epoch', 'form'] as const)('rejects public retries with changed %s without another challenge or charge', async (change) => {
      const f = await publishedAction()
      await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch })
      const changed = structuredClone(f.body)
      if (change === 'secret') changed.receiptSecret = 'b'.repeat(64)
      if (change === 'fields') changed.fields.title = 'Changed input'
      if (change === 'epoch') changed.publication.pointerVersion++
      if (change === 'form') changed.formDigest = 'f'.repeat(64)
      await expect(admitPublishedFormAction(changed, request.env, { ...f.deps, fetch: f.fetch })).rejects.toThrow()
      expect(f.fetch).toHaveBeenCalledTimes(1)
      expect((await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows).toHaveLength(1)
    })
    it.each(['challenge', 'package', 'schema', 'allowance'] as const)('does not claim public execution after %s denial', async (mode) => {
      const f = await publishedAction()
      let authorityChanged = false
      if (mode === 'challenge') f.fetch.mockImplementation(async () => Response.json({ success: false }))
      else f.fetch.mockImplementation(async () => {
        if (mode === 'package') await observer.query(`UPDATE page_studio_entitlements SET plan_metadata='{"builder":{"collectionSchemas":true}}'`)
        if (mode === 'schema') await observer.query('UPDATE page_studio_cms_scopes SET current_application_id=$1', [fixtureJson.base.application.manifest.applicationId])
        if (mode === 'allowance') await observer.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=0')
        authorityChanged = true
        return Response.json({ success: true, hostname: 'fixture.example.com', action: 'page_studio_public_form' })
      })
      await expect(admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch })).rejects.toThrow()
      expect((await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows).toHaveLength(0)
      expect(f.fetch).toHaveBeenCalledTimes(1)
      if (mode !== 'challenge') expect(authorityChanged).toBe(true)
    })
    it('gives concurrent public retries one dispatch and one charged claim', async () => {
      const f = await publishedAction()
      const results = await Promise.all([0, 1].map(async () => admitPublishedFormAction(f.body, request.env, { runTransaction: transactionFor(await connect()), fetch: f.fetch })))
      expect(results.filter(result => result.admission.dispatchGranted)).toHaveLength(1)
      expect(results[0]!.admission.execution).toEqual(results[1]!.admission.execution)
      expect((await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows).toHaveLength(1)
    })
    it('keeps unknown public work charged and rejects a new intent at the limit', async () => {
      const f = await publishedAction()
      await observer.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=1')
      await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch })
      await expect(admitPublishedFormAction({ ...f.body, intentId: randomUUID() }, request.env, { ...f.deps, fetch: f.fetch })).rejects.toMatchObject({ code: 'AI_USAGE_EXHAUSTED' })
      expect((await observer.query('SELECT quota_state,state FROM page_studio_public_action_invocations')).rows).toEqual([{ quota_state: 'reserved', state: 'dispatch_claimed' }])
    })
    it('rejects undeclared form fields before challenge verification or a charge', async () => {
      const f = await publishedAction()
      await expect(admitPublishedFormAction({ ...f.body, fields: { ...f.body.fields, actorId: 'publisher' } }, request.env, { ...f.deps, fetch: f.fetch })).rejects.toThrow()
      expect(f.fetch).not.toHaveBeenCalled()
      expect((await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows).toHaveLength(0)
    })
    it.each(['ok', 'guest_error'] as const)('retains the exact public %s result once without a new challenge or dispatch', async (status) => {
      const f = await publishedAction()
      const claim = await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch })
      const execution = claim.admission.execution
      const result = status === 'ok' ? { status, json: '{"version":1,"commands":[],"result":null}' } : { status }
      const key = await builderActionResultKey(execution)
      f.texts.set(key, collectionCanonical({ formatVersion: 1, execution, result }))
      const retry = { ...f.body, turnstileToken: undefined }
      const ack = await acknowledgePublishedFormAction(retry, request.env, f.deps)
      expect(ack.state).toBe(status === 'ok' ? 'result_ready' : 'execution_failed')
      expect(await acknowledgePublishedFormAction(retry, request.env, f.deps)).toEqual(ack)
      const row = (await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows[0]
      expect(row.quota_state).toBe(status === 'ok' ? 'succeeded' : 'failed')
      expect(row.result_pin.key).toBe(key)
      expect(row.final_receipt).toBeNull()
      expect(f.fetch).toHaveBeenCalledTimes(1)
      expect((await admitPublishedFormAction(retry, request.env, { ...f.deps, fetch: f.fetch })).admission.dispatchGranted).toBe(false)
    })
    it.each(['missing', 'substituted', 'oversized', 'revoked'] as const)('keeps public work unresolved when its result is %s', async (mode) => {
      const f = await publishedAction()
      const claim = await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch })
      const execution = claim.admission.execution, key = await builderActionResultKey(execution)
      if (mode !== 'missing') f.texts.set(key, mode === 'oversized' ? ' '.repeat(150_001) : collectionCanonical({ formatVersion: 1, execution: { ...execution, ...(mode === 'substituted' ? { claimId: randomUUID() } : {}) }, result: { status: 'guest_error' } }))
      if (mode === 'revoked') {
        const originalGet = f.get.getMockImplementation()!
        f.get.mockImplementation(async (objectKey) => {
          const result = await originalGet(objectKey)
          if (objectKey === key) await observer.query(`UPDATE page_studio_release_feature_activations SET state='revoked',revoked_at=clock_timestamp()`)
          return result
        })
      }
      await expect(acknowledgePublishedFormAction({ ...f.body, turnstileToken: undefined }, request.env, f.deps)).rejects.toThrow()
      expect((await observer.query('SELECT state,quota_state,result_pin FROM page_studio_public_action_invocations')).rows).toEqual([{ state: 'dispatch_claimed', quota_state: 'reserved', result_pin: null }])
      expect(f.fetch).toHaveBeenCalledTimes(1)
    })
    it('keeps the sealed action usable when an unrelated authoring application advances during challenge verification', async () => {
      const f = await publishedAction()
      f.fetch.mockImplementation(async () => {
        const old = (await observer.query('SELECT a.* FROM page_studio_application_versions a JOIN page_studio_cms_scopes s ON s.scope_key=a.scope_key AND s.current_application_id=a.id')).rows[0]
        const nextId = randomUUID(), manifest = { ...old.manifest, applicationId: nextId, previousApplicationId: old.id }
        await observer.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,previous_application_id,commit_id,adoption_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [old.scope_key, old.generation, nextId, await collectionDigest(manifest), manifest, old.id, old.commit_id, old.adoption_id])
        await observer.query('INSERT INTO page_studio_cms_application_schemas SELECT scope_key,generation,$1,collection_id,object_id,kind FROM page_studio_cms_application_schemas WHERE application_id=$2', [nextId, old.id])
        await observer.query('UPDATE page_studio_cms_scopes SET current_application_id=$1', [nextId])
        return Response.json({ success: true, hostname: 'fixture.example.com', action: 'page_studio_public_form' })
      })
      expect((await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch })).admission.dispatchGranted).toBe(true)
    })
    it('cannot use result acknowledgement to create an unclaimed public invocation', async () => {
      const f = await publishedAction()
      await expect(acknowledgePublishedFormAction(f.body, request.env, f.deps)).rejects.toThrow()
      expect(f.fetch).not.toHaveBeenCalled()
      expect((await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows).toHaveLength(0)
    })
    async function publicEffects(commands: unknown[] = [{ type: 'create', collectionId: 'fleet', recordId: 'new_enquiry', expectedRevision: 0, values: { title: 'New enquiry' } }]) {
      const f = await publishedAction()
      const claim = await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch })
      const execution = claim.admission.execution
      f.texts.set(await builderActionResultKey(execution), collectionCanonical({ formatVersion: 1, execution, result: { status: 'ok', json: collectionCanonical({ version: 1, commands, result: { privateOutput: 'must not reach visitor' } }) } }))
      await acknowledgePublishedFormAction(f.body, request.env, f.deps)
      const original = request.env.PAGE_STUDIO_CONTENT_ROUTER as Record<string, (...args: never[]) => Promise<unknown>>
      const operations = new Map<string, { request: ReturnType<typeof CmsPreparationSchema.parse>, receipt: Record<string, unknown> }>()
      const prepare = vi.fn(async (raw: unknown) => {
        const input = CmsPreparationSchema.parse(raw), existing = operations.get(input.operationId)
        if (existing) {
          expect(input).toEqual(existing.request)
          return existing.receipt
        }
        const pins = await Promise.all(input.items.map(async item => ({ ...cmsItemIdentity(item), origin: 'prepared', operationId: input.operationId, freezeDigest: input.freezeDigest, sha256: await collectionDigest(item.body), bytes: new TextEncoder().encode(collectionCanonical(item.body)).byteLength })))
        const value = { state: 'prepared', scope: input.scope, operationId: input.operationId, freezeDigest: input.freezeDigest, requestDigest: await collectionDigest(input), items: pins, createdAt: new Date().toISOString() }
        const receipt = { ...value, digest: await collectionDigest(value) }
        operations.set(input.operationId, { request: input, receipt })
        return receipt
      })
      const readObjects = vi.fn(async ({ pins }: { pins: Array<{ operationId: string }> }) => Promise.all(pins.map(async (pin) => {
        const prepared = operations.get(pin.operationId)
        if (!prepared) return ((await original.readManagedCmsObjects!({ pins: [pin] } as never)) as unknown[])[0]
        const index = (prepared.receipt.items as unknown[]).findIndex(item => collectionCanonical(item) === collectionCanonical(pin))
        const item = prepared.request.items[index]!
        return { pin, body: item.body, schema: item.kind === 'record' ? item.schema : null, head: false, actorId: cmsPreparationActorId(prepared.request.actor), createdAt: prepared.receipt.createdAt }
      })))
      const router = { ...original, prepareManagedCmsOperation: prepare,
        readManagedCmsOperation: async ({ operationId }: { operationId: string }) => operations.get(operationId), readManagedCmsObjects: readObjects }
      request.env.PAGE_STUDIO_CONTENT_ROUTER = router
      return { ...f, claim, operations, prepare, readObjects, router, original }
    }
    async function recoveryBody(body: Awaited<ReturnType<typeof publishedAction>>['body']) {
      const { fields, turnstileToken: _token, ...identity } = body
      return { ...identity, clientAddress: '192.0.2.20', fieldsDigest: await collectionDigest(fields) }
    }
    it('recovers acknowledged effects after reload without original answers or another challenge', async () => {
      const f = await publicEffects(), recovery = await recoveryBody(f.body)
      const receipt = await recoverPublishedFormAction(recovery, request.env, f.deps)
      expect(receipt).toEqual({ version: 1, submissionId: f.claim.admission.execution.invocationId, state: 'received', duplicate: false })
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
      request.env.PAGE_STUDIO_CHECKPOINTS = {}
      request.env.PAGE_STUDIO_CONTENT_ROUTER = {}
      expect(await recoverPublishedFormAction(recovery, request.env, f.deps)).toEqual({ ...receipt, duplicate: true })
      expect(f.fetch).toHaveBeenCalledTimes(1)
      expect((await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows).toHaveLength(1)
      expect(recovery).not.toHaveProperty('fields')
      expect(recovery).not.toHaveProperty('turnstileToken')
    })
    it.each(['ok', 'guest_error'] as const)('recovers an unacknowledged %s result without dispatching again', async (status) => {
      const f = await publishedAction()
      const claim = await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch }), execution = claim.admission.execution
      f.texts.set(await builderActionResultKey(execution), collectionCanonical({ formatVersion: 1, execution, result: status === 'ok' ? { status, json: collectionCanonical({ version: 1, commands: [], result: { privateOutput: 'never disclose' } }) } : { status } }))
      expect(await recoverPublishedFormAction(await recoveryBody(f.body), request.env, f.deps)).toEqual({ version: 1, submissionId: execution.invocationId, state: status === 'ok' ? 'received' : 'rejected', duplicate: false })
      expect((await observer.query('SELECT quota_state FROM page_studio_public_action_invocations')).rows).toEqual([{ quota_state: status === 'ok' ? 'succeeded' : 'failed' }])
      expect(f.fetch).toHaveBeenCalledTimes(1)
    })
    it('keeps missing execution results pending and charged across answer-free recovery attempts', async () => {
      const f = await publishedAction()
      const claim = await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch }), recovery = await recoveryBody(f.body)
      for (let i = 0; i < 2; i++) expect(await recoverPublishedFormAction(recovery, request.env, f.deps)).toEqual({ version: 1, submissionId: claim.admission.execution.invocationId, state: 'pending', duplicate: true })
      expect((await observer.query('SELECT quota_state,state FROM page_studio_public_action_invocations')).rows).toEqual([{ quota_state: 'reserved', state: 'dispatch_claimed' }])
      expect(f.fetch).toHaveBeenCalledTimes(1)
    })
    it.each(['secret', 'fingerprint', 'epoch', 'form', 'fields'] as const)('denies recovery with changed %s before result access', async (mode) => {
      const f = await publicEffects(), recovery = await recoveryBody(f.body)
      if (mode === 'secret') recovery.receiptSecret = 'b'.repeat(64)
      if (mode === 'fingerprint') recovery.fieldsDigest = 'c'.repeat(64)
      if (mode === 'epoch') recovery.publication.pointerVersion++
      if (mode === 'form') recovery.formId = 'another_form'
      if (mode === 'fields') Object.assign(recovery, { fields: f.body.fields })
      f.get.mockClear()
      await expect(recoverPublishedFormAction(recovery, request.env, f.deps)).rejects.toThrow()
      expect(f.get).not.toHaveBeenCalled()
      expect(f.prepare).not.toHaveBeenCalled()
    })
    it('returns one durable receipt for concurrent answer-free recovery', async () => {
      const f = await publicEffects(), recovery = await recoveryBody(f.body)
      const receipts = await Promise.all([0, 1].map(async () => recoverPublishedFormAction(recovery, request.env, { runTransaction: transactionFor(await connect()) })))
      expect(receipts.map(receipt => receipt.state)).toEqual(['received', 'received'])
      expect(receipts.filter(receipt => !receipt.duplicate)).toHaveLength(1)
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
      expect((await observer.query('SELECT * FROM page_studio_audit_events WHERE action=\'public-action.commit\'')).rows).toHaveLength(1)
    })
    it('does not disclose a completed receipt after publication revocation', async () => {
      const f = await publicEffects(), recovery = await recoveryBody(f.body)
      await recoverPublishedFormAction(recovery, request.env, f.deps)
      await observer.query(`UPDATE page_studio_release_feature_activations SET state='revoked',revoked_at=clock_timestamp()`)
      await expect(recoverPublishedFormAction(recovery, request.env, f.deps)).rejects.toThrow()
    })
    it('cannot admit or charge an unknown intent through recovery', async () => {
      const f = await publishedAction(), recovery = await recoveryBody(f.body)
      await expect(recoverPublishedFormAction(recovery, request.env, f.deps)).rejects.toThrow()
      await expect(admitPublishedFormAction(recovery, request.env, { ...f.deps, fetch: f.fetch })).rejects.toThrow()
      expect((await observer.query('SELECT * FROM page_studio_public_action_invocations')).rows).toHaveLength(0)
      expect(f.fetch).not.toHaveBeenCalled()
    })
    it.each(['corrupt', 'unavailable', 'revoked'] as const)('does not turn %s recovery into a successful or pending receipt', async (mode) => {
      const f = await publishedAction()
      const claim = await admitPublishedFormAction(f.body, request.env, { ...f.deps, fetch: f.fetch }), key = await builderActionResultKey(claim.admission.execution)
      if (mode === 'corrupt') f.texts.set(key, '{broken')
      if (mode === 'unavailable') request.env.PAGE_STUDIO_CHECKPOINTS = {}
      if (mode === 'revoked') {
        const read = f.get.getMockImplementation()!
        f.get.mockImplementation(async (objectKey) => {
          if (objectKey === key) await observer.query(`UPDATE page_studio_release_feature_activations SET state='revoked',revoked_at=clock_timestamp()`)
          return read(objectKey)
        })
      }
      await expect(recoverPublishedFormAction(await recoveryBody(f.body), request.env, f.deps)).rejects.toThrow()
      expect((await observer.query('SELECT state,final_receipt FROM page_studio_public_action_invocations')).rows).toEqual([{ state: 'dispatch_claimed', final_receipt: null }])
    })
    it('commits public CMS records, provenance audit and received receipt together without moving authoring heads', async () => {
      const f = await publicEffects()
      const before = (await observer.query('SELECT current_application_id,current_content_id FROM page_studio_cms_scopes')).rows
      const checkpoints = (await observer.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows
      const receipt = await completePublishedFormAction(f.body, request.env, f.deps)
      expect(receipt).toEqual({ version: 1, submissionId: f.claim.admission.execution.invocationId, state: 'received', duplicate: false })
      expect((await observer.query('SELECT state,final_receipt FROM page_studio_public_action_invocations')).rows).toMatchObject([{ state: 'committed', final_receipt: { state: 'received' } }])
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
      expect((await observer.query('SELECT actor_id,archived FROM page_studio_cms_objects WHERE kind=\'record\'')).rows).toEqual([{ actor_id: `published:${f.claim.admission.execution.invocationId}`, archived: false }])
      expect((await observer.query('SELECT actor_role FROM page_studio_audit_events WHERE action=\'public-action.commit\'')).rows).toEqual([{ actor_role: 'published-form' }])
      expect((await observer.query('SELECT current_application_id,current_content_id FROM page_studio_cms_scopes')).rows).toEqual(before)
      expect((await observer.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows).toEqual(checkpoints)
      request.env.PAGE_STUDIO_CONTENT_ROUTER = {}
      expect(await completePublishedFormAction(f.body, request.env, f.deps)).toEqual({ ...receipt, duplicate: true })
      expect(f.prepare).toHaveBeenCalledTimes(1)
    })
    it('finishes an empty public effect plan without a D1 preparation', async () => {
      const f = await publicEffects([])
      expect(await completePublishedFormAction(f.body, request.env, f.deps)).toMatchObject({ state: 'received', duplicate: false })
      expect(f.prepare).not.toHaveBeenCalled()
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
    })
    it('rolls back public records and the final receipt if the audit insert fails, then retries the same preparation', async () => {
      const f = await publicEffects()
      await observer.query(`CREATE FUNCTION reject_public_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='public-action.commit' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_public_audit BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION reject_public_audit()`)
      await expect(completePublishedFormAction(f.body, request.env, f.deps)).rejects.toThrow('injected audit failure')
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
      expect((await observer.query('SELECT * FROM page_studio_cms_objects WHERE kind=\'record\'')).rows).toHaveLength(0)
      expect((await observer.query('SELECT state,final_receipt FROM page_studio_public_action_invocations')).rows).toEqual([{ state: 'result_ready', final_receipt: null }])
      expect(f.operations.size).toBe(1)
      await observer.query('DROP TRIGGER reject_public_audit ON page_studio_audit_events')
      expect(await completePublishedFormAction(f.body, request.env, f.deps)).toMatchObject({ state: 'received' })
      expect(f.operations.size).toBe(1)
    })
    it.each(['mutated-object', 'revoked-package', 'changed-target'] as const)('leaves public prepared records invisible after %s', async (mode) => {
      const f = await publicEffects()
      const read = f.readObjects.getMockImplementation()!
      let checked = false
      f.readObjects.mockImplementation(async (input) => {
        const result = await read(input)
        if (input.pins.some(pin => f.operations.has(pin.operationId))) {
          checked = true
          if (mode === 'mutated-object') return result.map(value => ({ ...(value as object), actorId: 'forged-publisher' }))
          if (mode === 'revoked-package') await observer.query(`UPDATE page_studio_entitlements SET plan_metadata='{"builder":{"collectionSchemas":true}}'`)
          if (mode === 'changed-target') Object.assign(f.router, { readManagedCmsTarget: async () => ({}) })
        }
        return result
      })
      await expect(completePublishedFormAction(f.body, request.env, f.deps)).rejects.toThrow()
      expect(checked).toBe(true)
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
      expect((await observer.query('SELECT state,final_receipt FROM page_studio_public_action_invocations')).rows).toEqual([{ state: 'result_ready', final_receipt: null }])
    })
    it('rejects an unapproved public update effect before preparing records', async () => {
      const f = await publicEffects([{ type: 'update', collectionId: 'fleet', recordId: 'existing', expectedRevision: 1, values: { title: 'Overwrite' } }])
      await expect(completePublishedFormAction(f.body, request.env, f.deps)).rejects.toThrow()
      expect(f.prepare).not.toHaveBeenCalled()
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
    })
    it('recovers a lost public preparation acknowledgement without duplicating or replacing its objects', async () => {
      const f = await publicEffects(), prepare = f.prepare.getMockImplementation()!
      let lost = false
      f.prepare.mockImplementation(async (input) => {
        const value = await prepare(input)
        if (!lost) {
          lost = true
          throw new Error('lost preparation acknowledgement')
        }
        return value
      })
      await expect(completePublishedFormAction(f.body, request.env, f.deps)).rejects.toThrow('lost preparation acknowledgement')
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
      expect(f.operations.size).toBe(1)
      const originalPreparation = structuredClone([...f.operations.values()][0])
      expect(await completePublishedFormAction(f.body, request.env, f.deps)).toMatchObject({ state: 'received', duplicate: false })
      expect([...f.operations.values()]).toEqual([originalPreparation])
    })
    it('never overwrites a record created by an earlier public invocation', async () => {
      const f = await publicEffects()
      await completePublishedFormAction(f.body, request.env, f.deps)
      const originalHeads = (await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows
      const next = { ...f.body, intentId: randomUUID() }
      const claim = await admitPublishedFormAction(next, request.env, { ...f.deps, fetch: f.fetch })
      f.texts.set(await builderActionResultKey(claim.admission.execution), collectionCanonical({ formatVersion: 1, execution: claim.admission.execution, result: { status: 'ok', json: collectionCanonical({ version: 1, commands: [{ type: 'create', collectionId: 'fleet', recordId: 'new_enquiry', expectedRevision: 0, values: { title: 'Replacement' } }], result: null }) } }))
      await acknowledgePublishedFormAction(next, request.env, f.deps)
      await expect(completePublishedFormAction(next, request.env, f.deps)).rejects.toThrow()
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toEqual(originalHeads)
      expect(f.prepare).toHaveBeenCalledTimes(1)
    })
    it('serializes simultaneous public completion into one native record/audit/receipt', async () => {
      const f = await publicEffects()
      const results = await Promise.all([0, 1].map(async () => completePublishedFormAction(f.body, request.env, { runTransaction: transactionFor(await connect()) })))
      expect(results.filter(result => !result.duplicate)).toHaveLength(1)
      expect(new Set(results.map(result => result.submissionId)).size).toBe(1)
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
      expect((await observer.query('SELECT * FROM page_studio_audit_events WHERE action=\'public-action.commit\'')).rows).toHaveLength(1)
    })
    it.runIf(Boolean(process.env.PAGE_STUDIO_ACTION_TEST_ROOT))('commits actual public D1 prepared records after restart and a lost preparation response', async () => {
      const f = await publicEffects()
      const physical = await createPublicCmsFixture(process.env.PAGE_STUDIO_ACTION_TEST_ROOT!, await f.original.readManagedCmsFreeze!({ scope } as never), await f.original.readManagedCmsOperation!({ scope } as never) as { request: unknown, receipt: unknown })
      try {
        const prepare = physical.router.prepareManagedCmsOperation
        let lost = false
        request.env.PAGE_STUDIO_CONTENT_ROUTER = { ...physical.router, prepareManagedCmsOperation: async (input: unknown) => {
          const receipt = await prepare(input)
          if (!lost) {
            lost = true
            throw new Error('lost D1 preparation response')
          }
          return receipt
        } }
        await expect(completePublishedFormAction(f.body, request.env, f.deps)).rejects.toThrow('lost D1 preparation response')
        expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
        await physical.restart()
        expect(await recoverPublishedFormAction(await recoveryBody(f.body), request.env, f.deps)).toMatchObject({ state: 'received', duplicate: false })
        const object = (await observer.query('SELECT * FROM page_studio_cms_objects WHERE kind=\'record\'')).rows[0]
        const stored = await physical.router.readManagedCmsObjects({ scope, pins: [object.storage_pin] })
        expect(stored).toMatchObject([{ actorId: `published:${f.claim.admission.execution.invocationId}`, body: { values: { title: 'New enquiry' }, revision: 1, archived: false } }])
        expect(await completePublishedFormAction(f.body, request.env, f.deps)).toMatchObject({ state: 'received', duplicate: true })
        expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
      } finally { await physical.dispose() }
    }, 60000)
    it('allows only one of two public invocations creating the same record to commit', async () => {
      const f = await publicEffects(), next = { ...f.body, intentId: randomUUID() }
      const claim = await admitPublishedFormAction(next, request.env, { ...f.deps, fetch: f.fetch })
      const previous = JSON.parse(f.texts.get(await builderActionResultKey(f.claim.admission.execution))!)
      f.texts.set(await builderActionResultKey(claim.admission.execution), collectionCanonical({ ...previous, execution: claim.admission.execution }))
      await acknowledgePublishedFormAction(next, request.env, f.deps)
      const results = await Promise.allSettled([f.body, next].map(async body => completePublishedFormAction(body, request.env, { runTransaction: transactionFor(await connect()) })))
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
      expect((await observer.query(`SELECT state FROM page_studio_public_action_invocations ORDER BY state`)).rows).toEqual([{ state: 'committed' }, { state: 'result_ready' }])
    })
    it('rolls back the public CMS commit and audit when the final receipt update fails', async () => {
      const f = await publicEffects()
      await observer.query(`CREATE FUNCTION reject_public_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='committed' THEN RAISE EXCEPTION 'injected receipt failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_public_receipt BEFORE UPDATE ON page_studio_public_action_invocations FOR EACH ROW EXECUTE FUNCTION reject_public_receipt()`)
      await expect(completePublishedFormAction(f.body, request.env, f.deps)).rejects.toThrow('injected receipt failure')
      expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
      expect((await observer.query(`SELECT * FROM page_studio_cms_commits WHERE operation_id LIKE 'public_%'`)).rows).toHaveLength(0)
      expect((await observer.query(`SELECT * FROM page_studio_audit_events WHERE action='public-action.commit'`)).rows).toHaveLength(0)
      expect((await observer.query('SELECT state,final_receipt FROM page_studio_public_action_invocations')).rows).toEqual([{ state: 'result_ready', final_receipt: null }])
    })
    it('rejects a generated feature build before Worker execution when its shared allowance is exhausted', async () => {
      const f = await approvedBuild()
      await observer.query('UPDATE page_studio_entitlements SET monthly_build_limit=0')
      await expect(coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)).rejects.toMatchObject({ code: 'BUILD_LIMIT_REACHED', statusCode: 429 })
      expect(f.services.buildSealed).not.toHaveBeenCalled()
      expect((await observer.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
      expect((await observer.query('SELECT * FROM page_studio_builds')).rows).toHaveLength(0)
    })
    it('atomically installs exact immutable build seal and replays without duplicating audit', async () => {
      const f = await approvedBuild()
      await observer.query('UPDATE page_studio_entitlements SET monthly_build_limit=1')
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
      expect((await observer.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
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
    it('reuses a historical immutable build without charging its existing usage again', async () => {
      const f = await approvedBuild()
      await observer.query('UPDATE page_studio_entitlements SET monthly_build_limit=1')
      const first = await coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      // Simulate a build made before the admission ledger was introduced.
      await observer.query('DELETE FROM page_studio_build_admissions')
      await expect(coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)).resolves.toEqual(first)
      const usage = (await observer.query('SELECT admission.created_at=build.created_at AS retained FROM page_studio_build_admissions admission JOIN page_studio_builds build ON build.id=admission.resource_id')).rows
      expect(usage).toEqual([{ retained: true }])
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

    for (const delivery of ['static', 'runtime'] as const) it.each(['current', 'revoked-during-read', 'record-head-removed', 'wrong-page', 'draft', 'hidden', 'archived', 'corrupt-bundle', 'oversize-stream'] as const)(`${delivery} projects sealed public page and current native record heads: %s`, async (mode) => {
      const runtime = delivery === 'runtime' ? await publishedRuntime() : null
      const f = runtime ?? await approvedBuild(true)
      const build = runtime ? null : await coordinateSealedFeatureBuild(f.input, f.principal, f.services, f.deps)
      const release = runtime?.release ?? await coordinateFeatureActivation({ actorId: request.actor.actorId, buildId: build!.buildId, environment: 'production', expectedActiveReleaseId: null, hostname: 'fixture.example.com', idempotencyKey: 'public_page', scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } }, f.principal, f.services, f.deps)
      const seal = runtime ? { recovery_key: runtime.seal.identity.reference.recovery.key, recovery_bytes: runtime.seal.identity.reference.recovery.bytes } : (await observer.query('SELECT * FROM page_studio_release_feature_seals')).rows[0]
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
          if (mode === 'revoked-during-read') await observer.query(`UPDATE ${delivery === 'runtime' ? 'page_studio_runtime_feature_activations' : 'page_studio_release_feature_activations'} SET state='revoked',revoked_at=clock_timestamp()`)
          return { pin: recordPin, body: recordBody, actorId: request.actor.actorId, createdAt: new Date(inserted.created_at).toISOString(), schema: schemaObject.storage_pin, head: false }
        }))
      }
      await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      const input = { ...(runtime?.publishedInput ?? { hostname: 'fixture.example.com', releaseId: release.releaseId, buildId: build!.buildId, versionDigest: build!.versionDigest, manifestDigest: build!.manifestDigest, sealDigest: seal.seal_digest }), pageRoute: mode === 'wrong-page' ? '/private' : ['draft', 'hidden', 'archived'].includes(mode) ? `/${mode}-page` : f.manifest.pages[0]!.route }
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
      const result = (delivery === 'runtime' ? readPublishedRuntimeFeaturePage : readPublishedFeaturePage)(input, request.env, f.deps)
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
      const stagingHost = `preview-${scope.siteId.replaceAll('-', '')}.xeroflow.io`
      await observer.query(`INSERT INTO page_studio_staging_sites(tenant_id,client_id,site_id,hostname,host_state,provider_domain_id,provider_verified_at) VALUES($1,$2,$3,$4,'ready','cf-staging',NOW())`, [scope.tenantId, scope.clientId, scope.siteId, stagingHost])
      const staging = await coordinateFeatureActivation({ ...base, environment: 'staging', hostname: stagingHost, idempotencyKey: 'publish_stage' }, f.principal, f.services, f.deps)
      const input = (hostname: string, releaseId: string) => ({ hostname, releaseId, buildId: build.buildId, versionDigest: build.versionDigest, manifestDigest: build.manifestDigest, sealDigest: seal.seal_digest, pageRoute: f.manifest.pages[0]!.route })
      expect((await readPublishedFeaturePage(input(stagingHost, staging.releaseId), request.env, f.deps)).release.releaseId).toBe(staging.releaseId)
      const prodEnv = { ...request.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }
      expect((await readPublishedFeaturePage(input('production.example.com', production.releaseId), prodEnv, f.deps)).release.releaseId).toBe(production.releaseId)
      expect((await observer.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(staging.releaseId)
      expect((await readPublishedFeaturePage(input(stagingHost, staging.releaseId), prodEnv, f.deps)).release.releaseId).toBe(staging.releaseId)
      await expect(readPublishedFeaturePage(input('production.example.com', production.releaseId), request.env, f.deps)).rejects.toThrow()
      const newerRelease = (await observer.query(`INSERT INTO page_studio_releases(tenant_id,client_id,site_id,build_id,environment,normalized_hostname,idempotency_key) VALUES($1,$2,$3,$4,'production','production.example.com','newer_publication') RETURNING id`, [scope.tenantId, scope.clientId, scope.siteId, build.buildId])).rows[0].id
      await observer.query('UPDATE page_studio_release_pointers SET active_release_id=$1,pointer_version=pointer_version+1 WHERE environment=\'production\'', [newerRelease])
      const before = (await observer.query('SELECT * FROM page_studio_release_pointers ORDER BY environment')).rows
      await expect(rollbackPageStudioRelease({ actorId: request.actor.actorId, environment: 'production', hostname: 'production.example.com', idempotencyKey: 'rollback_feature', scope: base.scope, targetReleaseId: production.releaseId, expectedActiveReleaseId: newerRelease }, f.deps)).rejects.toMatchObject({ statusCode: 409 })
      expect((await observer.query('SELECT * FROM page_studio_release_pointers ORDER BY environment')).rows).toEqual(before)
    })
  }
)
