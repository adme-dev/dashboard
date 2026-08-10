import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  throw new Error('crm_search_evidence_noncanonical')
}

const DIGEST = /^[a-f0-9]{64}$/u
const SHA = /^[a-f0-9]{40}$/u
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const KEY_VERSION = /^[A-Za-z0-9._-]{1,64}$/u

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}

function rejectPrivateEvidence(value, key = '') {
  const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, '')
  if (normalizedKey && normalizedKey !== 'judgementsha256'
    && (/(password|secret|token|apikey|query|label|judgement)/u.test(normalizedKey)
      || /^(?:raw)?source(?:rows|records|data|text)?$/u.test(normalizedKey))) {
    throw new Error('crm_search_evidence_privacy_violation')
  }
  if (typeof value === 'string') {
    if (value.length > 512 || /(?:postgres(?:ql)?:\/\/|bearer\s+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/iu.test(value)) {
      throw new Error('crm_search_evidence_privacy_violation')
    }
  } else if (Array.isArray(value)) {
    if (value.length > 64) throw new Error('crm_search_evidence_privacy_violation')
    value.forEach(child => rejectPrivateEvidence(child, key))
  } else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) rejectPrivateEvidence(child, childKey)
  }
}

function requireTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
}

function requireEvidence(evidence) {
  if (!exactKeys(evidence, [
    'issuedAt', 'environment', 'implementationGitSha', 'artifact', 'resource',
    'approval', 'neon', 'sealedHoldout', 'cleanup'
  ])) throw new Error('crm_search_evidence_schema_invalid')
  rejectPrivateEvidence(evidence)
  if (!requireTimestamp(evidence.issuedAt) || !['preview', 'production'].includes(evidence.environment)
    || !SHA.test(evidence.implementationGitSha)
    || !exactKeys(evidence.artifact, [
      'manifestDigest', 'pagesBundleDigest', 'workerBundleDigest', 'bindingManifestDigest'
    ]) || Object.values(evidence.artifact).some(value => !DIGEST.test(value))
    || !exactKeys(evidence.resource, ['manifestDigest', 'readbackDigest'])
    || Object.values(evidence.resource).some(value => !DIGEST.test(value))
    || !exactKeys(evidence.approval, [
      'id', 'revision', 'type', 'expiresAt', 'revocationCheckedAt'
    ]) || !UUID.test(evidence.approval.id) || !Number.isSafeInteger(evidence.approval.revision)
    || evidence.approval.revision < 0 || evidence.approval.type !== 'production_deploy'
    || !requireTimestamp(evidence.approval.expiresAt)
    || !requireTimestamp(evidence.approval.revocationCheckedAt)
    || !exactKeys(evidence.neon, ['attestationSha256'])
    || !DIGEST.test(evidence.neon.attestationSha256)
    || !exactKeys(evidence.sealedHoldout, [
      'objectKey', 'objectSha256', 'keyVersion', 'envelopeVersion',
      'judgementSha256', 'productionReady'
    ]) || evidence.sealedHoldout.objectKey !== 'crm-search/evaluation/holdouts/holdout-v1.json'
    || !DIGEST.test(evidence.sealedHoldout.objectSha256)
    || !DIGEST.test(evidence.sealedHoldout.judgementSha256)
    || !KEY_VERSION.test(evidence.sealedHoldout.keyVersion)
    || evidence.sealedHoldout.envelopeVersion !== 'crm-search-sealed-holdout-v1'
    || typeof evidence.sealedHoldout.productionReady !== 'boolean'
    || !exactKeys(evidence.cleanup, ['manifestDigest', 'confirmedAt', 'remainingMutableTargets'])
    || !DIGEST.test(evidence.cleanup.manifestDigest)
    || !requireTimestamp(evidence.cleanup.confirmedAt)
    || !Number.isSafeInteger(evidence.cleanup.remainingMutableTargets)
    || evidence.cleanup.remainingMutableTargets < 0) {
    throw new Error('crm_search_evidence_schema_invalid')
  }
  return evidence
}

export function createEvidenceBundle(evidence, signing) {
  if (!exactKeys(evidence, [
    'issuedAt', 'environment', 'implementationGitSha', 'artifact', 'resource',
    'approval', 'neon', 'sealedHoldout', 'cleanup'
  ])) throw new Error('crm_search_evidence_schema_invalid')
  requireEvidence(evidence)
  if (!KEY_VERSION.test(signing?.keyVersion || '') || !signing?.privateKey) {
    throw new Error('crm_search_evidence_signer_required')
  }
  const bytes = Buffer.from(canonical(evidence), 'utf8')
  return Object.freeze({
    version: 'crm-search-release-evidence-v1',
    keyVersion: signing.keyVersion,
    evidence,
    evidenceBundleHash: createHash('sha256').update(bytes).digest('hex'),
    signature: sign(null, bytes, signing.privateKey).toString('base64url')
  })
}

