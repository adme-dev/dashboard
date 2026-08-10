import { z } from 'zod'

import {
  CRM_SEARCH_HEALTH_PATH,
  CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  CRM_SEARCH_QUEUE_MESSAGE_MAX_AGE_SECONDS,
  crmSearchAcceptedProtocolVersions,
  type CrmSearchPagesProtocolHealth
} from '../../../shared/crmSearchIndexProtocol'
import {
  parseCrmSearchServiceKeyring,
  type CrmSearchServiceKeyring
} from '../../../shared/crmSearchIndexSigning'

export const CRM_SEARCH_PAGES_ORIGIN = 'https://agency-dashboard-6cm.pages.dev' as const
export const CRM_SEARCH_PRIMARY_QUEUE_NAME = 'agency-crm-search-index' as const
export const CRM_SEARCH_DEAD_LETTER_QUEUE_NAME = 'agency-crm-search-index-dlq' as const
export const CRM_SEARCH_QUEUE_RETENTION_SECONDS
  = CRM_SEARCH_QUEUE_MESSAGE_MAX_AGE_SECONDS
export const CRM_SEARCH_RESOURCE_READBACK_REVISION
  = 'crm-search-resource-readback-v1' as const
export const CRM_SEARCH_SUPPORTED_QUEUE_PLAN = 'workers_paid' as const

const HEALTH_RESPONSE_MAX_BYTES = 2_048
const HEALTH_REQUEST_TIMEOUT_MS = 5_000
const gitShaPattern = /^[a-f0-9]{40}$/
const digestPattern = /^sha256:[a-f0-9]{64}$/

const pagesHealthSchema = z.object({
  status: z.literal('ready'),
  component: z.literal('crm_search_pages'),
  protocolVersion: z.literal(CRM_SEARCH_INDEX_PROTOCOL_VERSION),
  acceptedProtocolVersions: z.array(z.number().int().safe().min(1).max(65_535))
    .min(1)
    .max(2),
  deployedSha: z.string().regex(gitShaPattern),
  artifactDigest: z.string().regex(digestPattern),
  bindingManifestDigest: z.string().regex(digestPattern),
  expectedWorker: z.object({
    deployedSha: z.string().regex(gitShaPattern),
    artifactDigest: z.string().regex(digestPattern),
    bindingManifestDigest: z.string().regex(digestPattern),
    emittedProtocolVersion: z.number().int().safe().min(1).max(65_535)
  }).strict()
}).strict()

const resourceManifestSchema = z.object({
  revision: z.literal(CRM_SEARCH_RESOURCE_READBACK_REVISION),
  readbackSource: z.literal('cloudflare_api'),
  plan: z.literal(CRM_SEARCH_SUPPORTED_QUEUE_PLAN),
  primary: z.object({
    name: z.literal(CRM_SEARCH_PRIMARY_QUEUE_NAME),
    retentionSeconds: z.literal(CRM_SEARCH_QUEUE_RETENTION_SECONDS)
  }).strict(),
  deadLetter: z.object({
    name: z.literal(CRM_SEARCH_DEAD_LETTER_QUEUE_NAME),
    retentionSeconds: z.literal(CRM_SEARCH_QUEUE_RETENTION_SECONDS)
  }).strict()
}).strict()

const releaseEvidenceSchema = z.object({
  implementationSha: z.string().regex(gitShaPattern),
  workerArtifactDigest: z.string().regex(digestPattern),
  bindingManifestDigest: z.string().regex(digestPattern),
  expectedPagesSha: z.string().regex(gitShaPattern),
  expectedPagesArtifactDigest: z.string().regex(digestPattern),
  expectedPagesBindingManifestDigest: z.string().regex(digestPattern)
}).strict()

export interface CrmSearchConsumerBindings {
  CRM_SEARCH_PAGES_BASE_URL: string
  CRM_SEARCH_SERVICE_KEYRING: string
  CRM_SEARCH_IMPLEMENTATION_SHA: string
  CRM_SEARCH_WORKER_ARTIFACT_DIGEST: string
  CRM_SEARCH_BINDING_MANIFEST_DIGEST: string
  CRM_SEARCH_EXPECTED_PAGES_SHA: string
  CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST: string
  CRM_SEARCH_EXPECTED_PAGES_BINDING_MANIFEST_DIGEST: string
  CRM_SEARCH_RESOURCE_MANIFEST: string
}

