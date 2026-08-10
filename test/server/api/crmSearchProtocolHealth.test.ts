import { describe, expect, it, vi } from 'vitest'

import {
  createCrmSearchProtocolHealthGetHandler,
  evaluateCrmSearchProtocolHealth,
  type CrmSearchProtocolHealthEvidence
} from '../../../server/api/internal/crm-search/health.get'

const sha = 'a'.repeat(40)
const pagesArtifact = `sha256:${'b'.repeat(64)}`
const workerArtifact = `sha256:${'c'.repeat(64)}`
const bindingManifest = `sha256:${'d'.repeat(64)}`

function evidence(overrides: Partial<CrmSearchProtocolHealthEvidence> = {}): CrmSearchProtocolHealthEvidence {
  return {
    deployedSha: sha,
    expectedDeployedSha: sha,
    pagesArtifactDigest: pagesArtifact,
    expectedPagesArtifactDigest: pagesArtifact,
    bindingManifestDigest: bindingManifest,
    expectedBindingManifestDigest: bindingManifest,
    expectedWorkerSha: sha,
    expectedWorkerArtifactDigest: workerArtifact,
    expectedWorkerBindingManifestDigest: bindingManifest,
    expectedWorkerProtocolVersion: 1,
    ...overrides
  }
}

describe('GET /api/internal/crm-search/health', () => {
  it('advertises exact Pages evidence and the compatible expected Worker contract', () => {
    expect(evaluateCrmSearchProtocolHealth(evidence())).toEqual({
      status: 'ready',
      component: 'crm_search_pages',
      protocolVersion: 1,
      acceptedProtocolVersions: [1],
      deployedSha: sha,
      artifactDigest: pagesArtifact,
      bindingManifestDigest: bindingManifest,
      expectedWorker: {
        deployedSha: sha,
        artifactDigest: workerArtifact,
        bindingManifestDigest: bindingManifest,
        emittedProtocolVersion: 1
      }
    })
  })

  it.each([
    ['missing deployed SHA', { deployedSha: '' }],
    ['wrong deployed SHA', { deployedSha: 'e'.repeat(40) }],
    ['artifact drift', { pagesArtifactDigest: `sha256:${'e'.repeat(64)}` }],
    ['binding drift', { bindingManifestDigest: `sha256:${'e'.repeat(64)}` }],
    ['Worker SHA mismatch', { expectedWorkerSha: 'e'.repeat(40) }],
    ['protocol incompatibility', { expectedWorkerProtocolVersion: 2 }]
  ])('fails closed on %s', (_label, patch) => {
    expect(() => evaluateCrmSearchProtocolHealth(evidence(patch))).toThrow(
      'crm_search_protocol_health_unready'
    )
  })

  it('rejects runtime evidence values that only become valid through coercion', () => {
    const coercibleSha = { toString: () => sha }
    expect(() => evaluateCrmSearchProtocolHealth({
      ...evidence(),
      deployedSha: coercibleSha,
      expectedDeployedSha: coercibleSha,
      expectedWorkerSha: coercibleSha
    } as never)).toThrow('crm_search_protocol_health_unready')
  })

  it('rejects a noncanonical runtime protocol representation', async () => {
    const handler = createCrmSearchProtocolHealthGetHandler({
      setResponseHeader: vi.fn()
    })
    const runtimeEvidence = {
      CF_PAGES_COMMIT_SHA: sha,
      CRM_SEARCH_IMPLEMENTATION_SHA: sha,
      CRM_SEARCH_PAGES_ARTIFACT_DIGEST: pagesArtifact,
      CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST: pagesArtifact,
      CRM_SEARCH_BINDING_MANIFEST_DIGEST: bindingManifest,
      CRM_SEARCH_EXPECTED_BINDING_MANIFEST_DIGEST: bindingManifest,
      CRM_SEARCH_EXPECTED_WORKER_SHA: sha,
      CRM_SEARCH_EXPECTED_WORKER_ARTIFACT_DIGEST: workerArtifact,
      CRM_SEARCH_EXPECTED_WORKER_BINDING_MANIFEST_DIGEST: bindingManifest,
      CRM_SEARCH_EXPECTED_WORKER_PROTOCOL_VERSION: '01'
    }

    await expect(handler({
      context: { cloudflare: { env: runtimeEvidence } }
    } as never)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('sets no-store and returns the validated release contract without database/provider work', async () => {
    const setResponseHeader = vi.fn()
    const getEvidence = vi.fn(() => evidence())
    const handler = createCrmSearchProtocolHealthGetHandler({
      getEvidence,
      setResponseHeader
    })

    await expect(handler({ context: {} } as never)).resolves.toMatchObject({ status: 'ready' })
    expect(setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      'Cache-Control',
      'private, no-store'
    )
    expect(getEvidence).toHaveBeenCalledOnce()
  })

  it('returns 503 rather than partial health evidence when any proof is absent', async () => {
    const handler = createCrmSearchProtocolHealthGetHandler({
      getEvidence: () => evidence({ expectedWorkerArtifactDigest: '' }),
      setResponseHeader: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'crm_search_protocol_health_unready'
    })
  })
})
