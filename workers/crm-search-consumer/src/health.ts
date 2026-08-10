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
export const CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION
  = 'crm-search-environment-resource-manifest-v1' as const
export const CRM_SEARCH_ENVIRONMENT_RESOURCE_ENVELOPE_VERSION
  = 'crm-search-environment-resource-envelope-v1' as const

const HEALTH_RESPONSE_MAX_BYTES = 2_048
const HEALTH_REQUEST_TIMEOUT_MS = 5_000
const gitShaPattern = /^[a-f0-9]{40}$/
const digestPattern = /^sha256:[a-f0-9]{64}$/
const targetIdentityDigestPattern = /^[a-f0-9]{64}$/
const externalMutableIntegrations = [
  'database',
  'provider_apis',
  'ai_gateway',
  'mcp',
  'meta',
  'google',
  'meta_audiences',
  'google_audiences',
  'xero',
  'email_delivery',
  'monday',
  'slack',
  'outbound_webhooks',
  'google_sheets',
  'social_dashboard'
] as const

const externalIntegrationTargetSchema = z.discriminatedUnion('state', [
  z.object({
    name: z.enum(externalMutableIntegrations),
    state: z.literal('disabled'),
    targetIdentityDigest: z.null(),
    verifiedAt: z.iso.datetime()
  }).strict(),
  z.object({
    name: z.enum(externalMutableIntegrations),
    state: z.literal('enabled'),
    targetIdentityDigest: z.string().regex(targetIdentityDigestPattern),
    verifiedAt: z.iso.datetime()
  }).strict()
])

const externalIntegrationInventorySchema = z.array(externalIntegrationTargetSchema)
  .length(externalMutableIntegrations.length)
  .superRefine((integrations, context) => {
    for (const [index, expectedName] of externalMutableIntegrations.entries()) {
      if (integrations[index]?.name !== expectedName) {
        context.addIssue({
          code: 'custom',
          message: 'external integration inventory must be exact and ordered',
          path: [index, 'name']
        })
      }
    }
  })

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

const resourcePayloadSchema = z.object({
  version: z.literal(CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION),
  environment: z.enum(['preview', 'production']),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  readbackSource: z.literal('cloudflare_api'),
  plan: z.literal(CRM_SEARCH_SUPPORTED_QUEUE_PLAN),
  pages: z.object({
    project: z.literal('agency-dashboard'),
    branch: z.enum(['preview', 'main']),
    origin: z.url()
  }).strict(),
  worker: z.object({ name: z.string().min(1).max(128) }).strict(),
  vectorize: z.object({ crmSearch: z.string().min(1).max(128) }).strict(),
  queues: z.object({
    primary: z.object({
      name: z.string().min(1).max(128),
      retentionSeconds: z.literal(CRM_SEARCH_QUEUE_RETENTION_SECONDS)
    }).strict(),
    deadLetter: z.object({
      name: z.string().min(1).max(128),
      retentionSeconds: z.literal(CRM_SEARCH_QUEUE_RETENTION_SECONDS)
    }).strict()
  }).strict(),
  externalIntegrations: externalIntegrationInventorySchema
}).strict()

const resourceEnvelopeSchema = z.object({
  version: z.literal(CRM_SEARCH_ENVIRONMENT_RESOURCE_ENVELOPE_VERSION),
  keyVersion: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/u),
  payload: resourcePayloadSchema,
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  signature: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/u)
}).strict()

const resourceVerificationKeyringSchema = z.object({
  version: z.literal('crm-search-resource-verification-keyring-v1'),
  activeKeyVersion: z.string().min(1).max(64),
  keys: z.record(z.string(), z.object({
    algorithm: z.literal('Ed25519'),
    publicKeySpki: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/u),
    notBefore: z.iso.datetime(),
    notAfter: z.iso.datetime()
  }).strict())
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
  CRM_SEARCH_ENVIRONMENT: string
  CRM_SEARCH_SERVICE_KEYRING: string
  CRM_SEARCH_IMPLEMENTATION_SHA: string
  CRM_SEARCH_WORKER_ARTIFACT_DIGEST: string
  CRM_SEARCH_BINDING_MANIFEST_DIGEST: string
  CRM_SEARCH_EXPECTED_PAGES_SHA: string
  CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST: string
  CRM_SEARCH_EXPECTED_PAGES_BINDING_MANIFEST_DIGEST: string
  CRM_SEARCH_RESOURCE_MANIFEST: string
  CRM_SEARCH_RESOURCE_MANIFEST_VERIFICATION_KEYRING: string
}

export interface CrmSearchConsumerHealthDependencies {
  fetch(request: Request): Promise<Response>
  now(): number
}

