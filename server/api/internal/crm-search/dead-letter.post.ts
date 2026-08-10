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

export interface CrmSearchDeadLetterEndpointDependencies extends CrmSearchInternalAuthDependencies {
  reserveRequest(
    input: CrmSearchRequestReservationInput
  ): Promise<CrmSearchRequestReservation<CrmSearchDeadLetterOutcome>>
  recordDeadLetter(input: {
    operationId: string
    correlationId: string
    protocolVersion: 1
  }): Promise<CrmSearchDeadLetterOutcome>
  log(record: CrmSearchDeadLetterLogRecord): void
}

function unavailable(): never {
  throw createError({
    statusCode: 503,
    statusMessage: 'crm_search_dead_letter_recorder_unavailable'
  })
}

function validDeadLetterOutcome(value: unknown): value is CrmSearchDeadLetterOutcome {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 1
    && (record.status === 'recorded' || record.status === 'duplicate')
}

const defaultDependencies: CrmSearchDeadLetterEndpointDependencies = {
  readBody: readBoundedCrmSearchInternalBody,
  getHeaders: event => getRequestHeaders(event),
  resolveKeyring: resolveCrmSearchServiceKeyring,
  async reserveRequest() {
    unavailable()
  },
  now: Date.now,
  async recordDeadLetter() {
    unavailable()
  },
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
      const outcome = reservation.outcome
      if (!validDeadLetterOutcome(outcome)) unavailable()
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

    const outcome = await dependencies.recordDeadLetter({
      operationId: envelope.operationId,
      correlationId: envelope.correlationId,
      protocolVersion: envelope.protocolVersion
    })
    if (!validDeadLetterOutcome(outcome)) unavailable()
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
