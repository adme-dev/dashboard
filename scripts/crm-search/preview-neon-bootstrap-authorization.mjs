import { createHash, createPublicKey, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'

const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/u
const PROJECT_ID = /^[a-z]+-[a-z]+-[0-9]{8}$/u
const BRANCH_ID = /^br-[a-z0-9-]{8,64}$/u
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const MAX_AUTHORIZATION_LIFETIME_MS = 30 * 60_000
const MAX_BRANCH_LIFETIME_MS = 6 * 60 * 60_000
const MIGRATION_PATHS = Object.freeze([
  'server/database/migrations/350_crm_search_expand.sql',
  'server/database/migrations/351_crm_search_validate_backfill.sql',
  'server/database/migrations/352_crm_search_activate_capture.sql'
])
const PAYLOAD_KEYS = Object.freeze([
  'approvalId', 'branchExpiresAt', 'branchName', 'cleanupRequired', 'environment',
  'expiresAt', 'implementationSha', 'issuedAt', 'maximumCostUsdMicros',
  'migrationDigests', 'neonParentBranchId', 'neonProjectId', 'organisationScopeId',
  'pagesPreviewDigest', 'reason', 'resourceReadbackDigest', 'version'
])
const EXPECTED_KEYS = Object.freeze([
  'branchExpiresAt', 'branchName', 'implementationSha', 'migrationDigests',
  'neonParentBranchId', 'neonProjectId', 'organisationScopeId',
  'pagesPreviewDigest', 'resourceReadbackDigest'
])

function fail(code) {
  throw new Error(code)
}

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
  fail('crm_search_preview_neon_bootstrap_noncanonical')
}

export function canonicalPreviewNeonBootstrapPayload(payload) {
  return canonical(payload)
}

function workspaceMigrationDigests() {
  return Object.fromEntries(MIGRATION_PATHS.map(path => [
    path,
    createHash('sha256')
      .update(readFileSync(new URL(`../../${path}`, import.meta.url)))
      .digest('hex')
  ]))
}

function assertPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || canonical(Object.keys(payload).sort()) !== canonical(PAYLOAD_KEYS)
    || payload.version !== 'crm-search-preview-neon-bootstrap-authorization-v1'
    || payload.environment !== 'preview'
    || !UUID.test(payload.approvalId ?? '')
    || !UUID.test(payload.organisationScopeId ?? '')
    || !SHA.test(payload.implementationSha ?? '')
    || !PROJECT_ID.test(payload.neonProjectId ?? '')
    || !BRANCH_ID.test(payload.neonParentBranchId ?? '')
    || payload.branchName !== `crm-search-e2e-${payload.implementationSha?.slice(0, 12)}`
    || !DIGEST.test(payload.pagesPreviewDigest ?? '')
    || !DIGEST.test(payload.resourceReadbackDigest ?? '')
    || payload.maximumCostUsdMicros !== 0
    || payload.cleanupRequired !== true
    || typeof payload.reason !== 'string' || payload.reason !== payload.reason.trim()
    || payload.reason.length < 20 || payload.reason.length > 500
    || !payload.migrationDigests
    || canonical(payload.migrationDigests) !== canonical(workspaceMigrationDigests())) {
    fail('crm_search_preview_neon_bootstrap_invalid')
  }
  const issuedAt = Date.parse(payload.issuedAt)
  const expiresAt = Date.parse(payload.expiresAt)
  const branchExpiresAt = Date.parse(payload.branchExpiresAt)
  if (![payload.issuedAt, payload.expiresAt, payload.branchExpiresAt].every(value => (
    typeof value === 'string' && ISO_TIMESTAMP.test(value)
  ))
  || ![issuedAt, expiresAt, branchExpiresAt].every(Number.isFinite)
  || expiresAt <= issuedAt
  || expiresAt > issuedAt + MAX_AUTHORIZATION_LIFETIME_MS
  || branchExpiresAt <= issuedAt
  || branchExpiresAt > issuedAt + MAX_BRANCH_LIFETIME_MS) {
    fail('crm_search_preview_neon_bootstrap_invalid')
  }
  return { issuedAt, expiresAt }
}

