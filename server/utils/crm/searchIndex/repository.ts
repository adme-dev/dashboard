import {
  queryOneFresh,
  queryRowsFresh,
  transactionWithoutRetry
} from '~~/server/utils/db'

export interface CrmSearchQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[]
  rowCount?: number | null
}

export interface CrmSearchTransactionClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<CrmSearchQueryResult<Row>>
}

export type CrmSearchQueryOneFresh = <Row extends Record<string, unknown>>(
  sql: string,
  params?: unknown[]
) => Promise<Row | null>

export type CrmSearchQueryRowsFresh = <Row extends Record<string, unknown>>(
  sql: string,
  params?: unknown[]
) => Promise<Row[]>

export type CrmSearchTransactionWithoutRetry = <Result>(
  callback: (client: CrmSearchTransactionClient) => Promise<Result>
) => Promise<Result>

export interface CrmSearchRepositoryDependencies {
  queryOneFresh: CrmSearchQueryOneFresh
  queryRowsFresh: CrmSearchQueryRowsFresh
  transactionWithoutRetry: CrmSearchTransactionWithoutRetry
}

export const crmSearchRepositoryDependencies: CrmSearchRepositoryDependencies = {
  queryOneFresh: queryOneFresh as CrmSearchQueryOneFresh,
  queryRowsFresh: queryRowsFresh as CrmSearchQueryRowsFresh,
  transactionWithoutRetry: transactionWithoutRetry as CrmSearchTransactionWithoutRetry
}

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const canonicalUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const canonicalDatePattern = /^\d{4}-\d{2}-\d{2}$/
const schemaVersionPattern = /^crm-search-v[1-9][0-9]*$/
const boundedClassPattern = /^[a-z][a-z0-9_]{0,63}$/
const digestPattern = /^[0-9a-f]{64}$/
const hmacDigestPattern = /^hmac-sha256:[0-9a-f]{64}$/

export function crmSearchRepositoryError(code: string): Error {
  return new Error(code)
}

export function requireUuid(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !canonicalUuidPattern.test(value)) {
    throw crmSearchRepositoryError(errorCode)
  }
  return value
}

export function requireOptionalUuid(value: unknown, errorCode: string): string | null {
  if (value === null || value === undefined) return null
  return requireUuid(value, errorCode)
}

export function requireSafeInteger(
  value: unknown,
  errorCode: string,
  options: { minimum?: number, maximum?: number } = {}
): number {
  let parsed: number
  if (typeof value === 'number') parsed = value
  else if (typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)$/.test(value)) parsed = Number(value)
  else throw crmSearchRepositoryError(errorCode)

  const minimum = options.minimum ?? 0
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw crmSearchRepositoryError(errorCode)
  }
  return parsed
}

export function requireBoolean(value: unknown, errorCode: string): boolean {
  if (typeof value !== 'boolean') throw crmSearchRepositoryError(errorCode)
  return value
}

export function requireString(
  value: unknown,
  errorCode: string,
  options: { minimumLength?: number, maximumLength?: number, pattern?: RegExp } = {}
): string {
  const minimumLength = options.minimumLength ?? 1
  const maximumLength = options.maximumLength ?? 255
  if (typeof value !== 'string'
    || value.length < minimumLength
    || value.length > maximumLength
    || (options.pattern && !options.pattern.test(value))) {
    throw crmSearchRepositoryError(errorCode)
  }
  return value
}

export function requireEnum<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  errorCode: string
): Value {
  if (typeof value !== 'string' || !allowed.includes(value as Value)) {
    throw crmSearchRepositoryError(errorCode)
  }
  return value as Value
}

export function requireTimestamp(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !canonicalUtcTimestampPattern.test(value)) {
    throw crmSearchRepositoryError(errorCode)
  }
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw crmSearchRepositoryError(errorCode)
  }
  return value
}

export function requireOptionalTimestamp(value: unknown, errorCode: string): string | null {
  if (value === null || value === undefined) return null
  return requireTimestamp(value, errorCode)
}

export function requireDate(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !canonicalDatePattern.test(value)) {
    throw crmSearchRepositoryError(errorCode)
  }
  const epoch = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw crmSearchRepositoryError(errorCode)
  }
  return value
}

export function requireSchemaVersion(value: unknown, errorCode: string): string {
  return requireString(value, errorCode, { maximumLength: 64, pattern: schemaVersionPattern })
}

export function requireBoundedClass(value: unknown, errorCode: string): string {
  return requireString(value, errorCode, { maximumLength: 64, pattern: boundedClassPattern })
}

export function requireDigest(value: unknown, errorCode: string): string {
  return requireString(value, errorCode, { minimumLength: 64, maximumLength: 64, pattern: digestPattern })
}

export function requireHmacDigest(value: unknown, errorCode: string): string {
  return requireString(value, errorCode, { minimumLength: 76, maximumLength: 76, pattern: hmacDigestPattern })
}

export function firstRow<Row extends Record<string, unknown>>(
  result: Pick<CrmSearchQueryResult<Row>, 'rows'>
): Row | null {
  return result.rows[0] ?? null
}

export function affectedRows(result: Pick<CrmSearchQueryResult, 'rowCount' | 'rows'>): number {
  return typeof result.rowCount === 'number' ? result.rowCount : result.rows.length
}

export function isNewerIntent(
  candidateRevision: number,
  candidateSequence: number,
  currentRevision: number,
  currentSequence: number
): boolean {
  return candidateRevision >= currentRevision
    && candidateSequence >= currentSequence
    && (candidateRevision > currentRevision || candidateSequence > currentSequence)
}
