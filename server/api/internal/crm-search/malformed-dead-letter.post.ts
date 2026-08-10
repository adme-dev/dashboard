import { createError, eventHandler, getRequestHeaders, type H3Event } from 'h3'

import {
  CRM_SEARCH_MALFORMED_DEAD_LETTER_PATH,
  crmSearchMalformedDeadLetterCoordinates,
  parseCrmSearchMalformedDeadLetterRecord,
  type CrmSearchDeadLetterOutcome,
  type CrmSearchMalformedDeadLetterRecord
} from '~~/shared/crmSearchIndexProtocol'
import {
  extractCrmSearchServiceRequest,
  verifyCrmSearchServiceRequest
} from '~~/shared/crmSearchIndexSigning'
import {
  readBoundedCrmSearchInternalBody,
  resolveCrmSearchServiceKeyring,
  type CrmSearchInternalAuthDependencies
} from '~~/server/api/internal/crm-search/process.post'
import {
  recordCrmSearchMalformedTransportDeadLetter
} from '~~/server/utils/crm/searchIndex/deadLetters'

interface CrmSearchMalformedDeadLetterLogRecord {
  event: 'crm_search_malformed_dead_letter'
  status: CrmSearchDeadLetterOutcome['status']
}

export interface CrmSearchMalformedDeadLetterEndpointDependencies
  extends CrmSearchInternalAuthDependencies {
  persistMalformed(
    input: CrmSearchMalformedDeadLetterRecord
  ): Promise<CrmSearchDeadLetterOutcome>
  log(record: CrmSearchMalformedDeadLetterLogRecord): void
}

function fail(statusCode: 400 | 401 | 503, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function projectOutcome(value: unknown): CrmSearchDeadLetterOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  if ((prototype !== Object.prototype && prototype !== null)
    || Object.keys(value).length !== 1) return null
  const descriptor = Object.getOwnPropertyDescriptor(value, 'status')
  const status = descriptor && 'value' in descriptor ? descriptor.value : null
  return status === 'recorded' || status === 'duplicate' ? { status } : null
}

const defaultDependencies: CrmSearchMalformedDeadLetterEndpointDependencies = {
  readBody: readBoundedCrmSearchInternalBody,
  getHeaders: event => getRequestHeaders(event),
  resolveKeyring: resolveCrmSearchServiceKeyring,
  now: Date.now,
  persistMalformed: recordCrmSearchMalformedTransportDeadLetter,
  log(record) {
    console.info(JSON.stringify(record))
  }
}

export function createCrmSearchMalformedDeadLetterPostHandler(
  overrides: Partial<CrmSearchMalformedDeadLetterEndpointDependencies> = {}
) {
  const dependencies = { ...defaultDependencies, ...overrides }
  return async (event: H3Event): Promise<CrmSearchDeadLetterOutcome> => {
    const body = await dependencies.readBody(event)
    const keyring = dependencies.resolveKeyring(event)
    if (!keyring) fail(503, 'crm_search_service_keyring_unavailable')
    const request = extractCrmSearchServiceRequest(
      dependencies.getHeaders(event), body, 'POST', CRM_SEARCH_MALFORMED_DEAD_LETTER_PATH
    )
    if (!request || !await verifyCrmSearchServiceRequest(request, keyring, {
      nowMs: dependencies.now()
    })) fail(401, 'invalid_crm_search_service_request')
    const record = parseCrmSearchMalformedDeadLetterRecord(body)
    if (!record) fail(400, 'invalid_crm_search_envelope')
    const coordinates = crmSearchMalformedDeadLetterCoordinates(record.queueMessageIdDigest)
    const requestTimeMs = Number(request.timestamp) * 1000
    const receivedAtMs = Date.parse(record.receivedAt)
    if (request.operationId !== coordinates.operationId
      || request.correlationId !== coordinates.correlationId
      || request.protocolVersion !== record.protocolVersion
      || !Number.isSafeInteger(requestTimeMs)
      || Math.abs(receivedAtMs - requestTimeMs) >= 1000) {
      fail(400, 'invalid_crm_search_envelope')
    }
    const outcome = projectOutcome(await dependencies.persistMalformed(record))
    if (!outcome) fail(503, 'crm_search_dead_letter_recorder_unavailable')
    dependencies.log({ event: 'crm_search_malformed_dead_letter', status: outcome.status })
    return outcome
  }
}

export default eventHandler(createCrmSearchMalformedDeadLetterPostHandler())
