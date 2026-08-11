import { normalizeCrmSearchText } from '../searchRequest'
import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_MODES,
  CRM_SEARCH_SURFACES,
  type CrmSearchActorType,
  type CrmSearchEntityType,
  type CrmSearchFallbackClass,
  type CrmSearchMode,
  type CrmSearchStatusClass,
  type CrmSearchSurface
} from './contracts'

export const CRM_SEARCH_QUERY_DIGEST_REVISION = 'crm-search-query-hmac-v1' as const
export const CRM_SEARCH_ENTITY_ID_DIGEST_REVISION = 'crm-search-entity-id-hmac-v1' as const
export const CRM_SEARCH_RANK_EVIDENCE_MAX_BYTES = 8192 as const
export const CRM_SEARCH_METRIC_LABEL_KEYS = Object.freeze([
  'mode',
  'surface',
  'entityType',
  'provider',
  'statusClass',
  'fallbackClass'
] as const)

export const CRM_SEARCH_EVENT_TYPES = Object.freeze([
  'search.keyword_only',
  'search.shadow_completed',
  'search.assist_completed',
  'search.fallback',
  'search.security_rejection',
  'provider.late_completion'
] as const)

export const CRM_SEARCH_QUERY_LENGTH_BUCKETS = Object.freeze([
  '1_16', '17_32', '33_64', '65_128', '129_256'
] as const)

const actorTypes: readonly CrmSearchActorType[] = ['staff', 'portal', 'system']
const providers = ['postgres', 'workers_ai', 'vectorize'] as const
const statusClasses: readonly CrmSearchStatusClass[] = [
  'keyword_only', 'shadow_completed', 'assist_completed', 'fallback', 'security_rejection'
]
const fallbackClasses: readonly CrmSearchFallbackClass[] = [
  'none',
  'mode_off',
  'privacy_guard',
  'budget_exhausted',
  'deadline',
  'provider_unavailable',
  'policy_changed',
  'authorization_changed',
  'ledger_failure',
  'join_back_failure',
  'validation_failure'
]

export const CRM_SEARCH_THRESHOLD_REVISIONS = Object.freeze([
  'cosine-0.75-v1'
] as const)

export const CRM_SEARCH_RANK_REASON_CLASSES = Object.freeze([
  ...fallbackClasses,
  'below_threshold',
  'foreign_candidate',
  'deleted_candidate',
  'stale_candidate',
  'malformed_candidate',
  'unauthorized_candidate'
] as const)

const encoder = new TextEncoder()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const keyVersionPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/
const hmacDigestPattern = /^hmac-sha256:[a-f0-9]{64}$/

export type CrmSearchQueryLengthBucket = typeof CRM_SEARCH_QUERY_LENGTH_BUCKETS[number]
export type CrmSearchTelemetryEventType = typeof CRM_SEARCH_EVENT_TYPES[number]
type CrmSearchLiveQueryEventType = Exclude<CrmSearchTelemetryEventType, 'provider.late_completion'>

export interface DeriveCrmSearchQueryDigestInput {
  secret: string
  keyVersion: string
  organisationScopeId: string
  clientId: string
  query: string
}

export interface DeriveCrmSearchEntityIdDigestInput {
  secret: string
  keyVersion: string
  organisationScopeId: string
  clientId: string
  entityType: CrmSearchEntityType
  entityId: string
}

export interface CrmSearchRankEvidenceEntry {
  entityType: CrmSearchEntityType
  entityIdDigest: string
  rank: number
  scoreBucket?: number
}

export interface CrmSearchRankEvidence {
  keywordRanks?: readonly CrmSearchRankEvidenceEntry[]
  semanticRanks?: readonly CrmSearchRankEvidenceEntry[]
  fusedRanks?: readonly CrmSearchRankEvidenceEntry[]
  overlapCount?: number
  orderingChanged?: boolean
  abstained?: boolean
  thresholdRevision?: typeof CRM_SEARCH_THRESHOLD_REVISIONS[number]
  resultCount?: number
  reasonClass?: typeof CRM_SEARCH_RANK_REASON_CLASSES[number]
}