export interface CrmSearchConsumerHealthDependencies {
  fetch(request: Request): Promise<Response>
  now(): number
}

export interface CrmSearchConsumerResourceHealth {
  revision: typeof CRM_SEARCH_RESOURCE_READBACK_REVISION
  plan: typeof CRM_SEARCH_SUPPORTED_QUEUE_PLAN
  primaryQueue: typeof CRM_SEARCH_PRIMARY_QUEUE_NAME
  primaryRetentionSeconds: typeof CRM_SEARCH_QUEUE_RETENTION_SECONDS
  deadLetterQueue: typeof CRM_SEARCH_DEAD_LETTER_QUEUE_NAME
  deadLetterRetentionSeconds: typeof CRM_SEARCH_QUEUE_RETENTION_SECONDS
}

export interface CrmSearchConsumerProtocolHealth {
  status: 'ready'
  component: 'crm_search_consumer'
  protocolVersion: typeof CRM_SEARCH_INDEX_PROTOCOL_VERSION
  deployedSha: string
  artifactDigest: string
  bindingManifestDigest: string
  pages: {
    deployedSha: string
    artifactDigest: string
    bindingManifestDigest: string
  }
  resources: CrmSearchConsumerResourceHealth
}

interface PreparedCrmSearchConsumerRuntime {
  origin: typeof CRM_SEARCH_PAGES_ORIGIN
  keyring: CrmSearchServiceKeyring
  evidence: z.infer<typeof releaseEvidenceSchema>
  resources: CrmSearchConsumerResourceHealth
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error('crm_search_consumer_unready')
  }
}

function requireOrigin(value: string): typeof CRM_SEARCH_PAGES_ORIGIN {
  try {
    const parsed = new URL(value)
    if (
      value !== CRM_SEARCH_PAGES_ORIGIN
      || parsed.origin !== CRM_SEARCH_PAGES_ORIGIN
      || parsed.pathname !== '/'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
    ) throw new Error('crm_search_consumer_unready')
    return CRM_SEARCH_PAGES_ORIGIN
  } catch {
    throw new Error('crm_search_consumer_unready')
  }
}

function requireActiveKeyring(value: string, nowMs: number): CrmSearchServiceKeyring {
  const keyring = parseCrmSearchServiceKeyring(value)
  const active = keyring?.keys[keyring.activeKeyVersion]
  const nowSeconds = Math.floor(nowMs / 1_000)
  if (
    !Number.isFinite(nowMs)
    || !active
    || active.status !== 'active'
    || nowSeconds < active.notBefore
    || nowSeconds >= active.notAfter
  ) throw new Error('crm_search_consumer_unready')
  return keyring
}

function requireResourceManifest(value: string): CrmSearchConsumerResourceHealth {
  const parsed = resourceManifestSchema.safeParse(parseJson(value))
  if (!parsed.success) throw new Error('crm_search_consumer_unready')
  return {
    revision: parsed.data.revision,
    plan: parsed.data.plan,
    primaryQueue: parsed.data.primary.name,
    primaryRetentionSeconds: parsed.data.primary.retentionSeconds,
    deadLetterQueue: parsed.data.deadLetter.name,
    deadLetterRetentionSeconds: parsed.data.deadLetter.retentionSeconds
  }
}

function requireReleaseEvidence(
  bindings: CrmSearchConsumerBindings
): z.infer<typeof releaseEvidenceSchema> {
  const parsed = releaseEvidenceSchema.safeParse({
    implementationSha: bindings.CRM_SEARCH_IMPLEMENTATION_SHA,
    workerArtifactDigest: bindings.CRM_SEARCH_WORKER_ARTIFACT_DIGEST,
    bindingManifestDigest: bindings.CRM_SEARCH_BINDING_MANIFEST_DIGEST,
    expectedPagesSha: bindings.CRM_SEARCH_EXPECTED_PAGES_SHA,
    expectedPagesArtifactDigest: bindings.CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST,
    expectedPagesBindingManifestDigest:
      bindings.CRM_SEARCH_EXPECTED_PAGES_BINDING_MANIFEST_DIGEST
  })
  if (!parsed.success) throw new Error('crm_search_consumer_unready')
  return parsed.data
}

