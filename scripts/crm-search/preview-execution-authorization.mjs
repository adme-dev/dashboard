import { createPublicKey, verify } from 'node:crypto'

const DIGEST = /^[a-f0-9]{64}$/u
const SHA = /^[a-f0-9]{40}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const ACCOUNT_ID = /^[a-f0-9]{32}$/u
const NEON_PROJECT_ID = /^[a-z]+-[a-z]+-[0-9]{8}$/u
const NEON_BRANCH_ID = /^br-[a-z0-9-]{8,64}$/u
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/u
const MAX_AUTHORIZATION_LIFETIME_MS = 30 * 60_000

const PAYLOAD_KEYS = Object.freeze([
  'adapterDigest',
  'approvalId',
  'artifactManifestDigest',
  'bindingManifestDigest',
  'cloudflareAccountId',
  'environment',
  'expiresAt',
  'implementationSha',
  'issuedAt',
  'neonAttestationDigest',
  'neonParentBranchId',
  'neonProjectId',
  'pagesProject',
  'reason',
  'resourceReadbackDigest',
  'version'
])

const TARGET_BINDING_KEYS = Object.freeze([
  'cloudflareAccountId',
  'neonProjectId',
  'neonParentBranchId',
  'pagesProject',
  'implementationSha',
  'artifactManifestDigest',
  'bindingManifestDigest',
  'resourceReadbackDigest',
  'neonAttestationDigest',
  'adapterDigest'
])

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${canonical(value[key])}`
    )).join(',')}}`
  }
  throw new Error('crm_search_preview_authorization_noncanonical')
}

export function canonicalPreviewAuthorizationPayload(payload) {
  return canonical(payload)
}

function assertPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || canonical(Object.keys(payload).sort()) !== canonical(PAYLOAD_KEYS)
    || payload.version !== 'crm-search-preview-execution-authorization-v1'
    || payload.environment !== 'preview'
    || !UUID.test(payload.approvalId ?? '')
    || !SHA.test(payload.implementationSha ?? '')
    || !DIGEST.test(payload.artifactManifestDigest ?? '')
    || !DIGEST.test(payload.bindingManifestDigest ?? '')
    || !DIGEST.test(payload.resourceReadbackDigest ?? '')
    || !DIGEST.test(payload.neonAttestationDigest ?? '')
    || !DIGEST.test(payload.adapterDigest ?? '')
    || !ACCOUNT_ID.test(payload.cloudflareAccountId ?? '')
    || !NEON_PROJECT_ID.test(payload.neonProjectId ?? '')
    || !NEON_BRANCH_ID.test(payload.neonParentBranchId ?? '')
    || payload.pagesProject !== 'agency-dashboard'
    || typeof payload.reason !== 'string' || payload.reason.length < 20 || payload.reason.length > 500) {
    throw new Error('crm_search_preview_authorization_invalid')
  }
  const issuedAt = Date.parse(payload.issuedAt)
  const expiresAt = Date.parse(payload.expiresAt)
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
    || expiresAt <= issuedAt || expiresAt > issuedAt + MAX_AUTHORIZATION_LIFETIME_MS) {
    throw new Error('crm_search_preview_authorization_invalid')
  }
  return { issuedAt, expiresAt }
}

function activePublicKey(envelope, keyring) {
  if (!keyring || keyring.version !== 'crm-search-preview-execution-keyring-v1'
    || !KEY_ID.test(keyring.activeKeyId ?? '')
    || !Array.isArray(keyring.keys) || keyring.keys.length < 1 || keyring.keys.length > 8
    || envelope.keyId !== keyring.activeKeyId) {
    throw new Error('crm_search_preview_authorization_key_invalid')
  }
  const keys = new Map()
  for (const entry of keyring.keys) {
    if (!KEY_ID.test(entry?.keyId ?? '') || typeof entry?.publicKeyPem !== 'string'
      || keys.has(entry.keyId)) {
      throw new Error('crm_search_preview_authorization_key_invalid')
    }
    keys.set(entry.keyId, entry.publicKeyPem)
  }
  const publicKeyPem = keys.get(envelope.keyId)
  if (!publicKeyPem) throw new Error('crm_search_preview_authorization_key_invalid')
  try {
    const publicKey = createPublicKey(publicKeyPem)
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('crm_search_preview_authorization_key_invalid')
    }
    return publicKey
  } catch {
    throw new Error('crm_search_preview_authorization_key_invalid')
  }
}

export function verifyPreviewExecutionAuthorizationEnvelope(envelope, options) {
  if (!envelope || envelope.version !== 'crm-search-preview-execution-authorization-envelope-v1'
    || !KEY_ID.test(envelope.keyId ?? '') || typeof envelope.signature !== 'string'
    || !/^[A-Za-z0-9_-]{80,120}$/u.test(envelope.signature)) {
    throw new Error('crm_search_preview_authorization_invalid')
  }
  const { expiresAt } = assertPayload(envelope.payload)
  const publicKey = activePublicKey(envelope, options?.keyring)
  let signature
  try {
    signature = Buffer.from(envelope.signature, 'base64url')
  } catch {
    throw new Error('crm_search_preview_authorization_signature_invalid')
  }
  const valid = verify(
    null,
    Buffer.from(canonicalPreviewAuthorizationPayload(envelope.payload), 'utf8'),
    publicKey,
    signature
  )
  if (!valid) throw new Error('crm_search_preview_authorization_signature_invalid')
  if (!Number.isSafeInteger(options?.nowMs) || expiresAt <= options.nowMs) {
    throw new Error('crm_search_preview_authorization_expired')
  }
  if (!options.expected || TARGET_BINDING_KEYS.some(key => (
    options.expected[key] !== envelope.payload[key]
  ))) {
    throw new Error('crm_search_preview_authorization_target_drift')
  }
  return Object.freeze({ ...envelope.payload })
}
