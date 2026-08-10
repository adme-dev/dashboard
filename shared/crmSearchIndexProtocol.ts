/**
 * Versioned identifier-only transport shared by the CRM search Queue Worker
 * and the Pages internal endpoints. Source records and provider payloads are
 * deliberately outside this boundary.
 */

import { z } from 'zod'

export const CRM_SEARCH_INDEX_PROTOCOL_VERSION = 1 as const
export const CRM_SEARCH_PROCESS_PATH = '/api/internal/crm-search/process' as const
export const CRM_SEARCH_DEAD_LETTER_PATH = '/api/internal/crm-search/dead-letter' as const
export const CRM_SEARCH_HEALTH_PATH = '/api/internal/crm-search/health' as const

export const CRM_SEARCH_REQUEST_BODY_MAX_BYTES = 256 as const
export const CRM_SEARCH_OPERATION_ID_BYTES = 36 as const
export const CRM_SEARCH_CORRELATION_ID_BYTES = 36 as const
export const CRM_SEARCH_ENQUEUED_AT_BYTES = 24 as const
export const CRM_SEARCH_QUEUE_MESSAGE_MAX_AGE_SECONDS = 1_209_600 as const
export const CRM_SEARCH_QUEUE_MESSAGE_FUTURE_SKEW_SECONDS = 60 as const

const encoder = new TextEncoder()
const canonicalUuidPattern
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export type CrmSearchServicePath
  = | typeof CRM_SEARCH_PROCESS_PATH
    | typeof CRM_SEARCH_DEAD_LETTER_PATH

export interface CrmSearchIndexQueueMessage {
  protocolVersion: typeof CRM_SEARCH_INDEX_PROTOCOL_VERSION
  operationId: string
  correlationId: string
  enqueuedAt: string
}

export type CrmSearchProcessOutcome
  = | { status: 'complete' }
    | { status: 'accepted_provider_pending' }
    | { status: 'superseded' }

export type CrmSearchDeadLetterOutcome
  = | { status: 'recorded' }
    | { status: 'duplicate' }

export interface CrmSearchRequestReservationInput {
  path: CrmSearchServicePath
  protocolVersion: typeof CRM_SEARCH_INDEX_PROTOCOL_VERSION
  operationId: string
  correlationId: string
  idempotencyKey: string
  requestTimestamp: string
}

export type CrmSearchRequestReservation<TOutcome>
  = | { status: 'reserved' }
    | { status: 'in_progress' }
    | { status: 'replay', outcome: TOutcome }

export interface CrmSearchProcessLogRecord {
  event: 'crm_search_process'
  operationId: string
  correlationId: string
  protocolVersion: typeof CRM_SEARCH_INDEX_PROTOCOL_VERSION
  status: CrmSearchProcessOutcome['status']
}

export interface CrmSearchDeadLetterLogRecord {
  event: 'crm_search_dead_letter'
  operationId: string
  correlationId: string
  protocolVersion: typeof CRM_SEARCH_INDEX_PROTOCOL_VERSION
  status: CrmSearchDeadLetterOutcome['status']
}

export interface CrmSearchExpectedWorkerHealth {
  deployedSha: string
  artifactDigest: string
  bindingManifestDigest: string
  emittedProtocolVersion: number
}

export interface CrmSearchPagesProtocolHealth {
  status: 'ready'
  component: 'crm_search_pages'
  protocolVersion: typeof CRM_SEARCH_INDEX_PROTOCOL_VERSION
  acceptedProtocolVersions: readonly number[]
  deployedSha: string
  artifactDigest: string
  bindingManifestDigest: string
  expectedWorker: CrmSearchExpectedWorkerHealth
}

export class CrmSearchProtocolError extends Error {
  constructor(
    public readonly code:
      | 'invalid_protocol_version'
      | 'invalid_operation_id'
      | 'invalid_correlation_id'
      | 'invalid_enqueued_at'
      | 'invalid_envelope_fields'
      | 'noncanonical_envelope'
      | 'body_too_large'
  ) {
    super(code)
    this.name = 'CrmSearchProtocolError'
  }
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength
}

