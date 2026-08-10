import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_MODEL_ID,
  CRM_SEARCH_POOLING,
  CRM_SEARCH_VECTOR_DIMENSIONS,
  type CrmSearchEntityType,
  type CrmSearchProviderMetadata
} from './contracts'

/**
 * Workers AI model contract:
 * https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/
 * Vectorize mutations are asynchronous, so these helpers only report provider
 * acceptance. Durable confirmation is owned by reconciliation.
 */

const providerIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const schemaPattern = /^crm-search-v[1-9][0-9]{0,5}$/
const hmacPattern = /^hmac-sha256:[a-f0-9]{64}$/
const keyVersionPattern = /^[A-Za-z0-9._:-]{1,80}$/
const readinessEntityType = '__crm_search_sentinel__' as const
const readinessSchemaVersion = '__crm_search_readiness_v1__' as const
export const CRM_SEARCH_VECTORIZE_BINDING = 'CRM_SEARCH_VECTORIZE' as const

export class CrmSearchProviderError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'CrmSearchProviderError'
    this.code = code
  }
}

export interface CrmSearchVector {
  id: string
  namespace: string
  values: readonly number[] | Float32Array
  metadata: CrmSearchProviderMetadata
}

export interface CrmSearchStoredVector {
  id: string
  namespace: string
  values?: unknown
  metadata?: Record<string, unknown>
}

export interface CrmSearchVectorizeMutationResult {
  mutationId: string
}

export interface CrmSearchProviderRuntime {
  ai: {
    run(
      model: typeof CRM_SEARCH_MODEL_ID,
      input: { text: string[], pooling: typeof CRM_SEARCH_POOLING }
    ): Promise<{ data?: Array<number[] | Float32Array> }>
  }
  vectorize: {
    upsert(vectors: CrmSearchVector[]): Promise<CrmSearchVectorizeMutationResult>
    deleteByIds(ids: string[]): Promise<CrmSearchVectorizeMutationResult>
    getByIds(ids: string[]): Promise<CrmSearchStoredVector[]>
  }
}

interface CrmSearchMetadataIndexDefinition {
  propertyName: string
  type?: string
  indexType?: string
}

interface CrmSearchReadinessRuntime {
  vectorize: CrmSearchProviderRuntime['vectorize'] & {
    listMetadataIndexes(): Promise<
      | CrmSearchMetadataIndexDefinition[]
      | { metadataIndexes?: CrmSearchMetadataIndexDefinition[] }
    >
    query(
      vector: readonly number[],
      options: {
        namespace: string
        topK: number
        returnMetadata: 'all'
        returnValues: false
        filter: {
          entityType: { $eq: typeof readinessEntityType }
          schemaVersion: { $eq: typeof readinessSchemaVersion }
        }
      }
    ): Promise<{ matches?: CrmSearchStoredVector[] }>
  }
}

export interface VerifyCrmSearchProviderReadinessInput {
  namespace: string
  sentinelId: string
  sentinelValues: readonly number[]
}

export interface VerifyCrmSearchProviderReadinessOptions {
  maximumPollAttempts?: number
  pollDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
}

export interface CrmSearchProvider {
  embedDocument(text: string): Promise<number[]>
  upsertVector(vector: CrmSearchVector): Promise<CrmSearchVectorizeMutationResult>
  deleteVector(vectorId: string): Promise<CrmSearchVectorizeMutationResult>
  getVector(vectorId: string): Promise<CrmSearchStoredVector | null>
}

function providerError(code: string): CrmSearchProviderError {
  return new CrmSearchProviderError(code)
}

function requireProviderId(value: unknown, code: string): string {
  if (typeof value !== 'string' || !providerIdPattern.test(value)
    || new TextEncoder().encode(value).length > 64) throw providerError(code)
  return value
}

function requireVector(values: unknown, code: string): number[] {
  if (!Array.isArray(values) && !(values instanceof Float32Array)) {
    throw providerError(code)
  }
  if (values.length !== CRM_SEARCH_VECTOR_DIMENSIONS) throw providerError(code)
  const vector = Array.from(values)
  if (!vector.every(value => typeof value === 'number' && Number.isFinite(value))) {
    throw providerError(code)
  }
  return vector
}

