import { describe, expect, it, vi } from 'vitest'

import {
  getPageStudioBuildPointer,
  getPageStudioReleasePointer
} from '~~/server/utils/pageStudio/publishing'

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const digest = 'a'.repeat(64)
const buildId = `build_${digest.slice(0, 32)}`
const artifactPrefix
  = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${digest}`
const buildRow = {
  artifact_prefix: artifactPrefix,
  build_id: buildId,
  manifest_digest: 'b'.repeat(64),
  manifest_key: `${artifactPrefix}/release-manifest.json`,
  version_digest: digest
}

describe('Page Studio publishing catalog', () => {
  it('returns an environment-neutral immutable build pointer in the exact scope', async () => {
    const queryOne = vi.fn().mockResolvedValue(buildRow)

    await expect(getPageStudioBuildPointer(scope, buildId, { queryOne })).resolves.toEqual({
      artifactPrefix,
      buildId,
      manifestDigest: buildRow.manifest_digest,
      manifestKey: buildRow.manifest_key,
      scope,
      versionDigest: digest
    })
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining('build.state = \'succeeded\''),
      [scope.tenantId, scope.clientId, scope.siteId, buildId]
    )
  })

  it('returns one historical release pointer only from the same scoped succeeded build', async () => {
    const releaseId = '33333333-3333-4333-8333-333333333333'
    const queryOne = vi.fn().mockResolvedValue({
      ...buildRow,
      environment: 'staging',
      release_id: releaseId
    })

    await expect(getPageStudioReleasePointer(scope, releaseId, { queryOne })).resolves.toEqual({
      artifactPrefix,
      buildId,
      environment: 'staging',
      manifestDigest: buildRow.manifest_digest,
      manifestKey: buildRow.manifest_key,
      releaseId,
      scope,
      versionDigest: digest
    })
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining('build.state = \'succeeded\''),
      [scope.tenantId, scope.clientId, scope.siteId, releaseId]
    )
  })

  it('fails closed when persisted artifact metadata leaves its deterministic scope', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      ...buildRow,
      artifact_prefix: 'tenants/other/builds/outside'
    })

    await expect(getPageStudioBuildPointer(scope, buildId, { queryOne })).rejects.toMatchObject({
      code: 'RELEASE_RECORD_INVALID',
      statusCode: 500
    })
  })
})
