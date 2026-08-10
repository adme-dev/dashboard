import {
  createError,
  eventHandler,
  getHeader,
  getRequestHeaders,
  getRequestWebStream,
  type H3Event
} from 'h3'

import {
  CRM_SEARCH_PROCESS_PATH,
  CRM_SEARCH_REQUEST_BODY_MAX_BYTES,
  crmSearchRequestIdempotencyKey,
  parseCrmSearchIndexQueueMessage,
  type CrmSearchIndexQueueMessage,
  type CrmSearchProcessLogRecord,
  type CrmSearchProcessOutcome,
  type CrmSearchRequestReservation,
  type CrmSearchRequestReservationInput,
  type CrmSearchServicePath
} from '~~/shared/crmSearchIndexProtocol'
import {
  extractCrmSearchServiceRequest,
  parseCrmSearchServiceKeyring,
  verifyCrmSearchServiceRequest,
  type CrmSearchHeaderRecord,
  type CrmSearchServiceKeyring,
  type CrmSearchServiceRequest
} from '~~/shared/crmSearchIndexSigning'

export interface CrmSearchInternalAuthDependencies {
  readBody(event: H3Event): Promise<string>
  getHeaders(event: H3Event): CrmSearchHeaderRecord
  resolveKeyring(event: H3Event): CrmSearchServiceKeyring | null
  now(): number
}

export interface CrmSearchAuthenticatedInternalRequest {
  request: CrmSearchServiceRequest
  envelope: CrmSearchIndexQueueMessage
}

export interface CrmSearchProcessEndpointDependencies extends CrmSearchInternalAuthDependencies {
  reserveRequest(
    input: CrmSearchRequestReservationInput
  ): Promise<CrmSearchRequestReservation<CrmSearchProcessOutcome>>
  processOperation(input: {
    operationId: string
    correlationId: string
    protocolVersion: 1
  }): Promise<CrmSearchProcessOutcome>
  log(record: CrmSearchProcessLogRecord): void
}

function fail(statusCode: 400 | 401 | 413 | 503, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function bytesOf(value: unknown): Uint8Array | null {
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return null
}

/** Reads the exact UTF-8 body bytes under the protocol's 256-byte ceiling. */
export async function readBoundedCrmSearchInternalBody(event: H3Event): Promise<string> {
  const declaredLength = getHeader(event, 'content-length')
  if (declaredLength) {
    if (!/^\d+$/.test(declaredLength)) fail(400, 'invalid_crm_search_service_request')
    if (Number(declaredLength) > CRM_SEARCH_REQUEST_BODY_MAX_BYTES) {
      fail(413, 'invalid_crm_search_service_request')
    }
  }

  const stream = getRequestWebStream(event)
  if (!stream) fail(400, 'invalid_crm_search_service_request')
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const bytes = bytesOf(value)
      if (!bytes) fail(400, 'invalid_crm_search_service_request')
      totalBytes += bytes.byteLength
      if (totalBytes > CRM_SEARCH_REQUEST_BODY_MAX_BYTES) {
        await reader.cancel('CRM search internal request body exceeds its byte limit')
        fail(413, 'invalid_crm_search_service_request')
      }
      chunks.push(bytes)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    fail(400, 'invalid_crm_search_service_request')
  }
}

export function resolveCrmSearchServiceKeyring(event: H3Event): CrmSearchServiceKeyring | null {
  const runtimeValue = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.CRM_SEARCH_SERVICE_KEYRING
  if (runtimeValue !== undefined) {
    return typeof runtimeValue === 'string'
      ? parseCrmSearchServiceKeyring(runtimeValue)
      : null
  }
  const raw = process.env.CRM_SEARCH_SERVICE_KEYRING
  return parseCrmSearchServiceKeyring(raw)
}

function defaultAuthDependencies(): CrmSearchInternalAuthDependencies {
  return {
    readBody: readBoundedCrmSearchInternalBody,
    getHeaders: event => getRequestHeaders(event),
    resolveKeyring: resolveCrmSearchServiceKeyring,
    now: Date.now
  }
}