interface CreateCrmSearchTelemetryEventBaseInput {
  organisationScopeId: string
  clientId: string
  correlationId: string
  actorType: CrmSearchActorType
  mode: CrmSearchMode
  surface: CrmSearchSurface
  sampled: boolean
  keywordResultCount: number
  semanticCandidateCount: number
  fusedResultCount: number
  rankEvidence: CrmSearchRankEvidence
  latencyMs: {
    keyword?: number
    embedding?: number
    vector?: number
    joinBack?: number
    total?: number
  }
  fallbackClass: CrmSearchFallbackClass
  statusClass: CrmSearchStatusClass
}

export interface CrmSearchPrecomputedQueryDigestContext {
  queryDigest: string
  queryDigestKeyVersion: string
  queryLengthBucket: CrmSearchQueryLengthBucket
}

export type CreateCrmSearchTelemetryEventInput = CreateCrmSearchTelemetryEventBaseInput & (
  | {
    eventType: CrmSearchLiveQueryEventType
    query: string
    digestKey: { secret: string, keyVersion: string }
    queryDigestContext?: never
  }
  | {
    eventType: 'provider.late_completion'
    query?: never
    digestKey?: never
    queryDigestContext: CrmSearchPrecomputedQueryDigestContext
  }
)

export interface CrmSearchTelemetryEvent {
  organisationScopeId: string
  clientId: string
  correlationId: string
  eventType: CrmSearchTelemetryEventType
  actorType: CrmSearchActorType
  mode: CrmSearchMode
  surface: CrmSearchSurface
  sampled: boolean
  queryDigest: string
  queryDigestKeyVersion: string
  queryLengthBucket: CrmSearchQueryLengthBucket
  keywordResultCount: number
  semanticCandidateCount: number
  fusedResultCount: number
  rankEvidence: CrmSearchRankEvidence
  keywordLatencyMs?: number
  embeddingLatencyMs?: number
  vectorLatencyMs?: number
  joinBackLatencyMs?: number
  totalLatencyMs?: number
  fallbackClass: CrmSearchFallbackClass
  statusClass: CrmSearchStatusClass
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new TypeError(`${label} must be a canonical UUID`)
  }
  return value
}

function normalizeBoundedQuery(query: unknown): string {
  if (typeof query !== 'string') throw new TypeError('CRM search query must be text')
  const normalized = normalizeCrmSearchText(query)
  const length = [...normalized].length
  if (length < 1 || length > 256) {
    throw new RangeError('CRM search query must contain between 1 and 256 normalized code points')
  }
  return normalized
}

function frameTuple(parts: readonly string[]): string {
  return parts.map(part => `${encoder.encode(part).byteLength}:${part}`).join('|')
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256Digest(secret: unknown, message: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto is unavailable')
  if (typeof secret !== 'string' || encoder.encode(secret).byteLength < 32) {
    throw new Error('CRM search analytics digest secret must be at least 32 bytes')
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  ))
  return `hmac-sha256:${bytesToHex(signature)}`
}

/**
 * Uses the Workers Web Crypto HMAC API documented at:
 * https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
 */
export async function deriveCrmSearchQueryDigest(
  input: DeriveCrmSearchQueryDigestInput
): Promise<string> {
  if (typeof input?.keyVersion !== 'string' || !keyVersionPattern.test(input.keyVersion)) {
    throw new Error('CRM search query digest key version is invalid')
  }
  const organisationScopeId = requireUuid(input.organisationScopeId, 'Organisation scope ID')
  const clientId = requireUuid(input.clientId, 'Client ID')
  const normalizedQuery = normalizeBoundedQuery(input.query)
  const message = frameTuple([
    CRM_SEARCH_QUERY_DIGEST_REVISION,
    input.keyVersion,
    organisationScopeId,
    clientId,
    normalizedQuery
  ])
  return hmacSha256Digest(input.secret, message)
}

