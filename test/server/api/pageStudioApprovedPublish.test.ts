import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { buildApprovedPageStudioVersion } from '~~/server/utils/pageStudio/builds'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  queryOne: vi.fn(),
  loadCheckpoint: vi.fn(),
  attachMetadata: vi.fn(),
  localFetch: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/pageStudio/releaseCheckpoint', () => ({
  loadApprovedPageStudioReleaseCheckpoint: mocks.loadCheckpoint,
  attachPageStudioReleaseMetadataToBuild: mocks.attachMetadata,
  PageStudioReleaseCheckpointError: class extends Error {
    constructor(readonly code: string, message: string, readonly statusCode = 502) { super(message) }
  }
}))

const siteId = '10000000-0000-4000-8000-000000000104'
const versionId = '20000000-0000-4000-8000-000000000104'
const scope = { tenantId: 'selected_tenant', clientId: 'client_selected', siteId }
const checkpoint = { checkpointId: 'checkpoint_approved', digest: 'a'.repeat(64), manifest: { id: siteId }, releaseMetadata: { forms: [] } }
const bucket = { get: vi.fn() }
const build = {
  buildId: 'build_approved', artifactPrefix: 'artifacts', manifestDigest: 'b'.repeat(64),
  manifestKey: 'artifacts/release-manifest.json', validationKey: 'artifacts/validation-report.json',
  versionDigest: checkpoint.digest, scope
} satisfies Awaited<ReturnType<typeof buildApprovedPageStudioVersion>>

function event() {
  return {
    context: { cloudflare: { env: { PAGE_STUDIO_CHECKPOINTS: bucket } } },
    params: { siteId, versionId },
    headers: { 'cookie': 'session=unit-test', 'idempotency-key': 'publish_unit_test' },
    body: { environment: 'production', hostname: 'demo.xeroflow.io', expectedActiveReleaseId: 'release_previous' },
    $fetch: mocks.localFetch
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getRouterParam', (value: ReturnType<typeof event>, key: 'siteId' | 'versionId') => value.params[key])
  vi.stubGlobal('readBody', async (value: ReturnType<typeof event>) => value.body)
  vi.stubGlobal('getHeader', (value: ReturnType<typeof event>, key: keyof ReturnType<typeof event>['headers']) => value.headers[key])
  vi.stubGlobal('createError', (value: Record<string, unknown>) => Object.assign(new Error(String(value.statusMessage)), value))
  mocks.access.mockResolvedValue({ tenantId: scope.tenantId, user: { id: 'owner_without_tenant_property', role: 'owner' } })
  mocks.queryOne.mockResolvedValue({ tenant_id: scope.tenantId, client_id: scope.clientId, site_id: siteId })
  mocks.loadCheckpoint.mockResolvedValue(checkpoint)
  mocks.localFetch.mockResolvedValueOnce({ build }).mockResolvedValueOnce({ release: { id: 'release_next' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('approved Page Studio publication', () => {
  it('uses the authenticated selected organization when the owner has no tenant property', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/publish.post')
    const input = event()
    await expect(handler(input as never)).resolves.toMatchObject({ build, release: { id: 'release_next' }, checkpoint: { id: checkpoint.checkpointId } })
    expect(mocks.access).toHaveBeenCalledWith(input, 'PAGE_STUDIO_PUBLISH')
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id = $1'), [scope.tenantId, siteId])
    expect(mocks.loadCheckpoint).toHaveBeenCalledWith({ scope, versionId, bucket })
    expect(mocks.attachMetadata).toHaveBeenCalledWith({ scope, versionId, buildId: 'build_approved', digest: checkpoint.digest, releaseMetadata: checkpoint.releaseMetadata })
    expect(mocks.localFetch).toHaveBeenNthCalledWith(1, expect.stringContaining(`/versions/${versionId}/builds`), expect.objectContaining({
      headers: { 'cookie': 'session=unit-test', 'idempotency-key': 'publish_unit_test:build' },
      body: { manifest: checkpoint.manifest, assets: [] }
    }))
    expect(mocks.localFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/releases/activate'), expect.objectContaining({
      body: { buildId: 'build_approved', environment: 'production', hostname: 'demo.xeroflow.io', expectedActiveReleaseId: 'release_previous' }
    }))
  })

  it.each([{}, { id: 'build_legacy' }, { buildId: 23 }])('rejects malformed build pointers before metadata or activation: %j', async (invalidBuild) => {
    mocks.localFetch.mockReset().mockResolvedValue({ build: invalidBuild })
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/publish.post')
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 502, data: { code: 'BUILD_RESPONSE_INVALID' } })
    expect(mocks.attachMetadata).not.toHaveBeenCalled()
    expect(mocks.localFetch).toHaveBeenCalledTimes(1)
  })

  it.each([403, 400])('stops before storage or dispatch when access resolution rejects with %s', async (statusCode) => {
    mocks.access.mockRejectedValue(Object.assign(new Error('Access denied'), { statusCode }))
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/publish.post')
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode })
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.loadCheckpoint).not.toHaveBeenCalled()
    expect(mocks.localFetch).not.toHaveBeenCalled()
  })

  it('does not publish a site outside the selected organization', async () => {
    mocks.queryOne.mockResolvedValue(null)
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/publish.post')
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.loadCheckpoint).not.toHaveBeenCalled()
    expect(mocks.localFetch).not.toHaveBeenCalled()
  })

  it('does not build or activate when the immutable approval check fails', async () => {
    mocks.loadCheckpoint.mockRejectedValue(new Error('Version not approved'))
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/publish.post')
    await expect(handler(event() as never)).rejects.toThrow('Version not approved')
    expect(mocks.attachMetadata).not.toHaveBeenCalled()
    expect(mocks.localFetch).not.toHaveBeenCalled()
  })
})
