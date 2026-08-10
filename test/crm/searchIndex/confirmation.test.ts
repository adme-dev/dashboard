import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  createCrmSearchConfirmationTag,
  parseCrmSearchConfirmationKeyring,
  type CrmSearchConfirmationKeyring
} from '../../../server/utils/crm/searchIndex/confirmation'
import {
  resolveCrmSearchConfirmationKeyring
} from '../../../server/utils/crm/searchIndex/bindings'

const secretBytes = Buffer.alloc(32, 0x42)
const secret = secretBytes.toString('base64url')
const keyring: CrmSearchConfirmationKeyring = {
  activeKeyVersion: 'confirm-v2',
  keys: Object.freeze({
    'confirm-v1': Buffer.alloc(32, 0x24).toString('base64url'),
    'confirm-v2': secret
  })
}
const input = {
  organisationScopeId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  vectorId: 'vector_id-123',
  schemaVersion: 'crm-search-v1',
  sourceRevision: 19,
  contentHash: 'a'.repeat(64)
}

function frame(parts: readonly string[]): string {
  const encoder = new TextEncoder()
  return parts.map(part => `${encoder.encode(part).byteLength}:${part}`).join('|')
}

describe('CRM search confirmation tags', () => {
  it('uses only the active dedicated key over the exact framed design tuple', async () => {
    const expectedMessage = frame([
      input.organisationScopeId,
      input.clientId,
      input.vectorId,
      input.schemaVersion,
      String(input.sourceRevision),
      input.contentHash
    ])
    const expected = createHmac('sha256', secretBytes)
      .update(expectedMessage)
      .digest('hex')

    await expect(createCrmSearchConfirmationTag(input, keyring)).resolves.toEqual({
      confirmationTag: `hmac-sha256:${expected}`,
      confirmationKeyVersion: 'confirm-v2'
    })
  })

  it.each([
    ['organisationScopeId', '33333333-3333-4333-8333-333333333333'],
    ['clientId', '44444444-4444-4444-8444-444444444444'],
    ['vectorId', 'different-vector'],
    ['schemaVersion', 'crm-search-v2'],
    ['sourceRevision', 20],
    ['contentHash', 'b'.repeat(64)]
  ] as const)('binds the %s tuple field', async (field, value) => {
    const original = await createCrmSearchConfirmationTag(input, keyring)
    const changed = await createCrmSearchConfirmationTag({
      ...input,
      [field]: value
    }, keyring)
    expect(changed.confirmationTag).not.toBe(original.confirmationTag)
  })

  it('strictly parses a bounded version-to-secret keyring without exposing secret material', () => {
    const parsed = parseCrmSearchConfirmationKeyring(JSON.stringify(keyring))
    expect(parsed).toEqual(keyring)
    expect(parsed).not.toBe(keyring)
    expect(Object.getPrototypeOf(parsed!.keys)).toBeNull()
  })

  it.each([
    null,
    {},
    { ...keyring, unexpected: true },
    { activeKeyVersion: 'missing', keys: keyring.keys },
    { activeKeyVersion: 'confirm-v2', keys: {} },
    {
      activeKeyVersion: 'confirm-v2',
      keys: { ...keyring.keys, 'bad version': secret }
    },
    {
      activeKeyVersion: 'confirm-v2',
      keys: { ...keyring.keys, 'confirm-v3': secret }
    },
    {
      activeKeyVersion: 'confirm-v2',
      keys: { ...keyring.keys, 'confirm-v2': 'too-short' }
    }
  ])('rejects malformed, aliased, or ambiguous key material: %o', (value) => {
    expect(parseCrmSearchConfirmationKeyring(value)).toBeNull()
  })

  it('rejects accessor-backed key material without evaluating it', () => {
    let reads = 0
    const keys = Object.create(null) as Record<string, unknown>
    Object.defineProperty(keys, 'confirm-v2', {
      enumerable: true,
      get() {
        reads += 1
        return secret
      }
    })

    expect(parseCrmSearchConfirmationKeyring({
      activeKeyVersion: 'confirm-v2',
      keys
    })).toBeNull()
    expect(reads).toBe(0)
  })

  it('rejects malformed tuple fields before importing key material', async () => {
    await expect(createCrmSearchConfirmationTag({
      ...input,
      contentHash: 'raw-source-text'
    }, keyring)).rejects.toThrow('CRM search confirmation input')
  })

  it('uses the exact deployed confirmation binding and rejects malformed binding shadowing', () => {
    process.env.CRM_SEARCH_CONFIRMATION_KEYRING = JSON.stringify(keyring)
    expect(resolveCrmSearchConfirmationKeyring({
      context: {
        cloudflare: { env: { CRM_SEARCH_CONFIRMATION_KEYRING: JSON.stringify(keyring) } }
      }
    } as never)).toEqual(keyring)
    expect(resolveCrmSearchConfirmationKeyring({
      context: { cloudflare: { env: { CRM_SEARCH_CONFIRMATION_KEYRING: 123 } } }
    } as never)).toBeNull()
    delete process.env.CRM_SEARCH_CONFIRMATION_KEYRING
  })
})