export async function deriveCrmSearchEntityIdDigest(
  input: DeriveCrmSearchEntityIdDigestInput
): Promise<string> {
  if (typeof input?.keyVersion !== 'string' || !keyVersionPattern.test(input.keyVersion)) {
    throw new Error('CRM search entity digest key version is invalid')
  }
  const organisationScopeId = requireUuid(input.organisationScopeId, 'Organisation scope ID')
  const clientId = requireUuid(input.clientId, 'Client ID')
  if (!CRM_SEARCH_ENTITY_TYPES.includes(input.entityType as CrmSearchEntityType)) {
    throw new TypeError('CRM search entity digest type is invalid')
  }
  const entityId = requireUuid(input.entityId, 'Entity ID')
  return hmacSha256Digest(input.secret, frameTuple([
    CRM_SEARCH_ENTITY_ID_DIGEST_REVISION,
    input.keyVersion,
    organisationScopeId,
    clientId,
    input.entityType,
    entityId
  ]))
}

export function queryLengthBucket(query: string): CrmSearchQueryLengthBucket {
  const length = [...normalizeBoundedQuery(query)].length
  if (length <= 16) return '1_16'
  if (length <= 32) return '17_32'
  if (length <= 64) return '33_64'
  if (length <= 128) return '65_128'
  return '129_256'
}

async function resolveQueryDigestContext(
  input: CreateCrmSearchTelemetryEventInput
): Promise<CrmSearchPrecomputedQueryDigestContext> {
  const hasRawQueryContext = input.query !== undefined || input.digestKey !== undefined
  const hasPrecomputedContext = input.queryDigestContext !== undefined
  if (input.eventType === 'provider.late_completion' && !hasPrecomputedContext) {
    throw new TypeError('Late-completion telemetry requires precomputed query digest context')
  }
  if (input.eventType !== 'provider.late_completion' && hasPrecomputedContext) {
    throw new TypeError('Search telemetry requires live raw query digest context')
  }
  if (hasRawQueryContext === hasPrecomputedContext) {
    throw new TypeError('Exactly one CRM search query digest context is required')
  }

  if (hasPrecomputedContext) {
    const context = input.queryDigestContext
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new TypeError('CRM search precomputed query digest context is invalid')
    }
    const allowed = new Set(['queryDigest', 'queryDigestKeyVersion', 'queryLengthBucket'])
    if (Object.keys(context).length !== allowed.size
      || Object.keys(context).some(key => !allowed.has(key))
      || typeof context.queryDigest !== 'string'
      || !hmacDigestPattern.test(context.queryDigest)
      || typeof context.queryDigestKeyVersion !== 'string'
      || !keyVersionPattern.test(context.queryDigestKeyVersion)
      || !includesValue(CRM_SEARCH_QUERY_LENGTH_BUCKETS, context.queryLengthBucket)) {
      throw new TypeError('CRM search precomputed query digest context is invalid')
    }
    return {
      queryDigest: context.queryDigest,
      queryDigestKeyVersion: context.queryDigestKeyVersion,
      queryLengthBucket: context.queryLengthBucket
    }
  }

  if (typeof input.query !== 'string'
    || !input.digestKey
    || typeof input.digestKey !== 'object') {
    throw new TypeError('CRM search raw query digest context is invalid')
  }
  const normalizedQuery = normalizeBoundedQuery(input.query)
  const queryDigestKeyVersion = input.digestKey.keyVersion
  return {
    queryDigest: await deriveCrmSearchQueryDigest({
      secret: input.digestKey.secret,
      keyVersion: queryDigestKeyVersion,
      organisationScopeId: input.organisationScopeId,
      clientId: input.clientId,
      query: normalizedQuery
    } as DeriveCrmSearchQueryDigestInput),
    queryDigestKeyVersion,
    queryLengthBucket: queryLengthBucket(normalizedQuery)
  }
}

function requireBoundedInteger(value: unknown, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new RangeError(`${label} result count is invalid`)
  }
  return value as number
}

function requireLatency(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 2_147_483_647) {
    throw new RangeError(`${label} latency is invalid`)
  }
  return value as number
}