function requireMutationResult(value: unknown, code: string): CrmSearchVectorizeMutationResult {
  if (!value || typeof value !== 'object') throw providerError(code)
  const mutationId = (value as Record<string, unknown>).mutationId
  if (typeof mutationId !== 'string' || mutationId.length < 1 || mutationId.length > 256
    || Array.from(mutationId).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || codePoint === 127
    })) {
    throw providerError(code)
  }
  return { mutationId }
}

function requireMetadata(metadata: unknown): CrmSearchProviderMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw providerError('crm_search_invalid_vector')
  }
  const value = metadata as Record<string, unknown>
  if (Object.keys(value).length !== 5
    || !Object.keys(value).every(key => [
      'entityType', 'schemaVersion', 'sourceRevision', 'confirmationTag',
      'confirmationKeyVersion'
    ].includes(key))
    || typeof value.entityType !== 'string'
    || !CRM_SEARCH_ENTITY_TYPES.includes(value.entityType as CrmSearchEntityType)
    || typeof value.schemaVersion !== 'string'
    || !schemaPattern.test(value.schemaVersion)
    || !Number.isSafeInteger(value.sourceRevision)
    || Number(value.sourceRevision) < 1
    || typeof value.confirmationTag !== 'string'
    || !hmacPattern.test(value.confirmationTag)
    || typeof value.confirmationKeyVersion !== 'string'
    || !keyVersionPattern.test(value.confirmationKeyVersion)) {
    throw providerError('crm_search_invalid_vector')
  }
  return {
    entityType: value.entityType as CrmSearchEntityType,
    schemaVersion: value.schemaVersion,
    sourceRevision: Number(value.sourceRevision),
    confirmationTag: value.confirmationTag,
    confirmationKeyVersion: value.confirmationKeyVersion
  }
}

function exactStoredReadinessSentinel(
  value: unknown,
  expected: { id: string, namespace: string }
): boolean {
  if (!value || typeof value !== 'object') return false
  const stored = value as Record<string, unknown>
  const metadata = stored.metadata
  return stored.id === expected.id
    && stored.namespace === expected.namespace
    && !!metadata
    && typeof metadata === 'object'
    && (metadata as Record<string, unknown>).entityType === readinessEntityType
    && (metadata as Record<string, unknown>).schemaVersion === readinessSchemaVersion
}

function normalizeMetadataIndexes(value: unknown): CrmSearchMetadataIndexDefinition[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? (value as Record<string, unknown>).metadataIndexes
      : null
  if (!Array.isArray(candidate)) throw providerError('crm_search_metadata_indexes_not_ready')
  return candidate as CrmSearchMetadataIndexDefinition[]
}

function hasExactMetadataIndexes(value: unknown): boolean {
  const indexes = normalizeMetadataIndexes(value)
  if (indexes.length !== 2) return false
  const actual = indexes.map((index) => {
    if (!index || typeof index !== 'object') return null
    const type = index.type ?? index.indexType
    return type === 'string' && typeof index.propertyName === 'string'
      ? index.propertyName
      : null
  })
  return actual.includes('entityType') && actual.includes('schemaVersion')
}

async function pollReadiness<Value>(
  read: () => Promise<Value>,
  matches: (value: Value) => boolean,
  options: Required<VerifyCrmSearchProviderReadinessOptions>
): Promise<Value | null> {
  for (let attempt = 1; attempt <= options.maximumPollAttempts; attempt += 1) {
    const value = await read()
    if (matches(value)) return value
    if (attempt < options.maximumPollAttempts) await options.sleep(options.pollDelayMs)
  }
  return null
}

