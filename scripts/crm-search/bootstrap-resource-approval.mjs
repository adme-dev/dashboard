import { createHash, createPublicKey, verify } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const DIGEST = /^[a-f0-9]{64}$/u
const SHA = /^[a-f0-9]{40}$/u
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const BASE64URL = /^[A-Za-z0-9_-]+$/u
const KEY_VERSION = /^[A-Za-z0-9._-]{1,64}$/u
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const BOOTSTRAP_KEYRING_VERSION = 'crm-search-bootstrap-verification-keyring-v1'
const RELEASE_KEYRING_VERSION = 'crm-search-release-verification-keyring-v1'

function fail(code) {
  throw new Error(code)
}

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  fail('crm_search_bootstrap_payload_invalid')
}

export function canonicalBootstrapApprovalPayload(payload) {
  return Buffer.from(canonical(payload), 'utf8')
}

function requirePayload(payload, nowMs, expectedType) {
  const exact = [
    'type', 'environment', 'originalTimestamp', 'expiresAt', 'implementationGitSha',
    'artifactManifestDigest', 'bindingManifestDigest', 'evidenceBundleHash',
    'organisationScopeId', 'requestedByActorId', 'approvedBy', 'maximumCostUsdMicros',
    'clientIds', 'reason'
  ]
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).sort().join('\0') !== exact.sort().join('\0')
    || payload.type !== expectedType
    || !['preview', 'production'].includes(payload.environment)
    || !SHA.test(payload.implementationGitSha)
    || ![payload.artifactManifestDigest, payload.bindingManifestDigest, payload.evidenceBundleHash].every(value => DIGEST.test(value))
    || ![payload.organisationScopeId, payload.requestedByActorId, payload.approvedBy].every(value => UUID.test(value))
    || payload.requestedByActorId === payload.approvedBy
    || !Number.isSafeInteger(payload.maximumCostUsdMicros) || payload.maximumCostUsdMicros < 0
    || !Array.isArray(payload.clientIds) || payload.clientIds.length !== 0
    || typeof payload.reason !== 'string' || payload.reason !== payload.reason.trim()
    || payload.reason.length < 10 || payload.reason.length > 2_000) {
    fail('crm_search_bootstrap_payload_invalid')
  }
  const issued = Date.parse(payload.originalTimestamp)
  const expires = Date.parse(payload.expiresAt)
  if (!ISO_TIMESTAMP.test(payload.originalTimestamp) || !ISO_TIMESTAMP.test(payload.expiresAt)
    || !Number.isFinite(issued) || !Number.isFinite(expires)
    || issued > nowMs || nowMs >= expires || expires <= issued) {
    fail('crm_search_bootstrap_approval_expired')
  }
  return payload
}

export async function verifyReleaseApprovalEnvelope(envelope, options) {
  if (!Number.isFinite(options?.nowMs)) fail('crm_search_bootstrap_envelope_invalid')
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || Object.keys(envelope).sort().join('\0') !== ['keyVersion', 'payload', 'signature', 'version'].sort().join('\0')
    || envelope.version !== 'crm-search-bootstrap-approval-envelope-v1'
    || typeof envelope.keyVersion !== 'string' || !KEY_VERSION.test(envelope.keyVersion)
    || typeof envelope.signature !== 'string' || envelope.signature.length > 512
    || !BASE64URL.test(envelope.signature || '')) fail('crm_search_bootstrap_envelope_invalid')
  const expectedKeyringVersion = options.expectedType === 'resource_provision'
    ? BOOTSTRAP_KEYRING_VERSION
    : options.expectedType === 'production_deploy'
      ? RELEASE_KEYRING_VERSION
      : null
  if (!expectedKeyringVersion || !options.keyring || typeof options.keyring !== 'object'
    || Array.isArray(options.keyring)
    || Object.keys(options.keyring).sort().join('\0') !== ['activeKeyVersion', 'keys', 'version'].sort().join('\0')
    || options.keyring.version !== expectedKeyringVersion
    || options.keyring.activeKeyVersion !== envelope.keyVersion) {
    fail('crm_search_bootstrap_key_unavailable')
  }
  if (!options.keyring.keys || Object.keys(options.keyring.keys).length < 1
    || Object.keys(options.keyring.keys).length > 3) fail('crm_search_bootstrap_key_unavailable')
  const key = options.keyring.keys?.[envelope.keyVersion]
  const keyNotBefore = Date.parse(key?.notBefore)
  const keyNotAfter = Date.parse(key?.notAfter)
  if (!key || Object.keys(key).sort().join('\0') !== [
    'algorithm', 'publicKeySpki', 'notAfter', 'notBefore'
  ].sort().join('\0') || key.algorithm !== 'Ed25519'
  || !Number.isFinite(keyNotBefore) || !Number.isFinite(keyNotAfter)
  || options.nowMs < keyNotBefore || options.nowMs >= keyNotAfter) {
    fail('crm_search_bootstrap_key_unavailable')
  }
  const publicKey = key.publicKeySpki
  if (typeof publicKey !== 'string' || publicKey.length > 512 || !BASE64URL.test(publicKey)) {
    fail('crm_search_bootstrap_key_unavailable')
  }
  const payload = requirePayload(envelope.payload, options.nowMs, options.expectedType)
  const bytes = canonicalBootstrapApprovalPayload(payload)
  let valid = false
  try {
    valid = verify(null, bytes, createPublicKey({
      key: Buffer.from(publicKey, 'base64url'),
      type: 'spki',
      format: 'der'
    }), Buffer.from(envelope.signature, 'base64url'))
  } catch {
    fail('crm_search_bootstrap_key_invalid')
  }
  if (!valid) fail('crm_search_bootstrap_signature_invalid')
  return {
    ...payload,
    importedProvenanceHash: createHash('sha256').update(bytes).digest('hex')
  }
}

export async function verifyBootstrapResourceApproval(envelope, options) {
  return await verifyReleaseApprovalEnvelope(envelope, {
    ...options,
    expectedType: 'resource_provision'
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') fail('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) fail('crm_search_bootstrap_dry_run_required')
  console.log(JSON.stringify({ status: 'approval-plan-only', mutationCount: 0 }))
}
