import { describe, expect, it } from 'vitest'

import {
  CRM_SEARCH_CORRELATION_ID_BYTES,
  CRM_SEARCH_DEAD_LETTER_PATH,
  CRM_SEARCH_ENQUEUED_AT_BYTES,
  CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  CRM_SEARCH_OPERATION_ID_BYTES,
  CRM_SEARCH_PROCESS_PATH,
  CRM_SEARCH_QUEUE_MESSAGE_MAX_AGE_SECONDS,
  CRM_SEARCH_REQUEST_BODY_MAX_BYTES,
  canonicalCrmSearchIndexQueueMessage,
  crmSearchAcceptedProtocolVersions,
  crmSearchRequestIdempotencyKey,
  parseCrmSearchIndexQueueMessage,
  type CrmSearchIndexQueueMessage
} from '../../../shared/crmSearchIndexProtocol'

const NOW_MS = Date.parse('2033-05-18T03:33:20.000Z')
const operationId = '11111111-1111-4111-8111-111111111111'
const correlationId = '22222222-2222-4222-8222-222222222222'

function message(overrides: Partial<CrmSearchIndexQueueMessage> = {}): CrmSearchIndexQueueMessage {
  return {
    protocolVersion: 1,
    operationId,
    correlationId,
    enqueuedAt: new Date(NOW_MS).toISOString(),
    ...overrides
  }
}

describe('CRM search index queue protocol', () => {
  it('pins v1, exact internal paths, and current/N-1 compatibility', () => {
    expect(CRM_SEARCH_INDEX_PROTOCOL_VERSION).toBe(1)
    expect(CRM_SEARCH_PROCESS_PATH).toBe('/api/internal/crm-search/process')
    expect(CRM_SEARCH_DEAD_LETTER_PATH).toBe('/api/internal/crm-search/dead-letter')
    expect(crmSearchAcceptedProtocolVersions(1)).toEqual([1])
    expect(crmSearchAcceptedProtocolVersions(2)).toEqual([2, 1])
    expect(() => crmSearchAcceptedProtocolVersions(0)).toThrow(/protocol/i)
  })

  it('emits one deterministic identifier-only canonical envelope', () => {
    const canonical = canonicalCrmSearchIndexQueueMessage(message(), { nowMs: NOW_MS })

    expect(canonical).toBe(
      '{"protocolVersion":1,"operationId":"11111111-1111-4111-8111-111111111111",'
      + '"correlationId":"22222222-2222-4222-8222-222222222222",'
      + '"enqueuedAt":"2033-05-18T03:33:20.000Z"}'
    )
    expect(Buffer.byteLength(canonical, 'utf8')).toBeLessThanOrEqual(CRM_SEARCH_REQUEST_BODY_MAX_BYTES)
    expect(Buffer.byteLength(operationId, 'utf8')).toBe(CRM_SEARCH_OPERATION_ID_BYTES)
    expect(Buffer.byteLength(correlationId, 'utf8')).toBe(CRM_SEARCH_CORRELATION_ID_BYTES)
    expect(Buffer.byteLength(message().enqueuedAt, 'utf8')).toBe(CRM_SEARCH_ENQUEUED_AT_BYTES)
    expect(canonical).not.toMatch(/client|organisation|entity|source|error|attempt/i)
  })

  it('accepts only exact canonical bytes and exact fields', () => {
    const canonical = canonicalCrmSearchIndexQueueMessage(message(), { nowMs: NOW_MS })

    expect(parseCrmSearchIndexQueueMessage(canonical, { nowMs: NOW_MS })).toEqual(message())
    expect(parseCrmSearchIndexQueueMessage(JSON.stringify({
      operationId,
      protocolVersion: 1,
      correlationId,
      enqueuedAt: message().enqueuedAt
    }), { nowMs: NOW_MS })).toBeNull()
    expect(parseCrmSearchIndexQueueMessage(JSON.stringify({
      ...message(),
      sourceText: 'must never cross the queue boundary'
    }), { nowMs: NOW_MS })).toBeNull()
    expect(parseCrmSearchIndexQueueMessage(`${canonical} `, { nowMs: NOW_MS })).toBeNull()
    expect(parseCrmSearchIndexQueueMessage('x'.repeat(CRM_SEARCH_REQUEST_BODY_MAX_BYTES + 1), {
      nowMs: NOW_MS
    })).toBeNull()
  })

  it('enforces canonical identifiers and the exact 14-day queue recovery bound', () => {
    const oldestAccepted = message({
      enqueuedAt: new Date(NOW_MS - CRM_SEARCH_QUEUE_MESSAGE_MAX_AGE_SECONDS * 1000).toISOString()
    })
    const expired = message({
      enqueuedAt: new Date(NOW_MS - (CRM_SEARCH_QUEUE_MESSAGE_MAX_AGE_SECONDS + 1) * 1000).toISOString()
    })

    expect(parseCrmSearchIndexQueueMessage(
      canonicalCrmSearchIndexQueueMessage(oldestAccepted, { nowMs: NOW_MS }),
      { nowMs: NOW_MS }
    )).toEqual(oldestAccepted)
    expect(() => canonicalCrmSearchIndexQueueMessage(expired, { nowMs: NOW_MS })).toThrow(/enqueued/i)
    expect(() => canonicalCrmSearchIndexQueueMessage(message({
      operationId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
    }), { nowMs: NOW_MS })).toThrow(/operation/i)
    expect(() => canonicalCrmSearchIndexQueueMessage(message({
      correlationId: 'not-a-correlation-id'
    }), { nowMs: NOW_MS })).toThrow(/correlation/i)
  })

  it('derives path-separated, operation-stable idempotency identities', () => {
    expect(crmSearchRequestIdempotencyKey(CRM_SEARCH_PROCESS_PATH, operationId)).toBe(
      'crm-search-service:v1:process:11111111-1111-4111-8111-111111111111'
    )
    expect(crmSearchRequestIdempotencyKey(CRM_SEARCH_DEAD_LETTER_PATH, operationId)).toBe(
      'crm-search-service:v1:dead-letter:11111111-1111-4111-8111-111111111111'
    )
  })
})
