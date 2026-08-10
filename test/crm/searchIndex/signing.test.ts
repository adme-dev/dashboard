import { describe, expect, it } from 'vitest'

import {
  CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  CRM_SEARCH_PROCESS_PATH,
  type CrmSearchIndexQueueMessage
} from '../../../shared/crmSearchIndexProtocol'
import {
  CRM_SEARCH_CANONICAL_SIGNING_MAX_BYTES,
  CRM_SEARCH_SERVICE_KEY_BYTES,
  CRM_SEARCH_SERVICE_KEY_MAX_OVERLAP_SECONDS,
  CRM_SEARCH_SERVICE_REQUEST_MAX_AGE_SECONDS,
  canonicalCrmSearchServiceRequest,
  createCrmSearchSignedServiceRequest,
  extractCrmSearchServiceRequest,
  signCrmSearchServiceRequest,
  verifyCrmSearchServiceRequest,
  type CrmSearchServiceKeyring
} from '../../../shared/crmSearchIndexSigning'

const NOW_SEC = 2_000_000_000
const NOW_MS = NOW_SEC * 1000
const operationId = '11111111-1111-4111-8111-111111111111'
const correlationId = '22222222-2222-4222-8222-222222222222'
const activeSecret = Buffer.alloc(CRM_SEARCH_SERVICE_KEY_BYTES, 0x11).toString('base64url')
const previousSecret = Buffer.alloc(CRM_SEARCH_SERVICE_KEY_BYTES, 0x22).toString('base64url')

const queueMessage: CrmSearchIndexQueueMessage = {
  protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  operationId,
  correlationId,
  enqueuedAt: new Date(NOW_MS).toISOString()
}

function activeKeyring(overrides: Partial<CrmSearchServiceKeyring> = {}): CrmSearchServiceKeyring {
  return {
    activeKeyVersion: 'k1',
    keys: {
      k1: {
        keyVersion: 'k1',
        secret: activeSecret,
        status: 'active',
        notBefore: NOW_SEC - 60,
        notAfter: NOW_SEC + 86_400
      }
    },
    ...overrides
  }
}

