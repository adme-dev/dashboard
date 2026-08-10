import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  canonicalCrmSearchBootstrapApprovalPayload,
  verifyCrmSearchBootstrapApprovalEnvelope
} from '~~/server/utils/crm/search/operations/bootstrapApproval'

const NOW_MS = Date.parse('2026-08-11T01:00:00.000Z')

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const payload = {
    type: 'resource_provision',
    environment: 'production',
    originalTimestamp: '2026-08-11T00:00:00.000Z',
    expiresAt: '2026-08-12T00:00:00.000Z',
    implementationGitSha: 'a'.repeat(40),
    artifactManifestDigest: 'b'.repeat(64),
    bindingManifestDigest: 'c'.repeat(64),
    evidenceBundleHash: 'd'.repeat(64),
    organisationScopeId: '20000000-0000-4000-8000-000000000001',
    requestedByActorId: '10000000-0000-4000-8000-000000000001',
    approvedBy: '30000000-0000-4000-8000-000000000001',
    maximumCostUsdMicros: 25_000_000,
    clientIds: [],
    reason: 'Approve exact CRM search production resources'
  } as const
  const signature = sign(
    null,
    canonicalCrmSearchBootstrapApprovalPayload(payload),
    privateKey
  ).toString('base64url')
  return {
    envelope: {
      version: 'crm-search-bootstrap-approval-envelope-v1',
      keyVersion: 'release-2026-08',
      payload,
      signature
    },
    keyring: JSON.stringify({
      version: 'crm-search-bootstrap-verification-keyring-v1',
      activeKeyVersion: 'release-2026-08',
      keys: {
        'release-2026-08': {
          algorithm: 'Ed25519',
          publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
          notBefore: '2026-08-10T00:00:00.000Z',
          notAfter: '2026-08-20T00:00:00.000Z'
        }
      }
    })
  }
}

describe('CRM search bootstrap resource approval envelope', () => {
  it('trusts only the active Ed25519 key and derives provenance from canonical bytes', async () => {
    const { envelope, keyring } = fixture()
    await expect(verifyCrmSearchBootstrapApprovalEnvelope(envelope, {
      keyring,
      nowMs: NOW_MS
    })).resolves.toMatchObject({
      approvalType: 'resource_provision',
      issuedAt: '2026-08-11T00:00:00.000Z',
      importedProvenanceHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
  })

  it('rejects unsigned, tampered, expired, retired and malformed-key envelopes', async () => {
    const { envelope, keyring } = fixture()
    const cases = [
      { ...envelope, signature: '' },
      { ...envelope, payload: { ...envelope.payload, maximumCostUsdMicros: 25_000_001 } },
      { ...envelope, keyVersion: 'retired-key' }
    ]
    for (const candidate of cases) {
      await expect(verifyCrmSearchBootstrapApprovalEnvelope(candidate, {
        keyring,
        nowMs: NOW_MS
      })).rejects.toThrow(/crm_search_bootstrap_/)
    }
    await expect(verifyCrmSearchBootstrapApprovalEnvelope(envelope, {
      keyring,
      nowMs: Date.parse('2026-08-21T00:00:00.000Z')
    })).rejects.toThrow('crm_search_bootstrap_key_unavailable')
    await expect(verifyCrmSearchBootstrapApprovalEnvelope(envelope, {
      keyring: JSON.stringify({ version: 'wrong', keys: {} }),
      nowMs: NOW_MS
    })).rejects.toThrow('crm_search_bootstrap_keyring_invalid')
  })
})