const queueMessageSchema = z.object({
  protocolVersion: z.literal(CRM_SEARCH_INDEX_PROTOCOL_VERSION),
  operationId: z.string()
    .refine(value => byteLength(value) === CRM_SEARCH_OPERATION_ID_BYTES)
    .regex(canonicalUuidPattern),
  correlationId: z.string()
    .refine(value => byteLength(value) === CRM_SEARCH_CORRELATION_ID_BYTES)
    .regex(canonicalUuidPattern),
  enqueuedAt: z.string().refine(value => byteLength(value) === CRM_SEARCH_ENQUEUED_AT_BYTES)
}).strict()

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requireCanonicalUuid(value: unknown, kind: 'operation' | 'correlation'): string {
  const expectedBytes = kind === 'operation'
    ? CRM_SEARCH_OPERATION_ID_BYTES
    : CRM_SEARCH_CORRELATION_ID_BYTES
  if (
    typeof value !== 'string'
    || byteLength(value) !== expectedBytes
    || !canonicalUuidPattern.test(value)
  ) {
    throw new CrmSearchProtocolError(
      kind === 'operation' ? 'invalid_operation_id' : 'invalid_correlation_id'
    )
  }
  return value
}

function requireEnqueuedAt(value: unknown, nowMs: number): string {
  if (
    typeof value !== 'string'
    || byteLength(value) !== CRM_SEARCH_ENQUEUED_AT_BYTES
  ) {
    throw new CrmSearchProtocolError('invalid_enqueued_at')
  }
  const milliseconds = Date.parse(value)
  if (
    !Number.isFinite(nowMs)
    || !Number.isFinite(milliseconds)
    || new Date(milliseconds).toISOString() !== value
    || nowMs - milliseconds > CRM_SEARCH_QUEUE_MESSAGE_MAX_AGE_SECONDS * 1000
    || milliseconds - nowMs > CRM_SEARCH_QUEUE_MESSAGE_FUTURE_SKEW_SECONDS * 1000
  ) {
    throw new CrmSearchProtocolError('invalid_enqueued_at')
  }
  return value
}

function validateMessage(
  value: unknown,
  options: { nowMs?: number } = {}
): CrmSearchIndexQueueMessage {
  if (!isPlainRecord(value)) throw new CrmSearchProtocolError('invalid_envelope_fields')
  const parsed = queueMessageSchema.safeParse(value)
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path[0]
    if (path === 'protocolVersion') throw new CrmSearchProtocolError('invalid_protocol_version')
    if (path === 'operationId') throw new CrmSearchProtocolError('invalid_operation_id')
    if (path === 'correlationId') throw new CrmSearchProtocolError('invalid_correlation_id')
    if (path === 'enqueuedAt') throw new CrmSearchProtocolError('invalid_enqueued_at')
    throw new CrmSearchProtocolError('invalid_envelope_fields')
  }

  return {
    protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
    operationId: parsed.data.operationId,
    correlationId: parsed.data.correlationId,
    enqueuedAt: requireEnqueuedAt(parsed.data.enqueuedAt, options.nowMs ?? Date.now())
  }
}

export function crmSearchAcceptedProtocolVersions(currentVersion: number): readonly number[] {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1 || currentVersion > 65_535) {
    throw new RangeError('CRM search protocol version is invalid')
  }
  return Object.freeze(currentVersion === 1
    ? [1]
    : [currentVersion, currentVersion - 1])
}

export function canonicalCrmSearchIndexQueueMessage(
  value: CrmSearchIndexQueueMessage,
  options: { nowMs?: number } = {}
): string {
  const valid = validateMessage(value, options)
  const canonical = JSON.stringify({
    protocolVersion: valid.protocolVersion,
    operationId: valid.operationId,
    correlationId: valid.correlationId,
    enqueuedAt: valid.enqueuedAt
  })
  if (byteLength(canonical) > CRM_SEARCH_REQUEST_BODY_MAX_BYTES) {
    throw new CrmSearchProtocolError('body_too_large')
  }
  return canonical
}

export function parseCrmSearchIndexQueueMessage(
  rawBody: string,
  options: { nowMs?: number } = {}
): CrmSearchIndexQueueMessage | null {
  try {
    if (
      typeof rawBody !== 'string'
      || byteLength(rawBody) > CRM_SEARCH_REQUEST_BODY_MAX_BYTES
    ) return null
    const parsed: unknown = JSON.parse(rawBody)
    const valid = validateMessage(parsed, options)
    if (canonicalCrmSearchIndexQueueMessage(valid, options) !== rawBody) return null
    return valid
  } catch {
    return null
  }
}

export function crmSearchRequestIdempotencyKey(
  path: CrmSearchServicePath,
  operationId: string
): string {
  const validOperationId = requireCanonicalUuid(operationId, 'operation')
  if (path === CRM_SEARCH_PROCESS_PATH) {
    return `crm-search-service:v1:process:${validOperationId}`
  }
  if (path === CRM_SEARCH_DEAD_LETTER_PATH) {
    return `crm-search-service:v1:dead-letter:${validOperationId}`
  }
  throw new CrmSearchProtocolError('invalid_envelope_fields')
}
