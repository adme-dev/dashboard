import { createError, eventHandler, getRequestHeaders, type H3Event } from 'h3'

import {
  CRM_SEARCH_DEAD_LETTER_PATH,
  crmSearchRequestIdempotencyKey,
  type CrmSearchDeadLetterLogRecord,
  type CrmSearchDeadLetterOutcome,
  type CrmSearchRequestReservation,
  type CrmSearchRequestReservationInput
} from '~~/shared/crmSearchIndexProtocol'
import {
  authenticateCrmSearchInternalRequest,
  readBoundedCrmSearchInternalBody,
  resolveCrmSearchServiceKeyring,
  type CrmSearchInternalAuthDependencies
} from '~~/server/api/internal/crm-search/process.post'
import {
  recordCrmSearchTransportDeadLetter,
  reserveCrmSearchDeadLetterRequest
} from '~~/server/utils/crm/searchIndex/deadLetters'

export interface CrmSearchDeadLetterEndpointDependencies extends CrmSearchInternalAuthDependencies {
  reserveRequest(
    input: CrmSearchRequestReservationInput
  ): Promise<CrmSearchRequestReservation<CrmSearchDeadLetterOutcome>>
  recordDeadLetter(input: {
    operationId: string
    correlationId: string
    protocolVersion: 1
  }, event: H3Event): Promise<CrmSearchDeadLetterOutcome>
  log(record: CrmSearchDeadLetterLogRecord): void
}

function unavailable(): never {
  throw createError({
    statusCode: 503,
    statusMessage: 'crm_search_dead_letter_recorder_unavailable'
  })
}

function projectDeadLetterOutcome(value: unknown): CrmSearchDeadLetterOutcome | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    if (Object.keys(value).length !== 1) return null
    const statusDescriptor = Object.getOwnPropertyDescriptor(value, 'status')
    if (!statusDescriptor || !('value' in statusDescriptor)) return null
    const status = statusDescriptor.value
    if (status !== 'recorded' && status !== 'duplicate') return null
    return { status }
  } catch {
    return null
  }
}

const defaultDependencies: CrmSearchDeadLetterEndpointDependencies = {
  readBody: readBoundedCrmSearchInternalBody,
  getHeaders: event => getRequestHeaders(event),
  resolveKeyring: resolveCrmSearchServiceKeyring,
  reserveRequest: reserveCrmSearchDeadLetterRequest,
  now: Date.now,
  recordDeadLetter: recordCrmSearchTransportDeadLetter,
  log(record) {
    console.info(JSON.stringify(record))
  }
}

export function createCrmSearchDeadLetterPostHandler(
  overrides: Partial<CrmSearchDeadLetterEndpointDependencies> = {}
) {
  const dependencies: CrmSearchDeadLetterEndpointDependencies = {
    ...defaultDependencies,
    ...overrides
  }
  return async (event: H3Event): Promise<CrmSearchDeadLetterOutcome> => {
    const { request, envelope } = await authenticateCrmSearchInternalRequest(
      event,
      CRM_SEARCH_DEAD_LETTER_PATH,
      dependencies
    )
    const reservation = await dependencies.reserveRequest({
      path: CRM_SEARCH_DEAD_LETTER_PATH,
      protocolVersion: envelope.protocolVersion,
      operationId: envelope.operationId,
      correlationId: envelope.correlationId,
      idempotencyKey: crmSearchRequestIdempotencyKey(
        CRM_SEARCH_DEAD_LETTER_PATH,
        envelope.operationId
      ),
      requestTimestamp: request.timestamp
    })
    if (reservation.status === 'in_progress') unavailable()
    if (reservation.status === 'replay') {
      const outcome = projectDeadLetterOutcome(reservation.outcome)
      if (!outcome) unavailable()
      dependencies.log({
        event: 'crm_search_dead_letter',
        operationId: envelope.operationId,
        correlationId: envelope.correlationId,
        protocolVersion: envelope.protocolVersion,
        status: outcome.status
      })
      return outcome
    }
    if (reservation.status !== 'reserved') unavailable()

    const outcome = projectDeadLetterOutcome(await dependencies.recordDeadLetter({
      operationId: envelope.operationId,
      correlationId: envelope.correlationId,
      protocolVersion: envelope.protocolVersion
    }, event))
    if (!outcome) unavailable()
    dependencies.log({
      event: 'crm_search_dead_letter',
      operationId: envelope.operationId,
      correlationId: envelope.correlationId,
      protocolVersion: envelope.protocolVersion,
      status: outcome.status
    })
    return outcome
  }
}

export default eventHandler(createCrmSearchDeadLetterPostHandler())
