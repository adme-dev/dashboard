import { describe, expect, it, vi } from 'vitest'

import {
  CRM_SEARCH_DEAD_LETTER_PATH,
  CRM_SEARCH_PROCESS_PATH,
  type CrmSearchIndexQueueMessage
} from '../../../shared/crmSearchIndexProtocol'
import {
  CRM_SEARCH_SERVICE_KEY_BYTES,
  createCrmSearchSignedServiceRequest,
  type CrmSearchServiceKeyring
} from '../../../shared/crmSearchIndexSigning'
import {
  createCrmSearchDeadLetterPostHandler
} from '../../../server/api/internal/crm-search/dead-letter.post'

const NOW_SEC = 2_000_000_000
const NOW_MS = NOW_SEC * 1000
const operationId = '11111111-1111-4111-8111-111111111111'
const correlationId = '22222222-2222-4222-8222-222222222222'
const secret = Buffer.alloc(CRM_SEARCH_SERVICE_KEY_BYTES, 0x44).toString('base64url')

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

describe('POST /api/internal/crm-search/dead-letter', () => {
  it('uses the same auth/idempotency order before durable dead-letter recording', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      message,
      CRM_SEARCH_DEAD_LETTER_PATH,
      keyring,
      { nowMs: NOW_MS }
    )
    const calls: string[] = []
    const log = vi.fn()
    const handler = createCrmSearchDeadLetterPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async (input) => {
        calls.push(`reserve:${input.idempotencyKey}`)
        return { status: 'reserved' }
      },
      recordDeadLetter: async (input) => {
        calls.push(`record:${input.operationId}`)
        return { status: 'recorded' }
      },
      now: () => NOW_MS,
      log
    })

    await expect(handler({ context: {} } as never)).resolves.toEqual({ status: 'recorded' })
    expect(calls).toEqual([
      `reserve:crm-search-service:v1:dead-letter:${operationId}`,
      `record:${operationId}`
    ])
    expect(log).toHaveBeenCalledWith({
      event: 'crm_search_dead_letter',
      operationId,
      correlationId,
      protocolVersion: 1,
      status: 'recorded'
    })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|source|body|client|organisation|error/i)
  })

  it('rejects a process-path signature on the dead-letter path before any durable lookup', async () => {
    const signedForProcess = await createCrmSearchSignedServiceRequest(
      message,
      CRM_SEARCH_PROCESS_PATH,
      keyring,
      { nowMs: NOW_MS }
    )
    const reserveRequest = vi.fn()
    const recordDeadLetter = vi.fn()
    const handler = createCrmSearchDeadLetterPostHandler({
      readBody: async () => signedForProcess.body,
      getHeaders: () => signedForProcess.headers,
      resolveKeyring: () => keyring,
      reserveRequest,
      recordDeadLetter,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(reserveRequest).not.toHaveBeenCalled()
    expect(recordDeadLetter).not.toHaveBeenCalled()
  })

  it('returns a previously durable terminal outcome without recording the same DLQ origin twice', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      message,
      CRM_SEARCH_DEAD_LETTER_PATH,
      keyring,
      { nowMs: NOW_MS }
    )
    const recordDeadLetter = vi.fn()
    const handler = createCrmSearchDeadLetterPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({
        status: 'replay',
        outcome: { status: 'recorded' }
      }),
      recordDeadLetter,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).resolves.toEqual({ status: 'recorded' })
    expect(recordDeadLetter).not.toHaveBeenCalled()
  })

  it('fails closed on a malformed reservation result', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      message,
      CRM_SEARCH_DEAD_LETTER_PATH,
      keyring,
      { nowMs: NOW_MS }
    )
    const recordDeadLetter = vi.fn()
    const handler = createCrmSearchDeadLetterPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({ status: 'unexpected' }) as never,
      recordDeadLetter,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(recordDeadLetter).not.toHaveBeenCalled()
  })

  it('rejects a recorder outcome with a custom prototype or inherited toJSON', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      message,
      CRM_SEARCH_DEAD_LETTER_PATH,
      keyring,
      { nowMs: NOW_MS }
    )
    const hostileOutcome = Object.assign(Object.create({
      toJSON: () => ({ secret: 'must-not-serialize' })
    }), { status: 'recorded' })
    const log = vi.fn()
    const handler = createCrmSearchDeadLetterPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({ status: 'reserved' }),
      recordDeadLetter: async () => hostileOutcome,
      now: () => NOW_MS,
      log
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(log).not.toHaveBeenCalled()
  })

  it('returns a new status-only projection of a null-prototype recorder outcome', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      message,
      CRM_SEARCH_DEAD_LETTER_PATH,
      keyring,
      { nowMs: NOW_MS }
    )
    const dependencyOutcome = Object.assign(Object.create(null), { status: 'recorded' })
    const handler = createCrmSearchDeadLetterPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => keyring,
      reserveRequest: async () => ({ status: 'reserved' }),
      recordDeadLetter: async () => dependencyOutcome,
      now: () => NOW_MS,
      log: vi.fn()
    })

    const result = await handler({ context: {} } as never)
    expect(result).toEqual({ status: 'recorded' })
    expect(result).not.toBe(dependencyOutcome)
  })

  it('fails closed when the dedicated service keyring is unavailable', async () => {
    const signed = await createCrmSearchSignedServiceRequest(
      message,
      CRM_SEARCH_DEAD_LETTER_PATH,
      keyring,
      { nowMs: NOW_MS }
    )
    const recordDeadLetter = vi.fn()
    const handler = createCrmSearchDeadLetterPostHandler({
      readBody: async () => signed.body,
      getHeaders: () => signed.headers,
      resolveKeyring: () => null,
      reserveRequest: vi.fn(),
      recordDeadLetter,
      now: () => NOW_MS,
      log: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(recordDeadLetter).not.toHaveBeenCalled()
  })
})