function validateRankEntry(value: unknown): CrmSearchRankEvidenceEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('CRM search rank evidence entry is invalid')
  }
  const entry = value as Record<string, unknown>
  const allowed = new Set(['entityType', 'entityIdDigest', 'rank', 'scoreBucket'])
  if (Object.keys(entry).some(key => !allowed.has(key))) {
    throw new TypeError('CRM search rank evidence contains an unsafe field')
  }
  if (!CRM_SEARCH_ENTITY_TYPES.includes(entry.entityType as CrmSearchEntityType)
    || typeof entry.entityIdDigest !== 'string'
    || !hmacDigestPattern.test(entry.entityIdDigest)
    || !Number.isInteger(entry.rank)
    || (entry.rank as number) < 1
    || (entry.rank as number) > 50
    || (entry.scoreBucket !== undefined
      && (!Number.isInteger(entry.scoreBucket)
        || (entry.scoreBucket as number) < 0
        || (entry.scoreBucket as number) > 100))) {
    throw new TypeError('CRM search rank evidence entry is invalid')
  }
  return {
    entityType: entry.entityType as CrmSearchEntityType,
    entityIdDigest: entry.entityIdDigest,
    rank: entry.rank as number,
    ...(entry.scoreBucket === undefined ? {} : { scoreBucket: entry.scoreBucket as number })
  }
}

function validateRankEvidence(value: unknown): CrmSearchRankEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('CRM search rank evidence must be an object')
  }
  const source = value as Record<string, unknown>
  const arrayKeys = ['keywordRanks', 'semanticRanks', 'fusedRanks'] as const
  const allowed = new Set([
    ...arrayKeys,
    'overlapCount',
    'orderingChanged',
    'abstained',
    'thresholdRevision',
    'resultCount',
    'reasonClass'
  ])
  if (Object.keys(source).some(key => !allowed.has(key))) {
    throw new TypeError('CRM search rank evidence contains an unsafe field')
  }
  const result: CrmSearchRankEvidence = {}
  for (const key of arrayKeys) {
    if (source[key] === undefined) continue
    if (!Array.isArray(source[key]) || source[key].length > 50) {
      throw new TypeError('CRM search rank evidence list is invalid')
    }
    result[key] = source[key].map(validateRankEntry)
  }
  for (const key of ['overlapCount', 'resultCount'] as const) {
    if (source[key] !== undefined) {
      result[key] = requireBoundedInteger(source[key], 'Rank evidence', 50)
    }
  }
  for (const key of ['orderingChanged', 'abstained'] as const) {
    if (source[key] !== undefined) {
      if (typeof source[key] !== 'boolean') {
        throw new TypeError('CRM search rank evidence boolean is invalid')
      }
      result[key] = source[key]
    }
  }
  if (source.thresholdRevision !== undefined) {
    if (!includesValue(CRM_SEARCH_THRESHOLD_REVISIONS, source.thresholdRevision)) {
      throw new TypeError('CRM search rank evidence threshold revision is invalid')
    }
    result.thresholdRevision = source.thresholdRevision
  }
  if (source.reasonClass !== undefined) {
    if (!includesValue(CRM_SEARCH_RANK_REASON_CLASSES, source.reasonClass)) {
      throw new TypeError('CRM search rank evidence reason class is invalid')
    }
    result.reasonClass = source.reasonClass
  }
  if (conservativeJsonbTextBytes(result) > CRM_SEARCH_RANK_EVIDENCE_MAX_BYTES) {
    throw new RangeError('CRM search rank evidence size exceeds 8,192 bytes')
  }
  return result
}

/** JSONB text adds one space after each structural comma and colon. */
function conservativeJsonbTextBytes(value: unknown): number {
  const compact = JSON.stringify(value)
  let structuralSeparators = 0
  let insideString = false
  let escaped = false
  for (const character of compact) {
    if (escaped) {
      escaped = false
      continue
    }
    if (insideString && character === '\\') {
      escaped = true
      continue
    }
    if (character === '"') {
      insideString = !insideString
      continue
    }
    if (!insideString && (character === ',' || character === ':')) {
      structuralSeparators += 1
    }
  }
  return encoder.encode(compact).byteLength + structuralSeparators
}

function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