export function resolveCrmSearchProviderRuntime(event: unknown): CrmSearchProviderRuntime | null {
  if (!event || typeof event !== 'object') return null
  const context = (event as Record<string, unknown>).context
  if (!context || typeof context !== 'object') return null
  const cloudflare = (context as Record<string, unknown>).cloudflare
  if (!cloudflare || typeof cloudflare !== 'object') return null
  const env = (cloudflare as Record<string, unknown>).env
  if (!env || typeof env !== 'object') return null
  const bindings = env as Record<string, unknown>
  const ai = bindings.AI
  const vectorize = bindings[CRM_SEARCH_VECTORIZE_BINDING]
  if (!ai || typeof ai !== 'object' || typeof (ai as Record<string, unknown>).run !== 'function'
    || !vectorize || typeof vectorize !== 'object'
    || typeof (vectorize as Record<string, unknown>).upsert !== 'function'
    || typeof (vectorize as Record<string, unknown>).deleteByIds !== 'function'
    || typeof (vectorize as Record<string, unknown>).getByIds !== 'function') return null

  const aiBinding = ai as CrmSearchProviderRuntime['ai']
  const vectorizeBinding = vectorize as CrmSearchProviderRuntime['vectorize']
  return {
    ai: {
      run: (model, input) => Reflect.apply(aiBinding.run, aiBinding, [model, input])
    },
    vectorize: {
      upsert: vectors => Reflect.apply(vectorizeBinding.upsert, vectorizeBinding, [vectors]),
      deleteByIds: ids => Reflect.apply(vectorizeBinding.deleteByIds, vectorizeBinding, [ids]),
      getByIds: ids => Reflect.apply(vectorizeBinding.getByIds, vectorizeBinding, [ids])
    }
  }
}

export function createCrmSearchProvider(runtime: CrmSearchProviderRuntime): CrmSearchProvider {
  if (!runtime?.ai || !runtime.vectorize) throw providerError('crm_search_provider_unavailable')
  return {
    async embedDocument(text) {
      if (typeof text !== 'string' || text.length === 0 || text.length > 16_000) {
        throw providerError('crm_search_invalid_document')
      }
      let result: { data?: Array<number[] | Float32Array> }
      try {
        result = await runtime.ai.run(CRM_SEARCH_MODEL_ID, {
          text: [text],
          pooling: CRM_SEARCH_POOLING
        })
      } catch {
        throw providerError('crm_search_workers_ai_failed')
      }
      if (!Array.isArray(result?.data) || result.data.length !== 1) {
        throw providerError('crm_search_invalid_embedding')
      }
      return requireVector(result.data[0], 'crm_search_invalid_embedding')
    },

    async upsertVector(vector) {
      const sent: CrmSearchVector = {
        id: requireProviderId(vector?.id, 'crm_search_invalid_vector'),
        namespace: requireProviderId(vector?.namespace, 'crm_search_invalid_vector'),
        values: requireVector(vector?.values, 'crm_search_invalid_vector'),
        metadata: requireMetadata(vector?.metadata)
      }
      try {
        return requireMutationResult(
          await runtime.vectorize.upsert([sent]),
          'crm_search_vectorize_upsert_failed'
        )
      } catch (error) {
        if (error instanceof CrmSearchProviderError) throw error
        throw providerError('crm_search_vectorize_upsert_failed')
      }
    },

    async deleteVector(vectorId) {
      const id = requireProviderId(vectorId, 'crm_search_invalid_vector')
      try {
        return requireMutationResult(
          await runtime.vectorize.deleteByIds([id]),
          'crm_search_vectorize_delete_failed'
        )
      } catch (error) {
        if (error instanceof CrmSearchProviderError) throw error
        throw providerError('crm_search_vectorize_delete_failed')
      }
    },

    async getVector(vectorId) {
      const id = requireProviderId(vectorId, 'crm_search_invalid_vector')
      let rows: CrmSearchStoredVector[]
      try {
        rows = await runtime.vectorize.getByIds([id])
      } catch {
        throw providerError('crm_search_vectorize_read_failed')
      }
      if (!Array.isArray(rows) || rows.length > 1) {
        throw providerError('crm_search_invalid_stored_vector')
      }
      return rows[0] ?? null
    }
  }
}

export function confirmStoredCrmSearchVector(
  stored: unknown,
  expected: {
    id: string
    namespace: string
    entityType: CrmSearchEntityType
    schemaVersion: string
    sourceRevision: number
    confirmationTag: string
    confirmationKeyVersion: string
  }
): boolean {
  try {
    const expectedId = requireProviderId(expected.id, 'crm_search_invalid_confirmation')
    const expectedNamespace = requireProviderId(expected.namespace, 'crm_search_invalid_confirmation')
    const expectedMetadata = requireMetadata({
      entityType: expected.entityType,
      schemaVersion: expected.schemaVersion,
      sourceRevision: expected.sourceRevision,
      confirmationTag: expected.confirmationTag,
      confirmationKeyVersion: expected.confirmationKeyVersion
    })
    if (!stored || typeof stored !== 'object') return false
    const row = stored as Record<string, unknown>
    if (row.id !== expectedId || row.namespace !== expectedNamespace
      || !row.metadata || typeof row.metadata !== 'object') return false
    const metadata = row.metadata as Record<string, unknown>
    return metadata.entityType === expectedMetadata.entityType
      && metadata.schemaVersion === expectedMetadata.schemaVersion
      && metadata.sourceRevision === expectedMetadata.sourceRevision
      && metadata.confirmationTag === expectedMetadata.confirmationTag
      && metadata.confirmationKeyVersion === expectedMetadata.confirmationKeyVersion
  } catch {
    return false
  }
}