export async function authenticateCrmSearchInternalRequest(
  event: H3Event,
  path: CrmSearchServicePath,
  dependencies: CrmSearchInternalAuthDependencies
): Promise<CrmSearchAuthenticatedInternalRequest> {
  const rawBody = await dependencies.readBody(event)
  const keyring = dependencies.resolveKeyring(event)
  if (!keyring) fail(503, 'crm_search_service_keyring_unavailable')
  const nowMs = dependencies.now()

  const request = extractCrmSearchServiceRequest(
    dependencies.getHeaders(event),
    rawBody,
    'POST',
    path
  )
  if (!request || !await verifyCrmSearchServiceRequest(request, keyring, {
    nowMs
  })) {
    fail(401, 'invalid_crm_search_service_request')
  }

  // Parsing the signed identity-only body deliberately happens only after
  // signature, key-window, protocol, freshness, and body-digest verification.
  const envelope = parseCrmSearchIndexQueueMessage(rawBody, { nowMs })
  if (
    !envelope
    || envelope.protocolVersion !== request.protocolVersion
    || envelope.operationId !== request.operationId
    || envelope.correlationId !== request.correlationId
  ) {
    fail(400, 'invalid_crm_search_envelope')
  }
  return { request, envelope }
}

function validProcessOutcome(value: unknown): value is CrmSearchProcessOutcome {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 1
    && (
      record.status === 'complete'
      || record.status === 'accepted_provider_pending'
      || record.status === 'superseded'
    )
}

const defaultDependencies: CrmSearchProcessEndpointDependencies = {
  ...defaultAuthDependencies(),
  async reserveRequest() {
    fail(503, 'crm_search_processor_unavailable')
  },
  async processOperation() {
    fail(503, 'crm_search_processor_unavailable')
  },
  log(record) {
    console.info(JSON.stringify(record))
  }
}

export function createCrmSearchProcessPostHandler(
  overrides: Partial<CrmSearchProcessEndpointDependencies> = {}
) {
  const dependencies: CrmSearchProcessEndpointDependencies = {
    ...defaultDependencies,
    ...overrides
  }
  return async (event: H3Event): Promise<CrmSearchProcessOutcome> => {
    const { request, envelope } = await authenticateCrmSearchInternalRequest(
      event,
      CRM_SEARCH_PROCESS_PATH,
      dependencies
    )
    const reservation = await dependencies.reserveRequest({
      path: CRM_SEARCH_PROCESS_PATH,
      protocolVersion: envelope.protocolVersion,
      operationId: envelope.operationId,
      correlationId: envelope.correlationId,
      idempotencyKey: crmSearchRequestIdempotencyKey(
        CRM_SEARCH_PROCESS_PATH,
        envelope.operationId
      ),
      requestTimestamp: request.timestamp
    })
    if (reservation.status === 'in_progress') {
      fail(503, 'crm_search_request_in_progress')
    }
    if (reservation.status === 'replay') {
      const outcome = reservation.outcome
      if (!validProcessOutcome(outcome)) fail(503, 'crm_search_processor_unavailable')
      dependencies.log({
        event: 'crm_search_process',
        operationId: envelope.operationId,
        correlationId: envelope.correlationId,
        protocolVersion: envelope.protocolVersion,
        status: outcome.status
      })
      return outcome
    }
    if (reservation.status !== 'reserved') {
      fail(503, 'crm_search_processor_unavailable')
    }

    const outcome = await dependencies.processOperation({
      operationId: envelope.operationId,
      correlationId: envelope.correlationId,
      protocolVersion: envelope.protocolVersion
    })
    if (!validProcessOutcome(outcome)) fail(503, 'crm_search_processor_unavailable')
    dependencies.log({
      event: 'crm_search_process',
      operationId: envelope.operationId,
      correlationId: envelope.correlationId,
      protocolVersion: envelope.protocolVersion,
      status: outcome.status
    })
    return outcome
  }
}

export default eventHandler(createCrmSearchProcessPostHandler())
