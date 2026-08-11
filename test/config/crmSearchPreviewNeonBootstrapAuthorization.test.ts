import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  assertFreshPreviewNeonBootstrapReadback,
  canonicalPreviewNeonBootstrapPayload,
  verifyPreviewNeonBootstrapAuthorization
} from '../../scripts/crm-search/preview-neon-bootstrap-authorization.mjs'

const migrationPaths = [
  'server/database/migrations/350_crm_search_expand.sql',
  'server/database/migrations/351_crm_search_validate_backfill.sql',
  'server/database/migrations/352_crm_search_activate_capture.sql'
]
const migrationDigests = Object.fromEntries(migrationPaths.map(path => [
  path,
  createHash('sha256').update(readFileSync(new URL(`../../${path}`, import.meta.url))).digest('hex')
]))
const implementationSha = 'a'.repeat(40)
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const keyring = {
  version: 'crm-search-preview-neon-bootstrap-keyring-v1',
  activeKeyId: 'preview-neon-ephemeral-v1',
  keys: [{
    keyId: 'preview-neon-ephemeral-v1',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
  }]
}
const payload = {
  version: 'crm-search-preview-neon-bootstrap-authorization-v1',
  approvalId: '10000000-0000-4000-8000-000000000001',
  environment: 'preview',
  implementationSha,
  neonProjectId: 'square-tooth-23821574',
  neonParentBranchId: 'br-small-hall-a4qtwjgo',
  organisationScopeId: '20000000-0000-4000-8000-000000000002',
  branchName: `crm-search-e2e-${implementationSha.slice(0, 12)}`,
  branchExpiresAt: '2026-08-11T06:00:00.000Z',
  migrationDigests,
  pagesPreviewDigest: 'b'.repeat(64),
  resourceReadbackDigest: 'c'.repeat(64),
  maximumCostUsdMicros: 0,
  cleanupRequired: true,
  reason: 'User-approved isolated preview migration proof with mandatory branch cleanup',
  issuedAt: '2026-08-11T00:00:00.000Z',
  expiresAt: '2026-08-11T00:20:00.000Z'
}

function envelope(nextPayload = payload) {
  return {
    version: 'crm-search-preview-neon-bootstrap-envelope-v1',
    keyId: 'preview-neon-ephemeral-v1',
    payload: nextPayload,
    signature: sign(
      null,
      Buffer.from(canonicalPreviewNeonBootstrapPayload(nextPayload), 'utf8'),
      privateKey
    ).toString('base64url')
  }
}

const expected = {
  implementationSha,
  neonProjectId: payload.neonProjectId,
  neonParentBranchId: payload.neonParentBranchId,
  organisationScopeId: payload.organisationScopeId,
  branchName: payload.branchName,
  branchExpiresAt: payload.branchExpiresAt,
  migrationDigests,
  pagesPreviewDigest: payload.pagesPreviewDigest,
  resourceReadbackDigest: payload.resourceReadbackDigest
}

describe('CRM search preview-only Neon bootstrap authorization', () => {
  it('verifies an exact short-lived Ed25519 authorization bound to preview targets and migration bytes', () => {
    expect(verifyPreviewNeonBootstrapAuthorization(envelope(), {
      keyring,
      expected,
      nowMs: Date.parse('2026-08-11T00:01:00.000Z')
    })).toEqual(payload)
  })

  it('rejects tampering, drift, unsafe lifetime, cost, or cleanup relaxation', () => {
    const mutations = [
      { ...payload, environment: 'production' },
      { ...payload, implementationSha: 'd'.repeat(40) },
      { ...payload, neonProjectId: 'other-project-12345678' },
      { ...payload, neonParentBranchId: 'br-other-branch-12345678' },
      { ...payload, branchName: 'crm-search-e2e-other' },
      { ...payload, issuedAt: '2026-08-11 00:00:00Z' },
      { ...payload, branchExpiresAt: '2026-08-12T00:00:00.000Z' },
      { ...payload, migrationDigests: { ...migrationDigests, [migrationPaths[0]!]: 'd'.repeat(64) } },
      { ...payload, maximumCostUsdMicros: 1 },
      { ...payload, cleanupRequired: false }
    ]
    for (const changed of mutations) {
      expect(() => verifyPreviewNeonBootstrapAuthorization(envelope(changed), {
        keyring,
        expected,
        nowMs: Date.parse('2026-08-11T00:01:00.000Z')
      })).toThrow(/crm_search_preview_neon_bootstrap_(invalid|target_drift)/u)
    }

    const tampered = envelope()
    tampered.payload = { ...payload, reason: 'Tampered after signature verification should fail closed' }
    expect(() => verifyPreviewNeonBootstrapAuthorization(tampered, {
      keyring,
      expected,
      nowMs: Date.parse('2026-08-11T00:01:00.000Z')
    })).toThrow('crm_search_preview_neon_bootstrap_signature_invalid')

    expect(() => verifyPreviewNeonBootstrapAuthorization(envelope(), {
      keyring,
      expected,
      nowMs: Date.parse(payload.expiresAt)
    })).toThrow('crm_search_preview_neon_bootstrap_expired')
  })

  it('requires a fresh active reread of the same signed envelope before every mutation phase', () => {
    const verified = verifyPreviewNeonBootstrapAuthorization(envelope(), {
      keyring,
      expected,
      nowMs: Date.parse('2026-08-11T00:01:00.000Z')
    })
    const readback = {
      source: 'local_ephemeral_approval',
      status: 'active',
      revokedAt: null,
      readbackAt: '2026-08-11T00:01:00.000Z',
      envelope: envelope()
    }
    expect(assertFreshPreviewNeonBootstrapReadback(readback, verified, {
      keyring,
      expected,
      nowMs: Date.parse(readback.readbackAt)
    })).toEqual({ ok: true })

    for (const changed of [
      { ...readback, status: 'revoked', revokedAt: readback.readbackAt },
      { ...readback, readbackAt: '2026-08-10T23:59:00.000Z' },
      { ...readback, envelope: envelope({ ...payload, reason: 'A different valid envelope must not replace the approved payload' }) }
    ]) {
      expect(() => assertFreshPreviewNeonBootstrapReadback(changed, verified, {
        keyring,
        expected,
        nowMs: Date.parse('2026-08-11T00:01:00.000Z')
      })).toThrow(/crm_search_preview_neon_bootstrap_(readback_invalid|revoked|readback_stale|target_drift)/u)
    }
  })
})