export async function createCrmSearchTelemetryEvent(
  input: CreateCrmSearchTelemetryEventInput
): Promise<CrmSearchTelemetryEvent> {
  const organisationScopeId = requireUuid(input?.organisationScopeId, 'Organisation scope ID')
  const clientId = requireUuid(input?.clientId, 'Client ID')
  const correlationId = requireUuid(input?.correlationId, 'Correlation ID')
  if (!includesValue(CRM_SEARCH_EVENT_TYPES, input.eventType)) {
    throw new TypeError('CRM search event type is invalid')
  }
  if (!includesValue(actorTypes, input.actorType)
    || !includesValue(CRM_SEARCH_MODES, input.mode)
    || !includesValue(CRM_SEARCH_SURFACES, input.surface)
    || typeof input.sampled !== 'boolean'
    || !includesValue(fallbackClasses, input.fallbackClass)
    || !includesValue(statusClasses, input.statusClass)) {
    throw new TypeError('CRM search event enum is invalid')
  }
  const queryContext = await resolveQueryDigestContext(input)
  const latency = input.latencyMs ?? {}
  const keywordLatencyMs = requireLatency(latency.keyword, 'Keyword')
  const embeddingLatencyMs = requireLatency(latency.embedding, 'Embedding')
  const vectorLatencyMs = requireLatency(latency.vector, 'Vector')
  const joinBackLatencyMs = requireLatency(latency.joinBack, 'Join-back')
  const totalLatencyMs = requireLatency(latency.total, 'Total')

  return {
    organisationScopeId,
    clientId,
    correlationId,
    eventType: input.eventType,
    actorType: input.actorType,
    mode: input.mode,
    surface: input.surface,
    sampled: input.sampled,
    ...queryContext,
    keywordResultCount: requireBoundedInteger(input.keywordResultCount, 'Keyword', 50),
    semanticCandidateCount: requireBoundedInteger(input.semanticCandidateCount, 'Semantic candidate', 50),
    fusedResultCount: requireBoundedInteger(input.fusedResultCount, 'Fused', 50),
    rankEvidence: validateRankEvidence(input.rankEvidence),
    ...(keywordLatencyMs === undefined ? {} : { keywordLatencyMs }),
    ...(embeddingLatencyMs === undefined ? {} : { embeddingLatencyMs }),
    ...(vectorLatencyMs === undefined ? {} : { vectorLatencyMs }),
    ...(joinBackLatencyMs === undefined ? {} : { joinBackLatencyMs }),
    ...(totalLatencyMs === undefined ? {} : { totalLatencyMs }),
    fallbackClass: input.fallbackClass,
    statusClass: input.statusClass
  }
}

export type CrmSearchMetricLabels = Partial<{
  mode: CrmSearchMode
  surface: CrmSearchSurface
  entityType: CrmSearchEntityType
  provider: typeof providers[number]
  statusClass: CrmSearchStatusClass
  fallbackClass: CrmSearchFallbackClass
}>

export function buildCrmSearchMetricLabels(input: Record<string, unknown>): CrmSearchMetricLabels {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('CRM search metric labels must be an object')
  }
  const allowedKeys = new Set<string>(CRM_SEARCH_METRIC_LABEL_KEYS)
  if (Object.keys(input).some(key => !allowedKeys.has(key))) {
    throw new TypeError('CRM search metric label key is not allowlisted')
  }
  const validators: Record<typeof CRM_SEARCH_METRIC_LABEL_KEYS[number], readonly string[]> = {
    mode: CRM_SEARCH_MODES,
    surface: CRM_SEARCH_SURFACES,
    entityType: CRM_SEARCH_ENTITY_TYPES,
    provider: providers,
    statusClass: statusClasses,
    fallbackClass: fallbackClasses
  }
  const result: Record<string, string> = {}
  for (const key of CRM_SEARCH_METRIC_LABEL_KEYS) {
    if (!(key in input)) continue
    const value = input[key]
    if (typeof value !== 'string' || !validators[key].includes(value)) {
      throw new TypeError(`CRM search metric label ${key} is not allowlisted`)
    }
    result[key] = value
  }
  return result as CrmSearchMetricLabels
}
