import type { CrmSearchApprovalDraft } from './contracts'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const BASE64URL = /^[A-Za-z0-9_-]+$/u
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const VERSION = 'crm-search-bootstrap-approval-envelope-v1'
const KEYRING_VERSION = 'crm-search-bootstrap-verification-keyring-v1'
const MAX_KEYS = 3
const verifiedApprovals = new WeakSet<object>()

function fail(code: string): never {
  throw new Error(code)
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail(code)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  if (Object.keys(value).sort().join('\0') !== [...expected].sort().join('\0')) fail(code)
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const candidate = record(value, 'crm_search_bootstrap_payload_invalid')
  return `{${Object.keys(candidate).sort().map(key => (
    `${JSON.stringify(key)}:${canonical(candidate[key])}`
  )).join(',')}}`
}

function decodeBase64Url(value: string, code: string): Uint8Array {
  if (!BASE64URL.test(value) || value.length > 1_024) fail(code)
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = `${base64}${'='.repeat((4 - base64.length % 4) % 4)}`
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0))
    if (bytes.byteLength === 0) fail(code)
    return bytes
  } catch {
    fail(code)
  }
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function canonicalCrmSearchBootstrapApprovalPayload(payload: unknown): Uint8Array {
  return new TextEncoder().encode(canonical(payload))
}

function parseKeyring(value: unknown, nowMs: number, keyVersion: string): Uint8Array {
  let parsed: unknown
  try {
    parsed = typeof value === 'string' && value.length <= 8_192 ? JSON.parse(value) : null
  } catch {
    fail('crm_search_bootstrap_keyring_invalid')
  }
  const keyring = record(parsed, 'crm_search_bootstrap_keyring_invalid')
  exactKeys(keyring, ['version', 'activeKeyVersion', 'keys'], 'crm_search_bootstrap_keyring_invalid')
  const keys = record(keyring.keys, 'crm_search_bootstrap_keyring_invalid')
  if (keyring.version !== KEYRING_VERSION || keyring.activeKeyVersion !== keyVersion
    || Object.keys(keys).length < 1 || Object.keys(keys).length > MAX_KEYS) {
    fail('crm_search_bootstrap_keyring_invalid')
  }
  const key = record(keys[keyVersion], 'crm_search_bootstrap_key_unavailable')
  exactKeys(key, ['algorithm', 'publicKeySpki', 'notBefore', 'notAfter'], 'crm_search_bootstrap_keyring_invalid')
  const notBefore = Date.parse(String(key.notBefore))
  const notAfter = Date.parse(String(key.notAfter))
  if (key.algorithm !== 'Ed25519'
    || !ISO_TIMESTAMP.test(String(key.notBefore)) || !ISO_TIMESTAMP.test(String(key.notAfter))
    || !Number.isFinite(nowMs) || !Number.isFinite(notBefore)
    || !Number.isFinite(notAfter) || nowMs < notBefore || nowMs >= notAfter) {
    fail('crm_search_bootstrap_key_unavailable')
  }
  return decodeBase64Url(String(key.publicKeySpki), 'crm_search_bootstrap_keyring_invalid')
}

function parsePayload(value: unknown, nowMs: number): CrmSearchApprovalDraft {
  const payload = record(value, 'crm_search_bootstrap_payload_invalid')
  exactKeys(payload, [
    'type', 'environment', 'originalTimestamp', 'expiresAt', 'implementationGitSha',
    'artifactManifestDigest', 'bindingManifestDigest', 'evidenceBundleHash',
    'organisationScopeId', 'requestedByActorId', 'approvedBy', 'maximumCostUsdMicros',
    'clientIds', 'reason'
  ], 'crm_search_bootstrap_payload_invalid')
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : ''
  const issuedAt = Date.parse(String(payload.originalTimestamp))
  const expiresAt = Date.parse(String(payload.expiresAt))
  if (payload.type !== 'resource_provision'
    || !['preview', 'production'].includes(String(payload.environment))
    || !SHA.test(String(payload.implementationGitSha))
    || ![payload.artifactManifestDigest, payload.bindingManifestDigest, payload.evidenceBundleHash]
      .every(value => DIGEST.test(String(value)))
      || ![payload.organisationScopeId, payload.requestedByActorId, payload.approvedBy]
        .every(value => UUID.test(String(value)))
        || payload.requestedByActorId === payload.approvedBy
        || !Number.isSafeInteger(payload.maximumCostUsdMicros) || Number(payload.maximumCostUsdMicros) < 0
        || !Array.isArray(payload.clientIds) || payload.clientIds.length !== 0
        || payload.reason !== reason || reason.length < 10 || reason.length > 2_000
        || !ISO_TIMESTAMP.test(String(payload.originalTimestamp))
        || !ISO_TIMESTAMP.test(String(payload.expiresAt))
        || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
        || issuedAt > nowMs || nowMs >= expiresAt || expiresAt <= issuedAt) {
    fail('crm_search_bootstrap_payload_invalid')
  }
  return {
    approvalType: 'resource_provision',
    environment: payload.environment as 'preview' | 'production',
    organisationScopeId: String(payload.organisationScopeId),
    implementationGitSha: String(payload.implementationGitSha),
    artifactManifestDigest: String(payload.artifactManifestDigest),
    bindingManifestDigest: String(payload.bindingManifestDigest),
    evidenceBundleHash: String(payload.evidenceBundleHash),
    maximumCostUsdMicros: Number(payload.maximumCostUsdMicros),
    approvedBy: String(payload.approvedBy),
    requestedByActorId: String(payload.requestedByActorId),
    reason,
    issuedAt: String(payload.originalTimestamp),
    expiresAt: String(payload.expiresAt)
  }
}

export async function verifyCrmSearchBootstrapApprovalEnvelope(
  value: unknown,
  options: { keyring: unknown, nowMs: number }
): Promise<CrmSearchApprovalDraft> {
  const envelope = record(value, 'crm_search_bootstrap_envelope_invalid')
  exactKeys(envelope, ['version', 'keyVersion', 'payload', 'signature'], 'crm_search_bootstrap_envelope_invalid')
  if (envelope.version !== VERSION || typeof envelope.keyVersion !== 'string') {
    fail('crm_search_bootstrap_envelope_invalid')
  }
  const publicKeyBytes = parseKeyring(options.keyring, options.nowMs, envelope.keyVersion)
  const payload = parsePayload(envelope.payload, options.nowMs)
  const bytes = canonicalCrmSearchBootstrapApprovalPayload(envelope.payload)
  const signature = decodeBase64Url(String(envelope.signature), 'crm_search_bootstrap_envelope_invalid')
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey(
      'spki', ownedBuffer(publicKeyBytes), { name: 'Ed25519' }, false, ['verify']
    )
  } catch {
    fail('crm_search_bootstrap_keyring_invalid')
  }
  if (!await crypto.subtle.verify(
    { name: 'Ed25519' }, key, ownedBuffer(signature), ownedBuffer(bytes)
  )) {
    fail('crm_search_bootstrap_signature_invalid')
  }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', ownedBuffer(bytes)))
  const verified = Object.freeze({
    ...payload,
    importedProvenanceHash: [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('')
  })
  verifiedApprovals.add(verified)
  return verified
}

export function requireVerifiedCrmSearchBootstrapApproval(
  value: unknown
): CrmSearchApprovalDraft {
  if (!value || typeof value !== 'object' || !verifiedApprovals.has(value)) {
    fail('crm_search_bootstrap_unverified')
  }
  return value as CrmSearchApprovalDraft
}