export function verifyEvidenceBundle(bundle, keyring) {
  if (!exactKeys(bundle, ['version', 'keyVersion', 'evidence', 'evidenceBundleHash', 'signature'])
    || bundle.version !== 'crm-search-release-evidence-v1'
    || !KEY_VERSION.test(bundle.keyVersion || '')
    || !DIGEST.test(bundle.evidenceBundleHash || '')
    || !exactKeys(keyring, ['version', 'activeKeyVersion', 'keys'])
    || keyring.version !== 'crm-search-evidence-verification-keyring-v1'
    || keyring.activeKeyVersion !== bundle.keyVersion) {
    throw new Error('crm_search_evidence_envelope_invalid')
  }
  const encodedKey = keyring.keys?.[bundle.keyVersion]
  if (typeof encodedKey !== 'string' || encodedKey.length > 512) {
    throw new Error('crm_search_evidence_key_unavailable')
  }
  requireEvidence(bundle.evidence)
  const bytes = Buffer.from(canonical(bundle.evidence), 'utf8')
  if (createHash('sha256').update(bytes).digest('hex') !== bundle.evidenceBundleHash) {
    throw new Error('crm_search_evidence_digest_mismatch')
  }
  let valid
  try {
    valid = verify(null, bytes, createPublicKey({
      key: Buffer.from(encodedKey, 'base64url'), type: 'spki', format: 'der'
    }), Buffer.from(bundle.signature, 'base64url'))
  } catch {
    throw new Error('crm_search_evidence_key_invalid')
  }
  if (!valid) throw new Error('crm_search_evidence_signature_invalid')
  return bundle.evidence
}

export function verifyReleaseEvidenceForApproval(bundle, keyring, context) {
  const evidence = verifyEvidenceBundle(bundle, keyring)
  const { approval, artifact } = context
  if (bundle.evidenceBundleHash !== approval.evidenceBundleHash
    || evidence.environment !== approval.environment
    || evidence.implementationGitSha !== approval.implementationGitSha
    || evidence.artifact.manifestDigest !== artifact.artifactManifestDigest
    || evidence.artifact.pagesBundleDigest !== artifact.pagesBundleDigest
    || evidence.artifact.workerBundleDigest !== artifact.workerBundleDigest
    || evidence.artifact.bindingManifestDigest !== approval.bindingManifestDigest
    || evidence.approval.id !== approval.approvalId
    || evidence.approval.revision !== approval.approvalRevision
    || evidence.approval.type !== approval.type
    || evidence.approval.expiresAt !== approval.expiresAt) {
    throw new Error('crm_search_release_evidence_drift')
  }
  if (context.mode === 'production'
    && (evidence.sealedHoldout.productionReady !== true
      || evidence.cleanup.remainingMutableTargets !== 0)) {
    throw new Error('crm_search_release_evidence_not_ready')
  }
  return evidence
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ status: 'evidence-plan-only', mutationCount: 0 }))
  } else {
    const args = process.argv.slice(2)
    const value = (name) => {
      const index = args.indexOf(name)
      return index >= 0 ? args[index + 1] : undefined
    }
    const inputPath = path.resolve(value('--input') || '')
    const outputPath = path.resolve(value('--output') || '')
    const privateKeyPem = process.env.CRM_SEARCH_EVIDENCE_SIGNING_PRIVATE_KEY_PEM
    const keyVersion = process.env.CRM_SEARCH_EVIDENCE_SIGNING_KEY_VERSION
    if (!args.includes('--sign') || !inputPath || !outputPath || !privateKeyPem || !keyVersion) {
      throw new Error('crm_search_evidence_dry_run_required')
    }
    const evidence = JSON.parse(readFileSync(inputPath, 'utf8'))
    const bundle = createEvidenceBundle(evidence, {
      keyVersion, privateKey: createPrivateKey(privateKeyPem)
    })
    writeFileSync(outputPath, `${JSON.stringify(bundle)}\n`, { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({
      status: 'signed', mutationCount: 0, evidenceBundleHash: bundle.evidenceBundleHash
    }))
  }
}
