import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  canonicalPreviewAuthorizationPayload,
  verifyPreviewExecutionAuthorizationEnvelope
} from '../../scripts/crm-search/preview-execution-authorization.mjs'

const digest = (character: string) => character.repeat(64)
const sha = 'a'.repeat(40)
const accountId = 'a5b299b3ad15c1b5b895dc66f9357b17'
const neonProjectId = 'square-tooth-23821574'
const neonParentBranchId = 'br-small-hall-a4qtwjgo'

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const payload = {
    version: 'crm-search-preview-execution-authorization-v1',
    approvalId: '10000000-0000-4000-8000-000000000001',
    environment: 'preview',
    implementationSha: sha,
    artifactManifestDigest: digest('b'),
    bindingManifestDigest: digest('c'),
    resourceReadbackDigest: digest('d'),
    neonAttestationDigest: digest('e'),
    cloudflareAccountId: accountId,
    neonProjectId,
    neonParentBranchId,
    pagesProject: 'agency-dashboard',
    adapterDigest: digest('f'),
    reason: 'Isolated final-SHA CRM search verification with mandatory cleanup',
    issuedAt: '2026-08-11T00:00:00.000Z',
    expiresAt: '2026-08-11T00:15:00.000Z'
  }
  const signature = sign(
    null,
    Buffer.from(canonicalPreviewAuthorizationPayload(payload), 'utf8'),
    privateKey
  ).toString('base64url')
  return {
    payload,
    envelope: {
      version: 'crm-search-preview-execution-authorization-envelope-v1',
      keyId: 'preview-release-v1',
      payload,
      signature
    },
    keyring: {
      version: 'crm-search-preview-execution-keyring-v1',
      activeKeyId: 'preview-release-v1',
      keys: [{
        keyId: 'preview-release-v1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
      }]
    }
  }
}

describe('CRM search preview execution authorization', () => {
  it('verifies an active Ed25519 envelope bound to the exact preview account, project, branch, artifact, and adapter', () => {
    const input = fixture()

    expect(verifyPreviewExecutionAuthorizationEnvelope(input.envelope, {
      keyring: input.keyring,
      nowMs: Date.parse('2026-08-11T00:05:00.000Z'),
      expected: {
        cloudflareAccountId: accountId,
        neonProjectId,
        neonParentBranchId,
        pagesProject: 'agency-dashboard',
        implementationSha: sha,
        artifactManifestDigest: digest('b'),
        bindingManifestDigest: digest('c'),
        resourceReadbackDigest: digest('d'),
        neonAttestationDigest: digest('e'),
        adapterDigest: digest('f')
      }
    })).toEqual(input.payload)
  })

  it('rejects tampering, inactive keys, expired authority, and target or adapter drift', () => {
    const input = fixture()
    const verify = (overrides: Record<string, unknown> = {}) => (
      verifyPreviewExecutionAuthorizationEnvelope(input.envelope, {
        keyring: input.keyring,
        nowMs: Date.parse('2026-08-11T00:05:00.000Z'),
        expected: {
          cloudflareAccountId: accountId,
          neonProjectId,
          neonParentBranchId,
          pagesProject: 'agency-dashboard',
          implementationSha: sha,
          artifactManifestDigest: digest('b'),
          bindingManifestDigest: digest('c'),
          resourceReadbackDigest: digest('d'),
          neonAttestationDigest: digest('e'),
          adapterDigest: digest('f'),
          ...overrides
        }
      })
    )

    expect(() => verify({ cloudflareAccountId: '0'.repeat(32) }))
      .toThrow('crm_search_preview_authorization_target_drift')
    expect(() => verify({ adapterDigest: digest('0') }))
      .toThrow('crm_search_preview_authorization_target_drift')
    expect(() => verifyPreviewExecutionAuthorizationEnvelope({
      ...input.envelope,
      payload: {
        ...input.payload,
        reason: 'Tampered isolated CRM search preview authorization reason'
      }
    }, {
      keyring: input.keyring,
      nowMs: Date.parse('2026-08-11T00:05:00.000Z'),
      expected: { ...input.payload }
    })).toThrow('crm_search_preview_authorization_signature_invalid')
    expect(() => verifyPreviewExecutionAuthorizationEnvelope(input.envelope, {
      keyring: { ...input.keyring, activeKeyId: 'rotated-key' },
      nowMs: Date.parse('2026-08-11T00:05:00.000Z'),
      expected: { ...input.payload }
    })).toThrow('crm_search_preview_authorization_key_invalid')
    expect(() => verifyPreviewExecutionAuthorizationEnvelope(input.envelope, {
      keyring: input.keyring,
      nowMs: Date.parse('2026-08-11T00:15:00.000Z'),
      expected: { ...input.payload }
    })).toThrow('crm_search_preview_authorization_expired')
  })
})