export async function verifyCrmSearchProviderReadiness(
  input: VerifyCrmSearchProviderReadinessInput,
  runtime: CrmSearchReadinessRuntime,
  rawOptions: VerifyCrmSearchProviderReadinessOptions = {}
): Promise<{
  metadataIndexesReady: true
  sentinelRoundTripConfirmed: true
  sentinelAbsenceConfirmed: true
}> {
  const namespace = requireProviderId(input.namespace, 'crm_search_invalid_readiness')
  const sentinelId = requireProviderId(input.sentinelId, 'crm_search_invalid_readiness')
  const values = requireVector(input.sentinelValues, 'crm_search_invalid_readiness')
  const maximumPollAttempts = rawOptions.maximumPollAttempts ?? 6
  const pollDelayMs = rawOptions.pollDelayMs ?? 50
  if (!Number.isSafeInteger(maximumPollAttempts)
    || maximumPollAttempts < 1 || maximumPollAttempts > 20
    || !Number.isSafeInteger(pollDelayMs) || pollDelayMs < 0 || pollDelayMs > 1_000
    || (rawOptions.sleep !== undefined && typeof rawOptions.sleep !== 'function')) {
    throw providerError('crm_search_invalid_readiness')
  }
  const options: Required<VerifyCrmSearchProviderReadinessOptions> = {
    maximumPollAttempts,
    pollDelayMs,
    sleep: rawOptions.sleep ?? (delayMs => new Promise(resolve => setTimeout(resolve, delayMs)))
  }
  let indexes: unknown
  try {
    indexes = await runtime.vectorize.listMetadataIndexes()
  } catch {
    throw providerError('crm_search_metadata_indexes_not_ready')
  }
  if (!hasExactMetadataIndexes(indexes)) {
    throw providerError('crm_search_metadata_indexes_not_ready')
  }

  const sentinel = {
    id: sentinelId,
    namespace,
    values,
    metadata: {
      entityType: readinessEntityType,
      schemaVersion: readinessSchemaVersion
    }
  }
  try {
    requireMutationResult(
      await runtime.vectorize.upsert([sentinel as never]),
      'crm_search_sentinel_upsert_failed'
    )
    const exact = await pollReadiness(
      () => runtime.vectorize.getByIds([sentinelId]),
      rows => Array.isArray(rows) && rows.length === 1
        && exactStoredReadinessSentinel(rows[0], { id: sentinelId, namespace }),
      options
    )
    if (!exact) {
      throw providerError('crm_search_sentinel_not_confirmed')
    }
    const filtered = await pollReadiness(
      () => runtime.vectorize.query(values, {
        namespace,
        topK: 1,
        returnMetadata: 'all',
        returnValues: false,
        filter: {
          entityType: { $eq: readinessEntityType },
          schemaVersion: { $eq: readinessSchemaVersion }
        }
      }),
      result => Array.isArray(result?.matches)
        && result.matches.some(match => exactStoredReadinessSentinel(
          match,
          { id: sentinelId, namespace }
        )),
      options
    )
    if (!filtered) throw providerError('crm_search_sentinel_filter_not_confirmed')
    requireMutationResult(
      await runtime.vectorize.deleteByIds([sentinelId]),
      'crm_search_sentinel_delete_failed'
    )
    const afterDelete = await pollReadiness(
      () => runtime.vectorize.getByIds([sentinelId]),
      rows => Array.isArray(rows) && rows.length === 0,
      options
    )
    if (!afterDelete) {
      throw providerError('crm_search_sentinel_absence_not_confirmed')
    }
    return {
      metadataIndexesReady: true,
      sentinelRoundTripConfirmed: true,
      sentinelAbsenceConfirmed: true
    }
  } catch (error) {
    if (error instanceof CrmSearchProviderError) throw error
    throw providerError('crm_search_provider_readiness_failed')
  }
}
