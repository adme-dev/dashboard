import {
  createError,
  eventHandler,
  setResponseHeader,
  type H3Event
} from 'h3'
import { z } from 'zod'

import {
  CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  crmSearchAcceptedProtocolVersions,
  type CrmSearchPagesProtocolHealth
} from '~~/shared/crmSearchIndexProtocol'

const gitShaPattern = /^[a-f0-9]{40}$/
const digestPattern = /^sha256:[a-f0-9]{64}$/
const protocolVersionPattern = /^[1-9][0-9]{0,4}$/
const healthEvidenceSchema = z.object({
  deployedSha: z.string().regex(gitShaPattern),
  expectedDeployedSha: z.string().regex(gitShaPattern),
  pagesArtifactDigest: z.string().regex(digestPattern),
  expectedPagesArtifactDigest: z.string().regex(digestPattern),
  bindingManifestDigest: z.string().regex(digestPattern),
  expectedBindingManifestDigest: z.string().regex(digestPattern),
  expectedWorkerSha: z.string().regex(gitShaPattern),
  expectedWorkerArtifactDigest: z.string().regex(digestPattern),
  expectedWorkerBindingManifestDigest: z.string().regex(digestPattern),
  expectedWorkerProtocolVersion: z.number().int().safe()
}).strict()

export interface CrmSearchProtocolHealthEvidence {
  deployedSha: string
  expectedDeployedSha: string
  pagesArtifactDigest: string
  expectedPagesArtifactDigest: string
  bindingManifestDigest: string
  expectedBindingManifestDigest: string
  expectedWorkerSha: string
  expectedWorkerArtifactDigest: string
  expectedWorkerBindingManifestDigest: string
  expectedWorkerProtocolVersion: number
}

export interface CrmSearchProtocolHealthDependencies {
  getEvidence(event: H3Event): CrmSearchProtocolHealthEvidence
  setResponseHeader(event: H3Event, name: string, value: string): void
}

function unready(): never {
  throw new Error('crm_search_protocol_health_unready')
}

export function evaluateCrmSearchProtocolHealth(
  evidence: CrmSearchProtocolHealthEvidence
): CrmSearchPagesProtocolHealth {
  const parsed = healthEvidenceSchema.safeParse(evidence)
  if (!parsed.success) unready()
  const valid = parsed.data
  const acceptedProtocolVersions = crmSearchAcceptedProtocolVersions(
    CRM_SEARCH_INDEX_PROTOCOL_VERSION
  )
  if (
    valid.deployedSha !== valid.expectedDeployedSha
    || valid.pagesArtifactDigest !== valid.expectedPagesArtifactDigest
    || valid.bindingManifestDigest !== valid.expectedBindingManifestDigest
    || valid.expectedWorkerSha !== valid.expectedDeployedSha
    || valid.expectedWorkerBindingManifestDigest !== valid.expectedBindingManifestDigest
    || !acceptedProtocolVersions.includes(valid.expectedWorkerProtocolVersion)
  ) unready()

  return {
    status: 'ready',
    component: 'crm_search_pages',
    protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
    acceptedProtocolVersions,
    deployedSha: valid.deployedSha,
    artifactDigest: valid.pagesArtifactDigest,
    bindingManifestDigest: valid.bindingManifestDigest,
    expectedWorker: {
      deployedSha: valid.expectedWorkerSha,
      artifactDigest: valid.expectedWorkerArtifactDigest,
      bindingManifestDigest: valid.expectedWorkerBindingManifestDigest,
      emittedProtocolVersion: valid.expectedWorkerProtocolVersion
    }
  }
}

function runtimeString(event: H3Event, name: string): string {
  const runtimeValue = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.[name]
  if (runtimeValue !== undefined) {
    return typeof runtimeValue === 'string' ? runtimeValue : ''
  }
  return process.env[name] ?? ''
}

function runtimeProtocolVersion(event: H3Event): number {
  const raw = runtimeString(event, 'CRM_SEARCH_EXPECTED_WORKER_PROTOCOL_VERSION')
  if (!protocolVersionPattern.test(raw)) return Number.NaN
  const value = Number(raw)
  return Number.isSafeInteger(value) && value <= 65_535 ? value : Number.NaN
}

const defaultDependencies: CrmSearchProtocolHealthDependencies = {
  getEvidence(event) {
    return {
      deployedSha: runtimeString(event, 'CF_PAGES_COMMIT_SHA'),
      expectedDeployedSha: runtimeString(event, 'CRM_SEARCH_IMPLEMENTATION_SHA'),
      pagesArtifactDigest: runtimeString(event, 'CRM_SEARCH_PAGES_ARTIFACT_DIGEST'),
      expectedPagesArtifactDigest: runtimeString(
        event,
        'CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST'
      ),
      bindingManifestDigest: runtimeString(event, 'CRM_SEARCH_BINDING_MANIFEST_DIGEST'),
      expectedBindingManifestDigest: runtimeString(
        event,
        'CRM_SEARCH_EXPECTED_BINDING_MANIFEST_DIGEST'
      ),
      expectedWorkerSha: runtimeString(event, 'CRM_SEARCH_EXPECTED_WORKER_SHA'),
      expectedWorkerArtifactDigest: runtimeString(
        event,
        'CRM_SEARCH_EXPECTED_WORKER_ARTIFACT_DIGEST'
      ),
      expectedWorkerBindingManifestDigest: runtimeString(
        event,
        'CRM_SEARCH_EXPECTED_WORKER_BINDING_MANIFEST_DIGEST'
      ),
      expectedWorkerProtocolVersion: runtimeProtocolVersion(event)
    }
  },
  setResponseHeader
}

export function createCrmSearchProtocolHealthGetHandler(
  overrides: Partial<CrmSearchProtocolHealthDependencies> = {}
) {
  const dependencies: CrmSearchProtocolHealthDependencies = {
    ...defaultDependencies,
    ...overrides
  }
  return async (event: H3Event): Promise<CrmSearchPagesProtocolHealth> => {
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return evaluateCrmSearchProtocolHealth(dependencies.getEvidence(event))
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: 'crm_search_protocol_health_unready'
      })
    }
  }
}

export default eventHandler(createCrmSearchProtocolHealthGetHandler())
