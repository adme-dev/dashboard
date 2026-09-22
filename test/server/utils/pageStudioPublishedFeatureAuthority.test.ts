import { beforeEach, expect, it, vi } from 'vitest'
import { readPublishedFeatureSnapshot, withPublishedFeatureAuthority, withPublishedActionAuthority } from '~~/server/utils/pageStudio/publishedFeatureAuthority'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import golden from '../../fixtures/pageStudioCmsGraph.json'

const mocks = vi.hoisted(() => ({ context: vi.fn(), sole: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/cmsVisibility', async original => ({ ...await original<object>(), lockCmsContext: mocks.context }))
vi.mock('~~/server/utils/pageStudio/cmsGraphCoordinator', () => ({ assertSoleCmsAuthoringScope: mocks.sole }))
const request = { hostname: 'published.example.test', releaseId: '30000000-0000-4000-8000-000000000003', buildId: 'build_test', versionDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), sealDigest: 'c'.repeat(64), pageRoute: '/' }
const scope = golden.base.scope
let rows: Record<string, Record<string, unknown>>, sql: string[]
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_ACTION_RUNTIME_DIGEST: 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e' }
const deps = { runTransaction: async <T>(work: (db: { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<T>) => work({ query: async (statement) => {
  sql.push(statement)
  for (const [table, row] of Object.entries(rows).sort((a, b) => b[0].length - a[0].length)) if (statement.includes(`FROM ${table} `)) return { rows: [structuredClone(row)] }
  return { rows: [] }
} }) }
beforeEach(() => {
  vi.resetAllMocks()
  sql = []
  const identity = { approvalId: 'approval_a', reference: { formatVersion: 1, checkpointDigest: request.versionDigest, sha256: request.sealDigest }, recovery: { key: `builder-recovery/v1/${'d'.repeat(64)}/${request.versionDigest}/${request.sealDigest}.json`, bytes: 100, sha256: request.sealDigest }, application: { id: '50000000-0000-4000-8000-000000000005', digest: golden.base.application.digest }, checkpoint: 'checkpoint_a', generation: golden.base.generation, target: golden.base.target, freezeDigest: golden.base.freezeDigest, runtimeDigest: 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e', contentScope: scope, versionId: 'version_a' }
  rows = {
    page_studio_sites: { id: scope.siteId, tenant_id: scope.tenantId, client_id: scope.clientId, entitlement_id: 'entitlement', status: 'active', current_release_id: request.releaseId },
    page_studio_entitlements: { id: 'entitlement', tenant_id: scope.tenantId, client_id: scope.clientId, status: 'active', effective: true, capacity: true, plan_metadata: { builder: { collectionSchemas: true } } },
    agency_clients: { id: scope.clientId, is_active: true },
    page_studio_release_pointers: { tenant_id: scope.tenantId, client_id: scope.clientId, site_id: scope.siteId, environment: 'production', normalized_hostname: request.hostname, active_release_id: request.releaseId, pointer_version: '2' },
    page_studio_releases: { id: request.releaseId, tenant_id: scope.tenantId, client_id: scope.clientId, site_id: scope.siteId, build_id: request.buildId, environment: 'production', normalized_hostname: request.hostname },
    page_studio_builds: { id: request.buildId, tenant_id: scope.tenantId, client_id: scope.clientId, site_id: scope.siteId, version_id: identity.versionId, state: 'succeeded', version_digest: request.versionDigest, release_manifest_digest: request.manifestDigest, release_metadata: { featureSeal: identity.reference } },
    page_studio_release_feature_seals: { scope_key: contentScopeKey(scope), build_id: request.buildId, tenant_id: scope.tenantId, client_id: scope.clientId, site_id: scope.siteId, version_id: identity.versionId, version_digest: request.versionDigest, manifest_digest: request.manifestDigest, seal_digest: request.sealDigest, recovery_key: identity.recovery.key, recovery_bytes: 100, identity },
    page_studio_release_feature_activations: { id: '40000000-0000-4000-8000-000000000004', scope_key: contentScopeKey(scope), build_id: request.buildId, environment: 'production', hostname: request.hostname, pointer_version: '2', release_id: request.releaseId, seal_digest: request.sealDigest, state: 'enabled', revoked_at: null, identity: { request: { scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId }, environment: 'production', hostname: request.hostname, buildId: request.buildId }, sealDigest: request.sealDigest, publisher: { userId: 'irrelevant' } } }
  }
  mocks.context.mockResolvedValue({ state: { active_generation: identity.generation, target: identity.target, freeze_digest: identity.freezeDigest } })
})
it('uses the exact active production release epoch without querying publisher login', async () => {
  const snapshot = await readPublishedFeatureSnapshot(request, env, deps)
  expect(snapshot.release.pointerVersion).toBe(2)
  expect(snapshot.contentScope).toEqual(scope)
  expect(sql.join('\n')).not.toMatch(/login_sessions|team_members|site_memberships/)
  expect(sql.findIndex(statement => statement.includes('FOR NO KEY UPDATE'))).toBeLessThan(sql.findIndex(statement => statement.includes('FOR SHARE NOWAIT')))
})
it.each(['activation', 'pointer', 'client', 'site', 'entitlement', 'capacity', 'marker', 'runtime'])('rejects revoked or mismatched %s authority', async (mode) => {
  if (mode === 'activation') rows.page_studio_release_feature_activations!.state = 'revoked'
  if (mode === 'pointer') rows.page_studio_release_feature_activations!.pointer_version = '1'
  if (mode === 'client') rows.agency_clients!.is_active = false
  if (mode === 'site') rows.page_studio_sites!.status = 'archived'
  if (mode === 'entitlement') rows.page_studio_entitlements!.effective = false
  if (mode === 'capacity') rows.page_studio_entitlements!.capacity = false
  if (mode === 'marker') rows.page_studio_builds!.release_metadata = {}
  const host = mode === 'runtime' ? { ...env, PAGE_STUDIO_ACTION_RUNTIME_DIGEST: 'f'.repeat(64) } : env
  await expect(readPublishedFeatureSnapshot(request, host, deps)).rejects.toThrow()
})
it('checks current authority again after internal SQL work', async () => {
  const snapshot = await readPublishedFeatureSnapshot(request, env, deps)
  await expect(withPublishedFeatureAuthority(request, env, snapshot, async () => {
    rows.page_studio_entitlements!.effective = false
  }, deps)).rejects.toThrow()
})

it('takes the shared quota lock before entitlement locks for named action admission', async () => {
  rows.page_studio_entitlements!.plan_metadata = { builder: { collectionSchemas: true, actionExecution: true } }
  await withPublishedActionAuthority(request, env, null, async () => 'admitted', deps)
  const advisory = sql.findIndex(statement => statement.includes('pg_advisory_xact_lock'))
  expect(advisory).toBeGreaterThan(sql.findIndex(statement => statement.includes('FOR NO KEY UPDATE')))
  expect(advisory).toBeLessThan(sql.findIndex(statement => statement.includes('FOR SHARE NOWAIT')))
})
it('denies published action admission without the action execution entitlement', async () => {
  const work = vi.fn()
  await expect(withPublishedActionAuthority(request, env, null, work, deps)).rejects.toThrow()
  expect(work).not.toHaveBeenCalled()
})

it.each([undefined, 'preview', 'staging'])('rejects an absent, unsupported, or mismatched host environment: %s', async (environment) => {
  await expect(readPublishedFeatureSnapshot(request, { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: environment }, deps)).rejects.toThrow()
})
