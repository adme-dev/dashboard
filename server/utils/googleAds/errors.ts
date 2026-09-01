export type GoogleAdsErrorCategory
  = | 'auth'
    | 'permission'
    | 'validation'
    | 'policy'
    | 'quota'
    | 'conflict'
    | 'provider'
    | 'unknown'

export interface GoogleAdsActionErrorInput {
  code: string
  category: GoogleAdsErrorCategory
  retryable: boolean
  operationIndex?: number
  fieldPath?: string
  requestId?: string
  safeMessage: string
}

export class GoogleAdsActionError extends Error implements GoogleAdsActionErrorInput {
  readonly code: string
  readonly category: GoogleAdsErrorCategory
  readonly retryable: boolean
  readonly operationIndex?: number
  readonly fieldPath?: string
  readonly requestId?: string
  readonly safeMessage: string

  constructor(input: GoogleAdsActionErrorInput) {
    super(input.safeMessage)
    this.name = 'GoogleAdsActionError'
    this.code = input.code
    this.category = input.category
    this.retryable = input.retryable
    this.operationIndex = input.operationIndex
    this.fieldPath = input.fieldPath
    this.requestId = input.requestId
    this.safeMessage = input.safeMessage
  }
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : {}
}

function statusFrom(error: UnknownRecord): number | undefined {
  const response = asRecord(error.response)
  const value = error.status ?? error.statusCode ?? response.status
  return typeof value === 'number' ? value : undefined
}

function requestIdFrom(error: UnknownRecord): string | undefined {
  const response = asRecord(error.response)
  const headers = response.headers
  if (headers instanceof Headers) return headers.get('request-id') ?? undefined
  const record = asRecord(headers)
  const value = record['request-id'] ?? record['requestId']
  return typeof value === 'string' && value ? value : undefined
}

function firstProviderError(error: UnknownRecord): UnknownRecord {
  const data = asRecord(error.data)
  const response = asRecord(error.response)
  const responseData = asRecord(response._data)
  const envelope = asRecord(Object.keys(data).length ? data.error : responseData.error)
  const details = Array.isArray(envelope.details) ? envelope.details : []

  for (const detail of details) {
    const errors = asRecord(detail).errors
    if (Array.isArray(errors) && errors.length) return asRecord(errors[0])
  }

  return {}
}

function providerCodeFrom(providerError: UnknownRecord, status?: number): string {
  const errorCode = asRecord(providerError.errorCode)
  const providerCode = Object.values(errorCode).find(value => typeof value === 'string')
  if (typeof providerCode === 'string' && providerCode) return providerCode

  switch (status) {
    case 400: return 'INVALID_ARGUMENT'
    case 401: return 'AUTHENTICATION_ERROR'
    case 403: return 'PERMISSION_DENIED'
    case 409: return 'CONFLICT'
    case 429: return 'RESOURCE_EXHAUSTED'
    case 500: return 'INTERNAL_ERROR'
    case 502: return 'BAD_GATEWAY'
    case 503: return 'UNAVAILABLE'
    case 504: return 'DEADLINE_EXCEEDED'
    default: return 'GOOGLE_ADS_ERROR'
  }
}

function categoryFrom(status: number | undefined, code: string): GoogleAdsErrorCategory {
  if (status === 401) return 'auth'
  if (status === 403) return 'permission'
  if (status === 409) return 'conflict'
  if (status === 429) return 'quota'
  if (status && status >= 500) return 'provider'
  if (code.includes('POLICY')) return 'policy'
  if (status === 400) return 'validation'
  return 'unknown'
}

function safeMessageFor(category: GoogleAdsErrorCategory): string {
  switch (category) {
    case 'auth': return 'Google Ads authentication failed.'
    case 'permission': return 'Google Ads denied access to this account or resource.'
    case 'validation': return 'Google Ads rejected the requested fields.'
    case 'policy': return 'Google Ads policy checks rejected this request.'
    case 'quota': return 'Google Ads rate or quota limits were reached.'
    case 'conflict': return 'Google Ads reported a conflicting resource state.'
    case 'provider': return 'Google Ads is temporarily unavailable.'
    default: return 'Google Ads could not complete the request.'
  }
}

function locationFrom(providerError: UnknownRecord): {
  operationIndex?: number
  fieldPath?: string
} {
  const location = asRecord(providerError.location)
  const elements = Array.isArray(location.fieldPathElements)
    ? location.fieldPathElements.map(asRecord)
    : []
  if (!elements.length) return {}

  const segments: string[] = []
  let operationIndex: number | undefined
  for (const element of elements) {
    const fieldName = typeof element.fieldName === 'string' ? element.fieldName : ''
    const index = typeof element.index === 'number' ? element.index : undefined
    if (!fieldName) continue
    segments.push(index === undefined ? fieldName : `${fieldName}[${index}]`)
    if (fieldName === 'operations' && index !== undefined) operationIndex = index
  }

  return {
    operationIndex,
    fieldPath: segments.length ? segments.join('.') : undefined
  }
}

export function normalizeGoogleAdsError(error: unknown): GoogleAdsActionError {
  if (error instanceof GoogleAdsActionError) return error

  const record = asRecord(error)
  const status = statusFrom(record)
  const providerError = firstProviderError(record)
  const code = providerCodeFrom(providerError, status)
  const category = categoryFrom(status, code)
  const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504
  const location = locationFrom(providerError)

  return new GoogleAdsActionError({
    code,
    category,
    retryable,
    requestId: requestIdFrom(record),
    safeMessage: safeMessageFor(category),
    ...location
  })
}

export function isGoogleAdsRetryable(error: unknown): boolean {
  return normalizeGoogleAdsError(error).retryable
}
