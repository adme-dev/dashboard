import { describe, expect, it, vi } from 'vitest'

import {
  CRM_SEARCH_PROCESS_PATH,
  type CrmSearchIndexQueueMessage
} from '../../../shared/crmSearchIndexProtocol'
import {
  CRM_SEARCH_SERVICE_KEY_BYTES,
  createCrmSearchSignedServiceRequest,
  signCrmSearchServiceRequest,
  type CrmSearchServiceKeyring
} from '../../../shared/crmSearchIndexSigning'
import {
  createCrmSearchProcessPostHandler,
  resolveCrmSearchServiceKeyring
} from '../../../server/api/internal/crm-search/process.post'

const NOW_SEC = 2_000_000_000
const NOW_MS = NOW_SEC * 1000
const operationId = '11111111-1111-4111-8111-111111111111'
const correlationId = '22222222-2222-4222-8222-222222222222'
const secret = Buffer.alloc(CRM_SEARCH_SERVICE_KEY_BYTES, 0x33).toString('base64url')

const keyring: CrmSearchServiceKeyring = {
  activeKeyVersion: 'k1',
  keys: {
    k1: {
      keyVersion: 'k1',
      secret,
      status: 'active',
      notBefore: NOW_SEC - 60,
      notAfter: NOW_SEC + 60
    }
  }
}

const message: CrmSearchIndexQueueMessage = {
  protocolVersion: 1,
  operationId,
  correlationId,
  enqueuedAt: new Date(NOW_MS).toISOString()
}

async function signedRequest() {
  return await createCrmSearchSignedServiceRequest(message, CRM_SEARCH_PROCESS_PATH, keyring, {
    nowMs: NOW_MS
  })
}

describe('POST /api/internal/crm-search/process', () => {
  it('authenticates, reserves idempotency, then delegates the identifier-only operation', async () => {
    const signed = await signedRequest()
    const calls: string[] = []
    const log = vi.fn()
    const handler = createCrmSearchProcessPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async (input) => {
        calls.push(`reserve:${input.idempotencyKey}`)
        return { status: 'reserved' }
      },
      processOperation: async (input) => {
        calls.push(`process:${input.operationId}`)
        return { status: 'accepted_provider_pending' }
      },
      now: () => NOW_MS,
      log
    })

    await expect(handler({ context: {} } as never)).resolves.toEqual({
      status: 'accepted_provider_pending'
    })
    expect(calls).toEqual([
      `reserve:crm-search-service:v1:process:${operationId}`,
      `process:${operationId}`
    ])
    expect(log).toHaveBeenCalledWith({
      event: 'crm_search_process',
      operationId,
      correlationId,
      protocolVersion: 1,
      status: 'accepted_provider_pending'
    })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|source|body|client|organisation/i)
  })

  it('rejects invalid authentication before replay reservation or operation loading', async () => {
    const signed = await signedRequest()
    signed.headers['x-xeroflow-crm-search-operation-id']
      = '33333333-3333-4333-8333-333333333333'
    const reserveRequest = vi.fn()
    const processOperation = vi.fn()
    const handler = createCrmSearchProcessPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest,
      processOperation,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(reserveRequest).not.toHaveBeenCalled()
    expect(processOperation).not.toHaveBeenCalled()
  })

  it('returns only a previously durable replay outcome without loading provider work again', async () => {
    const signed = await signedRequest()
    const processOperation = vi.fn()
    const handler = createCrmSearchProcessPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({
        status: 'replay',
        outcome: { status: 'accepted_provider_pending' }
      }),
      processOperation,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).resolves.toEqual({
      status: 'accepted_provider_pending'
    })
    expect(processOperation).not.toHaveBeenCalled()
  })

  it('keeps an unresolved in-flight reservation retryable instead of acknowledging it', async () => {
    const signed = await signedRequest()
    const processOperation = vi.fn()
    const handler = createCrmSearchProcessPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({ status: 'in_progress' }),
      processOperation,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(processOperation).not.toHaveBeenCalled()
  })

  it('fails closed on a malformed reservation result', async () => {
    const signed = await signedRequest()
    const processOperation = vi.fn()
    const handler = createCrmSearchProcessPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({ status: 'unexpected' }) as never,
      processOperation,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(processOperation).not.toHaveBeenCalled()
  })

  it('fails closed on a coercible malformed processor outcome', async () => {
    const signed = await signedRequest()
    const log = vi.fn()
    const handler = createCrmSearchProcessPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({ status: 'reserved' }),
      processOperation: async () => ({
        status: { toString: () => 'complete' }
      }) as never,
      now: () => NOW_MS,
      log
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(log).not.toHaveBeenCalled()
  })

  it('does not hide a malformed runtime key binding with a process-env fallback', () => {
    vi.stubEnv('CRM_SEARCH_SERVICE_KEYRING', JSON.stringify(keyring))
    try {
      expect(resolveCrmSearchServiceKeyring({
        context: {
          cloudflare: {
            env: { CRM_SEARCH_SERVICE_KEYRING: { malformed: true } }
          }
        }
      } as never)).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('uses one authenticated clock instant for signature and envelope checks', async () => {
    const signed = await signedRequest()
    const now = vi.fn(() => NOW_MS)
    const handler = createCrmSearchProcessPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({ status: 'reserved' }),
      processOperation: async () => ({ status: 'complete' }),
      now,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).resolves.toEqual({ status: 'complete' })
    expect(now).toHaveBeenCalledOnce()
  })

  it('rejects a validly signed envelope with extra fields before operation loading', async () => {
    const rawBody = JSON.stringify({ ...message, sourceText: 'private CRM source' })
    const headers = await signCrmSearchServiceRequest({
      method: 'POST',
      path: CRM_SEARCH_PROCESS_PATH,
      timestamp: String(NOW_SEC),
      operationId,
      correlationId,
      protocolVersion: 1,
      body: rawBody
    }, keyring, { nowMs: NOW_MS })
    const reserveRequest = vi.fn()
    const processOperation = vi.fn()
    const handler = createCrmSearchProcessPostHandler({
      readBody: async () => rawBody,
      getHeaders: () => headers,
      resolveKeyring: () => keyring,
      reserveRequest,
      processOperation,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(reserveRequest).not.toHaveBeenCalled()
    expect(processOperation).not.toHaveBeenCalled()
  })
})