function activePublicKey(envelope, keyring) {
  if (!keyring || canonical(Object.keys(keyring).sort()) !== canonical([
    'activeKeyId', 'keys', 'version'
  ].sort())
  || keyring.version !== 'crm-search-preview-neon-bootstrap-keyring-v1'
  || !KEY_ID.test(keyring.activeKeyId ?? '')
  || envelope.keyId !== keyring.activeKeyId
  || !Array.isArray(keyring.keys) || keyring.keys.length < 1 || keyring.keys.length > 3) {
    fail('crm_search_preview_neon_bootstrap_key_invalid')
  }
  const keys = new Map()
  for (const entry of keyring.keys) {
    if (!entry || canonical(Object.keys(entry).sort()) !== canonical([
      'keyId', 'publicKeyPem'
    ].sort())
    || !KEY_ID.test(entry.keyId ?? '') || typeof entry.publicKeyPem !== 'string'
    || keys.has(entry.keyId)) {
      fail('crm_search_preview_neon_bootstrap_key_invalid')
    }
    keys.set(entry.keyId, entry.publicKeyPem)
  }
  const publicKeyPem = keys.get(envelope.keyId)
  if (!publicKeyPem) fail('crm_search_preview_neon_bootstrap_key_invalid')
  try {
    const key = createPublicKey(publicKeyPem)
    if (key.asymmetricKeyType !== 'ed25519') fail('crm_search_preview_neon_bootstrap_key_invalid')
    return key
  } catch {
    fail('crm_search_preview_neon_bootstrap_key_invalid')
  }
}

export function verifyPreviewNeonBootstrapAuthorization(envelope, options) {
  if (!envelope || canonical(Object.keys(envelope).sort()) !== canonical([
    'keyId', 'payload', 'signature', 'version'
  ].sort())
  || envelope.version !== 'crm-search-preview-neon-bootstrap-envelope-v1'
  || !KEY_ID.test(envelope.keyId ?? '')
  || typeof envelope.signature !== 'string'
  || !/^[A-Za-z0-9_-]{80,120}$/u.test(envelope.signature)
  || !Number.isSafeInteger(options?.nowMs)) {
    fail('crm_search_preview_neon_bootstrap_invalid')
  }
  const { issuedAt, expiresAt } = assertPayload(envelope.payload)
  const publicKey = activePublicKey(envelope, options.keyring)
  const valid = verify(
    null,
    Buffer.from(canonicalPreviewNeonBootstrapPayload(envelope.payload), 'utf8'),
    publicKey,
    Buffer.from(envelope.signature, 'base64url')
  )
  if (!valid) fail('crm_search_preview_neon_bootstrap_signature_invalid')
  if (options.nowMs < issuedAt || options.nowMs >= expiresAt) {
    fail('crm_search_preview_neon_bootstrap_expired')
  }
  if (!options.expected || canonical(Object.keys(options.expected).sort()) !== canonical(EXPECTED_KEYS)
    || EXPECTED_KEYS.some(key => canonical(options.expected[key]) !== canonical(envelope.payload[key]))) {
    fail('crm_search_preview_neon_bootstrap_target_drift')
  }
  return Object.freeze({ ...envelope.payload })
}

export function assertFreshPreviewNeonBootstrapReadback(readback, authorized, options) {
  if (!readback || canonical(Object.keys(readback).sort()) !== canonical([
    'envelope', 'readbackAt', 'revokedAt', 'source', 'status'
  ].sort())
  || readback.source !== 'local_ephemeral_approval'
  || readback.status !== 'active'
  || readback.revokedAt !== null) {
    fail(readback?.status === 'revoked'
      ? 'crm_search_preview_neon_bootstrap_revoked'
      : 'crm_search_preview_neon_bootstrap_readback_invalid')
  }
  const readbackAt = Date.parse(readback.readbackAt)
  if (typeof readback.readbackAt !== 'string'
    || !ISO_TIMESTAMP.test(readback.readbackAt)
    || !Number.isFinite(readbackAt)
    || readbackAt > options.nowMs + 5_000
    || options.nowMs - readbackAt > 60_000) {
    fail('crm_search_preview_neon_bootstrap_readback_stale')
  }
  const current = verifyPreviewNeonBootstrapAuthorization(readback.envelope, options)
  if (canonical(current) !== canonical(authorized)) {
    fail('crm_search_preview_neon_bootstrap_readback_invalid')
  }
  return { ok: true }
}