describe('CRM search queue-to-Pages request signing', () => {
  it('binds method, exact path, timestamp, operation, correlation, protocol, and body digest', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring(),
      { nowMs: NOW_MS }
    )
    const request = extractCrmSearchServiceRequest(
      signed.headers,
      signed.body,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )

    expect(request).not.toBeNull()
    expect(await verifyCrmSearchServiceRequest(request!, activeKeyring(), { nowMs: NOW_MS })).toBe(true)
    expect(Buffer.byteLength(canonicalCrmSearchServiceRequest(request!), 'utf8'))
      .toBeLessThanOrEqual(CRM_SEARCH_CANONICAL_SIGNING_MAX_BYTES)
    expect(canonicalCrmSearchServiceRequest(request!)).toContain(
      'POST\n/api/internal/crm-search/process\n2000000000\n'
      + `${operationId}\n${correlationId}\n1\n`
    )
  })

  it('rejects every tampered signed coordinate and the exact-path cross-route replay', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring(),
      { nowMs: NOW_MS }
    )
    const request = extractCrmSearchServiceRequest(
      signed.headers,
      signed.body,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )!

    const mutations = [
      { ...request, method: 'GET' as const },
      { ...request, path: '/api/internal/crm-search/dead-letter' as const },
      { ...request, timestamp: String(NOW_SEC - 1) },
      { ...request, operationId: '33333333-3333-4333-8333-333333333333' },
      { ...request, correlationId: '44444444-4444-4444-8444-444444444444' },
      { ...request, protocolVersion: 2 },
      { ...request, bodyDigest: '0'.repeat(64) },
      { ...request, body: `${request.body} ` }
    ]

    for (const mutation of mutations) {
      expect(await verifyCrmSearchServiceRequest(mutation, activeKeyring(), { nowMs: NOW_MS }))
        .toBe(false)
    }
  })

  it('signs only with the active key and accepts the previous key only inside bounded overlap', async () => {
    const oldKeyring: CrmSearchServiceKeyring = {
      activeKeyVersion: 'k0',
      keys: {
        k0: {
          keyVersion: 'k0',
          secret: previousSecret,
          status: 'active',
          notBefore: NOW_SEC - 86_400,
          notAfter: NOW_SEC + 86_400
        }
      }
    }
    const oldSigned = await createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      oldKeyring,
      { nowMs: NOW_MS }
    )
    const rotated: CrmSearchServiceKeyring = {
      activeKeyVersion: 'k1',
      keys: {
        k1: activeKeyring().keys.k1!,
        k0: {
          keyVersion: 'k0',
          secret: previousSecret,
          status: 'previous',
          notBefore: NOW_SEC - 86_400,
          notAfter: NOW_SEC + 86_400,
          overlapUntil: NOW_SEC + CRM_SEARCH_SERVICE_KEY_MAX_OVERLAP_SECONDS - 60
        }
      }
    }
    const oldRequest = extractCrmSearchServiceRequest(
      oldSigned.headers,
      oldSigned.body,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )!
    const newSigned = await createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      rotated,
      { nowMs: NOW_MS }
    )

    expect(newSigned.headers['x-xeroflow-crm-search-key-version']).toBe('k1')
    expect(await verifyCrmSearchServiceRequest(oldRequest, rotated, { nowMs: NOW_MS })).toBe(true)
    expect(await verifyCrmSearchServiceRequest(oldRequest, {
      ...rotated,
      keys: {
        ...rotated.keys,
        k0: { ...rotated.keys.k0!, overlapUntil: NOW_SEC - 1 }
      }
    }, { nowMs: NOW_MS })).toBe(false)
    expect(await verifyCrmSearchServiceRequest(oldRequest, {
      ...rotated,
      keys: {
        ...rotated.keys,
        k0: {
          keyVersion: 'k0',
          secret: previousSecret,
          status: 'retired',
          notBefore: NOW_SEC - 86_400,
          notAfter: NOW_SEC + 86_400
        }
      }
    }, { nowMs: NOW_MS })).toBe(false)
  })

  it('rejects premature, expired, oversized-overlap, and malformed key material', async () => {
    await expect(createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring({
        keys: {
          k1: { ...activeKeyring().keys.k1!, notBefore: NOW_SEC + 1 }
        }
      }),
      { nowMs: NOW_MS }
    )).rejects.toThrow(/active key/i)

    await expect(createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring({
        keys: {
          k1: { ...activeKeyring().keys.k1!, notAfter: NOW_SEC - 1 }
        }
      }),
      { nowMs: NOW_MS }
    )).rejects.toThrow(/active key/i)

    await expect(createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring({
        keys: {
          k1: { ...activeKeyring().keys.k1!, secret: 'not-32-byte-base64url' }
        }
      }),
      { nowMs: NOW_MS }
    )).rejects.toThrow(/keyring|key material/i)

    const oldSigned = await createCrmSearchSignedServiceRequest(queueMessage, CRM_SEARCH_PROCESS_PATH, {
      activeKeyVersion: 'k0',
      keys: {
        k0: {
          keyVersion: 'k0',
          secret: previousSecret,
          status: 'active',
          notBefore: NOW_SEC - 86_400,
          notAfter: NOW_SEC + 86_400
        }
      }
    }, { nowMs: NOW_MS })
    const oldRequest = extractCrmSearchServiceRequest(
      oldSigned.headers,
      oldSigned.body,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )!
    const oversizedOverlap: CrmSearchServiceKeyring = {
      activeKeyVersion: 'k1',
      keys: {
        k1: activeKeyring().keys.k1!,
        k0: {
          keyVersion: 'k0',
          secret: previousSecret,
          status: 'previous',
          notBefore: NOW_SEC - 86_400,
          notAfter: NOW_SEC + 86_400,
          overlapUntil: NOW_SEC + CRM_SEARCH_SERVICE_KEY_MAX_OVERLAP_SECONDS + 1
        }
      }
    }
    expect(await verifyCrmSearchServiceRequest(oldRequest, oversizedOverlap, { nowMs: NOW_MS }))
      .toBe(false)

    const activeSigned = await createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring(),
      { nowMs: NOW_MS }
    )
    const activeRequest = extractCrmSearchServiceRequest(
      activeSigned.headers,
      activeSigned.body,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )!
    expect(await verifyCrmSearchServiceRequest({
      ...activeRequest,
      keyVersion: 'unknown'
    }, activeKeyring(), { nowMs: NOW_MS })).toBe(false)
    expect(await verifyCrmSearchServiceRequest(activeRequest, activeKeyring({
      keys: {
        k1: { ...activeKeyring().keys.k1!, notBefore: NOW_SEC + 1 }
      }
    }), { nowMs: NOW_MS })).toBe(false)
    expect(await verifyCrmSearchServiceRequest(activeRequest, activeKeyring({
      keys: {
        k1: { ...activeKeyring().keys.k1!, notAfter: NOW_SEC }
      }
    }), { nowMs: NOW_MS })).toBe(false)
  })

  it('treats key validity and rotation overlap as half-open windows', async () => {
    await expect(createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring({
        keys: {
          k1: { ...activeKeyring().keys.k1!, notAfter: NOW_SEC }
        }
      }),
      { nowMs: NOW_MS }
    )).rejects.toThrow(/active key/i)

    const oldSigned = await createCrmSearchSignedServiceRequest(
      { ...queueMessage, enqueuedAt: new Date(NOW_MS - 1000).toISOString() },
      CRM_SEARCH_PROCESS_PATH,
      {
        activeKeyVersion: 'k0',
        keys: {
          k0: {
            keyVersion: 'k0',
            secret: previousSecret,
            status: 'active',
            notBefore: NOW_SEC - 86_400,
            notAfter: NOW_SEC + 86_400
          }
        }
      },
      { nowMs: NOW_MS - 1000 }
    )
    const oldRequest = extractCrmSearchServiceRequest(
      oldSigned.headers,
      oldSigned.body,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )!
    const rotated: CrmSearchServiceKeyring = {
      activeKeyVersion: 'k1',
      keys: {
        k1: {
          ...activeKeyring().keys.k1!,
          notBefore: NOW_SEC - 60,
          notAfter: NOW_SEC + 86_400
        },
        k0: {
          keyVersion: 'k0',
          secret: previousSecret,
          status: 'previous',
          notBefore: NOW_SEC - 86_400,
          notAfter: NOW_SEC + 86_400,
          overlapUntil: NOW_SEC
        }
      }
    }

    expect(await verifyCrmSearchServiceRequest(oldRequest, rotated, { nowMs: NOW_MS }))
      .toBe(false)
  })

  it('rejects noncanonical signed header representations', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring(),
      { nowMs: NOW_MS }
    )

    expect(extractCrmSearchServiceRequest({
      ...signed.headers,
      'x-xeroflow-crm-search-protocol': '01'
    }, signed.body, 'POST', CRM_SEARCH_PROCESS_PATH)).toBeNull()
    expect(extractCrmSearchServiceRequest({
      ...signed.headers,
      'x-xeroflow-crm-search-operation-id': ` ${operationId}`
    }, signed.body, 'POST', CRM_SEARCH_PROCESS_PATH)).toBeNull()
  })

  it('accepts only an explicitly configured current/N-1 protocol pair', async () => {
    const body = JSON.stringify(queueMessage)
    const headers = await signCrmSearchServiceRequest({
      method: 'POST',
      path: CRM_SEARCH_PROCESS_PATH,
      timestamp: String(NOW_SEC),
      operationId,
      correlationId,
      protocolVersion: 2,
      body
    }, activeKeyring(), { nowMs: NOW_MS })
    const request = extractCrmSearchServiceRequest(
      headers,
      body,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )!

    expect(await verifyCrmSearchServiceRequest(request, activeKeyring(), { nowMs: NOW_MS }))
      .toBe(false)
    expect(await verifyCrmSearchServiceRequest(request, activeKeyring(), {
      nowMs: NOW_MS,
      acceptedProtocolVersions: [2, 1]
    })).toBe(true)
    expect(await verifyCrmSearchServiceRequest(request, activeKeyring(), {
      nowMs: NOW_MS,
      acceptedProtocolVersions: [2]
    })).toBe(false)
  })

  it('rejects signatures outside the narrow service-request freshness window', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      queueMessage,
      CRM_SEARCH_PROCESS_PATH,
      activeKeyring(),
      { nowMs: NOW_MS }
    )
    const request = extractCrmSearchServiceRequest(
      signed.headers,
      signed.body,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )!

    expect(await verifyCrmSearchServiceRequest(request, activeKeyring(), {
      nowMs: NOW_MS + (CRM_SEARCH_SERVICE_REQUEST_MAX_AGE_SECONDS + 1) * 1000
    })).toBe(false)
  })

  it('authenticates a deliberately signed noncanonical body but leaves schema rejection to the endpoint', async () => {
    const rawBody = JSON.stringify({ ...queueMessage, sourceText: 'never load this' })
    const headers = await signCrmSearchServiceRequest({
      method: 'POST',
      path: CRM_SEARCH_PROCESS_PATH,
      timestamp: String(NOW_SEC),
      operationId,
      correlationId,
      protocolVersion: 1,
      body: rawBody
    }, activeKeyring(), { nowMs: NOW_MS })
    const request = extractCrmSearchServiceRequest(
      headers,
      rawBody,
      'POST',
      CRM_SEARCH_PROCESS_PATH
    )!

    expect(await verifyCrmSearchServiceRequest(request, activeKeyring(), { nowMs: NOW_MS })).toBe(true)
  })
})
