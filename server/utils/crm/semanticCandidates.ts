import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_MODEL_ID,
  CRM_SEARCH_POOLING,
  CRM_SEARCH_VECTOR_DIMENSIONS,
  type CrmSearchEntityType
} from './searchIndex/contracts'

export const CRM_SEARCH_SEMANTIC_RETRIEVAL_CONTRACT = Object.freeze({
  revision: 'crm-search-semantic-retrieval-v1',
  thresholdRevision: 'cosine-0.75-v1',
  modelId: CRM_SEARCH_MODEL_ID,
  pooling: CRM_SEARCH_POOLING,
  dimensions: CRM_SEARCH_VECTOR_DIMENSIONS,
  topK: 30,
  maximumTopK: 50,
  minimumScore: 0.75
} as const)

const providerIdentityPattern = /^[A-Za-z0-9_-]{43}$/u
const schemaVersionPattern = /^crm-search-v[1-9][0-9]{0,5}$/u
const embeddingResponseKeys = new Set(['data', 'shape', 'pooling'])

export interface CrmSearchSemanticMatch {
  vectorId: string
  score: number
  semanticRank: number
}

export interface BuildCrmSearchVectorizeQueryOptionsInput {
  namespace: string
  activeSchemaVersion: string
  allowedEntityTypes: readonly CrmSearchEntityType[]
}

function requireProviderIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !providerIdentityPattern.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function requireSchemaVersion(value: unknown): string {
  if (typeof value !== 'string' || !schemaVersionPattern.test(value)) {
    throw new TypeError('CRM search active schema version is invalid')
  }
  return value
}

export function buildCrmSearchEmbeddingRequest(query: string): {
  text: [string]
  pooling: typeof CRM_SEARCH_POOLING
} {
  if (typeof query !== 'string' || query.length < 1) {
    throw new TypeError('CRM search embedding query is invalid')
  }
  return { text: [query], pooling: CRM_SEARCH_POOLING }
}

export function parseCrmSearchEmbedding(value: unknown): number[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('CRM search embedding response is invalid')
  }
  const response = value as Record<string, unknown>
  const keys = Object.keys(response)
  const vector = Array.isArray(response.data) && response.data.length === 1
    ? response.data[0]
    : null
  const shapeValid = response.shape === undefined
    || (Array.isArray(response.shape)
      && response.shape.length === 2
      && response.shape[0] === 1
      && response.shape[1] === CRM_SEARCH_VECTOR_DIMENSIONS)
  const poolingValid = response.pooling === undefined || response.pooling === CRM_SEARCH_POOLING
  if (!keys.includes('data')
    || keys.some(key => !embeddingResponseKeys.has(key))
    || !shapeValid
    || !poolingValid
    || (!Array.isArray(vector) && !(vector instanceof Float32Array))
    || vector.length !== CRM_SEARCH_VECTOR_DIMENSIONS
    || !Array.from(vector).every(component => typeof component === 'number' && Number.isFinite(component))) {
    throw new TypeError('CRM search embedding response is invalid')
  }
  return Array.from(vector)
}

export function buildCrmSearchVectorizeQueryOptions(
  input: BuildCrmSearchVectorizeQueryOptionsInput
): {
  topK: typeof CRM_SEARCH_SEMANTIC_RETRIEVAL_CONTRACT.topK
  namespace: string
  returnValues: false
  returnMetadata: 'none'
  filter: {
    schemaVersion: string
    entityType: { $in: CrmSearchEntityType[] }
  }
} {
  const namespace = requireProviderIdentity(input?.namespace, 'CRM search namespace')
  const activeSchemaVersion = requireSchemaVersion(input?.activeSchemaVersion)
  if (!Array.isArray(input?.allowedEntityTypes)
    || input.allowedEntityTypes.length < 1
    || input.allowedEntityTypes.length > CRM_SEARCH_ENTITY_TYPES.length
    || new Set(input.allowedEntityTypes).size !== input.allowedEntityTypes.length
    || input.allowedEntityTypes.some(type => !CRM_SEARCH_ENTITY_TYPES.includes(type))) {
    throw new TypeError('CRM search entity filter is invalid')
  }
  return {
    topK: CRM_SEARCH_SEMANTIC_RETRIEVAL_CONTRACT.topK,
    namespace,
    returnValues: false,
    returnMetadata: 'none',
    filter: {
      schemaVersion: activeSchemaVersion,
      entityType: { $in: [...input.allowedEntityTypes] }
    }
  }
}

export function filterSemanticMatches(
  matches: unknown,
  options: { minimumScore?: number } = {}
): CrmSearchSemanticMatch[] {
  if (!Array.isArray(matches)
    || matches.length > CRM_SEARCH_SEMANTIC_RETRIEVAL_CONTRACT.topK) {
    throw new TypeError('CRM search Vectorize matches are invalid')
  }
  const minimumScore = options.minimumScore
    ?? CRM_SEARCH_SEMANTIC_RETRIEVAL_CONTRACT.minimumScore
  if (typeof minimumScore !== 'number' || !Number.isFinite(minimumScore)
    || minimumScore < -1 || minimumScore > 1) {
    throw new TypeError('CRM search semantic threshold is invalid')
  }
  const seen = new Set<string>()
  const filtered: CrmSearchSemanticMatch[] = []
  matches.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
    const candidate = raw as Record<string, unknown>
    const id = candidate.id
    const score = candidate.score
    if (typeof id !== 'string' || !providerIdentityPattern.test(id)
      || typeof score !== 'number' || !Number.isFinite(score)
      || score < minimumScore || score > 1 || seen.has(id)) return
    seen.add(id)
    filtered.push({ vectorId: id, score, semanticRank: index + 1 })
  })
  return filtered
}