export interface CrmSearchConsumerResourceHealth {
  revision: typeof CRM_SEARCH_RESOURCE_READBACK_REVISION
  environment: 'preview' | 'production'
  plan: typeof CRM_SEARCH_SUPPORTED_QUEUE_PLAN
  workerName: string
  vectorizeIndex: string
  primaryQueue: string
  primaryRetentionSeconds: typeof CRM_SEARCH_QUEUE_RETENTION_SECONDS
  deadLetterQueue: string
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
  origin: string
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

function requireOrigin(value: string, expected: string): string {
  try {
    const parsed = new URL(value)
    if (
      value !== expected
      || parsed.origin !== expected
      || parsed.pathname !== '/'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
    ) throw new Error('crm_search_consumer_unready')
    return expected
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

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>
    return `{${Object.keys(candidate).sort().map(key => (
      `${JSON.stringify(key)}:${canonical(candidate[key])}`
    )).join(',')}}`
  }
  throw new Error('crm_search_consumer_unready')
}

function decodeBase64Url(value: string): Uint8Array {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = `${base64}${'='.repeat((4 - base64.length % 4) % 4)}`
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0))
    if (bytes.byteLength === 0) throw new Error('empty')
    return bytes
  } catch {
    throw new Error('crm_search_consumer_unready')
  }
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function exactEnvironmentResources(payload: z.infer<typeof resourcePayloadSchema>): boolean {
  if (payload.environment === 'production') {
    return payload.pages.branch === 'main'
      && payload.pages.origin === CRM_SEARCH_PAGES_ORIGIN
      && payload.worker.name === CRM_SEARCH_PRIMARY_QUEUE_NAME.replace('-index', '-consumer')
      && payload.vectorize.crmSearch === 'agency-crm-search'
      && payload.queues.primary.name === CRM_SEARCH_PRIMARY_QUEUE_NAME
      && payload.queues.deadLetter.name === CRM_SEARCH_DEAD_LETTER_QUEUE_NAME
  }
  return payload.pages.branch === 'preview'
    && payload.pages.origin === 'https://preview.agency-dashboard.pages.dev'
    && payload.worker.name === 'agency-crm-search-consumer-preview'
    && payload.vectorize.crmSearch === 'agency-crm-search-preview'
    && payload.queues.primary.name === 'agency-crm-search-index-preview'
    && payload.queues.deadLetter.name === 'agency-crm-search-index-preview-dlq'
}

export async function verifyCrmSearchEnvironmentResourceManifest(input: {
  environment: string
  envelope: string
  verificationKeyring: string
  nowMs: number
}): Promise<{ origin: string, resources: CrmSearchConsumerResourceHealth }> {
  if (typeof input.envelope !== 'string' || input.envelope.length > 16_384
    || typeof input.verificationKeyring !== 'string'
    || input.verificationKeyring.length > 8_192) {
    throw new Error('crm_search_consumer_unready')
  }
  const parsed = resourceEnvelopeSchema.safeParse(parseJson(input.envelope))
  const keyring = resourceVerificationKeyringSchema.safeParse(parseJson(input.verificationKeyring))
  if (!parsed.success || !keyring.success
    || Object.keys(keyring.data.keys).length < 1
    || Object.keys(keyring.data.keys).length > 3
    || keyring.data.activeKeyVersion !== parsed.data.keyVersion) {
    throw new Error('crm_search_consumer_unready')
  }
  const payload = parsed.data.payload
  const key = keyring.data.keys[parsed.data.keyVersion]
  const issuedAt = Date.parse(payload.issuedAt)
  const expiresAt = Date.parse(payload.expiresAt)
  const keyNotBefore = key ? Date.parse(key.notBefore) : NaN
  const keyNotAfter = key ? Date.parse(key.notAfter) : NaN
  if (!key || input.environment !== payload.environment || !exactEnvironmentResources(payload)
    || !Number.isFinite(input.nowMs) || issuedAt > input.nowMs || input.nowMs >= expiresAt
    || expiresAt <= issuedAt || expiresAt - issuedAt > 31 * 24 * 60 * 60 * 1_000
    || input.nowMs < keyNotBefore || input.nowMs >= keyNotAfter) {
    throw new Error('crm_search_consumer_unready')
  }
  const bytes = new TextEncoder().encode(canonical(payload))
  const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  if (digest !== parsed.data.payloadSha256) throw new Error('crm_search_consumer_unready')
  try {
    const verificationKey = await crypto.subtle.importKey(
      'spki', ownedBuffer(decodeBase64Url(key.publicKeySpki)), { name: 'Ed25519' }, false, ['verify']
    )
    if (!await crypto.subtle.verify(
      { name: 'Ed25519' }, verificationKey,
      ownedBuffer(decodeBase64Url(parsed.data.signature)), ownedBuffer(bytes)
    )) throw new Error('crm_search_consumer_unready')
  } catch {
    throw new Error('crm_search_consumer_unready')
  }
  return {
    origin: requireOrigin(payload.pages.origin, payload.pages.origin),
    resources: {
      revision: CRM_SEARCH_RESOURCE_READBACK_REVISION,
      environment: payload.environment,
      plan: payload.plan,
      workerName: payload.worker.name,
      vectorizeIndex: payload.vectorize.crmSearch,
      primaryQueue: payload.queues.primary.name,
      primaryRetentionSeconds: payload.queues.primary.retentionSeconds,
      deadLetterQueue: payload.queues.deadLetter.name,
      deadLetterRetentionSeconds: payload.queues.deadLetter.retentionSeconds
    }
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

export async function prepareCrmSearchConsumerRuntime(
  bindings: CrmSearchConsumerBindings,
  nowMs: number
): Promise<PreparedCrmSearchConsumerRuntime> {
  const manifest = await verifyCrmSearchEnvironmentResourceManifest({
    environment: bindings.CRM_SEARCH_ENVIRONMENT,
    envelope: bindings.CRM_SEARCH_RESOURCE_MANIFEST,
    verificationKeyring: bindings.CRM_SEARCH_RESOURCE_MANIFEST_VERIFICATION_KEYRING,
    nowMs
  })
  return {
    origin: manifest.origin,
    keyring: requireActiveKeyring(bindings.CRM_SEARCH_SERVICE_KEYRING, nowMs),
    evidence: requireReleaseEvidence(bindings),
    resources: manifest.resources
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
  const runtime = await prepareCrmSearchConsumerRuntime(bindings, dependencies.now())
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