export function prepareCrmSearchConsumerRuntime(
  bindings: CrmSearchConsumerBindings,
  nowMs: number
): PreparedCrmSearchConsumerRuntime {
  return {
    origin: requireOrigin(bindings.CRM_SEARCH_PAGES_BASE_URL),
    keyring: requireActiveKeyring(bindings.CRM_SEARCH_SERVICE_KEYRING, nowMs),
    evidence: requireReleaseEvidence(bindings),
    resources: requireResourceManifest(bindings.CRM_SEARCH_RESOURCE_MANIFEST)
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim()
  if (contentType !== 'application/json') throw new Error('crm_search_consumer_unready')
  const declaredLength = response.headers.get('content-length')
  if (declaredLength && (!/^\d+$/.test(declaredLength)
    || Number(declaredLength) > HEALTH_RESPONSE_MAX_BYTES)) {
    throw new Error('crm_search_consumer_unready')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > HEALTH_RESPONSE_MAX_BYTES) {
    throw new Error('crm_search_consumer_unready')
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  return parseJson(text)
}

function requirePagesCompatibility(
  value: unknown,
  runtime: PreparedCrmSearchConsumerRuntime
): CrmSearchPagesProtocolHealth {
  const parsed = pagesHealthSchema.safeParse(value)
  if (!parsed.success) throw new Error('crm_search_consumer_unready')
  const health = parsed.data
  const acceptedProtocolVersions = crmSearchAcceptedProtocolVersions(
    health.protocolVersion
  )
  if (
    health.acceptedProtocolVersions.length !== acceptedProtocolVersions.length
    || !acceptedProtocolVersions.every((version, index) => (
      health.acceptedProtocolVersions[index] === version
    ))
    || !health.acceptedProtocolVersions.includes(CRM_SEARCH_INDEX_PROTOCOL_VERSION)
    || health.deployedSha !== runtime.evidence.expectedPagesSha
    || health.artifactDigest !== runtime.evidence.expectedPagesArtifactDigest
    || health.bindingManifestDigest !== runtime.evidence.expectedPagesBindingManifestDigest
    || health.expectedWorker.deployedSha !== runtime.evidence.implementationSha
    || health.expectedWorker.artifactDigest !== runtime.evidence.workerArtifactDigest
    || health.expectedWorker.bindingManifestDigest !== runtime.evidence.bindingManifestDigest
    || health.expectedWorker.emittedProtocolVersion !== CRM_SEARCH_INDEX_PROTOCOL_VERSION
  ) throw new Error('crm_search_consumer_unready')
  return health
}

export async function evaluateCrmSearchConsumerHealth(
  bindings: CrmSearchConsumerBindings,
  dependencies: CrmSearchConsumerHealthDependencies
): Promise<CrmSearchConsumerProtocolHealth> {
  const runtime = prepareCrmSearchConsumerRuntime(bindings, dependencies.now())
  const request = new Request(`${runtime.origin}${CRM_SEARCH_HEALTH_PATH}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS)
  })
  const response = await dependencies.fetch(request)
  if (response.status !== 200) throw new Error('crm_search_consumer_unready')
  const pages = requirePagesCompatibility(await readBoundedJson(response), runtime)

  return {
    status: 'ready',
    component: 'crm_search_consumer',
    protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
    deployedSha: runtime.evidence.implementationSha,
    artifactDigest: runtime.evidence.workerArtifactDigest,
    bindingManifestDigest: runtime.evidence.bindingManifestDigest,
    pages: {
      deployedSha: pages.deployedSha,
      artifactDigest: pages.artifactDigest,
      bindingManifestDigest: pages.bindingManifestDigest
    },
    resources: runtime.resources
  }
}
