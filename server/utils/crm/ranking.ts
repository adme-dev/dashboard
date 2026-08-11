import {
  CRM_SEARCH_ENTITY_TYPES,
  type CrmSearchEntityType
} from './searchIndex/contracts'

export const CRM_SEARCH_KEYWORD_ENTITY_TYPES = Object.freeze([
  ...CRM_SEARCH_ENTITY_TYPES,
  'activity',
  'task'
] as const)

export type CrmSearchKeywordEntityType = typeof CRM_SEARCH_KEYWORD_ENTITY_TYPES[number]

export const CRM_SEARCH_RANKING_CONTRACT = Object.freeze({
  revision: 'rrf-v1',
  dedupeRevision: 'entity-key-best-one-based-rank-v1',
  rankBase: 1,
  k: 60,
  keywordWeight: 1,
  semanticWeight: 0.7,
  keywordPoolLimit: 50,
  semanticPoolLimit: 30,
  finalLimitMaximum: 50
} as const)

export interface CrmSearchRankHit {
  entityType: CrmSearchKeywordEntityType
  entityId: string
  readonly [key: string]: unknown
}

export interface CrmSearchSemanticRankHit extends CrmSearchRankHit {
  entityType: CrmSearchEntityType
}

export interface FusedCrmSearchHit<
  KeywordHit extends CrmSearchRankHit = CrmSearchRankHit,
  SemanticHit extends CrmSearchSemanticRankHit = CrmSearchSemanticRankHit
> {
  key: string
  entityType: CrmSearchKeywordEntityType
  entityId: string
  fusedScore: number
  keywordContribution: number
  semanticContribution: number
  keywordRank: number | null
  semanticRank: number | null
  keywordHit?: KeywordHit
  semanticHit?: SemanticHit
}

type FusedTieBreakFields = Pick<
  FusedCrmSearchHit,
  'fusedScore' | 'keywordRank' | 'semanticRank' | 'entityType' | 'entityId'
>

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })
}

/** Stable V1 order: score, keyword rank, semantic rank, type, then ID. */
export function compareFusedCrmSearchHits(
  left: FusedTieBreakFields,
  right: FusedTieBreakFields
): number {
  if (left.fusedScore !== right.fusedScore) return right.fusedScore - left.fusedScore
  const leftKeyword = left.keywordRank ?? Number.POSITIVE_INFINITY
  const rightKeyword = right.keywordRank ?? Number.POSITIVE_INFINITY
  if (leftKeyword !== rightKeyword) return leftKeyword - rightKeyword
  const leftSemantic = left.semanticRank ?? Number.POSITIVE_INFINITY
  const rightSemantic = right.semanticRank ?? Number.POSITIVE_INFINITY
  if (leftSemantic !== rightSemantic) return leftSemantic - rightSemantic
  const typeOrder = compareText(left.entityType, right.entityType)
  return typeOrder !== 0 ? typeOrder : compareText(left.entityId, right.entityId)
}

function canonicalEntityKey(
  hit: unknown,
  allowedEntityTypes: readonly CrmSearchKeywordEntityType[]
): {
  key: string
  entityType: CrmSearchKeywordEntityType
  entityId: string
} {
  if (!hit || typeof hit !== 'object') throw new TypeError('CRM search rank hit must be an object')
  const candidate = hit as Partial<CrmSearchRankHit>
  if (typeof candidate.entityType !== 'string'
    || !allowedEntityTypes.includes(candidate.entityType as CrmSearchKeywordEntityType)) {
    throw new TypeError('CRM search rank hit entity type is invalid')
  }
  if (typeof candidate.entityId !== 'string'
    || candidate.entityId.length < 1
    || candidate.entityId.length > 200
    || containsControlCharacter(candidate.entityId)) {
    throw new TypeError('CRM search rank hit entity ID is invalid')
  }
  return {
    key: `${candidate.entityType}:${candidate.entityId}`,
    entityType: candidate.entityType,
    entityId: candidate.entityId
  }
}

function rankedDedupe<Hit extends CrmSearchRankHit>(
  hits: readonly Hit[],
  maximum: number,
  source: string,
  allowedEntityTypes: readonly CrmSearchKeywordEntityType[]
): Map<string, { hit: Hit, rank: number, entityType: CrmSearchKeywordEntityType, entityId: string }> {
  if (!Array.isArray(hits)) throw new TypeError(`${source} CRM search rank pool must be an array`)
  if (hits.length > maximum) throw new RangeError(`${source} CRM search rank pool exceeds ${maximum}`)
  const deduplicated = new Map<
    string,
    { hit: Hit, rank: number, entityType: CrmSearchKeywordEntityType, entityId: string }
  >()
  hits.forEach((hit, index) => {
    const identity = canonicalEntityKey(hit, allowedEntityTypes)
    if (!deduplicated.has(identity.key)) {
      deduplicated.set(identity.key, {
        hit,
        rank: index + CRM_SEARCH_RANKING_CONTRACT.rankBase,
        entityType: identity.entityType,
        entityId: identity.entityId
      })
    }
  })
  return deduplicated
}

export function reciprocalRankFusion<
  KeywordHit extends CrmSearchRankHit,
  SemanticHit extends CrmSearchSemanticRankHit
>(input: {
  keyword: readonly KeywordHit[]
  semantic: readonly SemanticHit[]
  finalLimit: number
}): Array<FusedCrmSearchHit<KeywordHit, SemanticHit>> {
  if (!input || !Number.isInteger(input.finalLimit)
    || input.finalLimit < 1
    || input.finalLimit > CRM_SEARCH_RANKING_CONTRACT.finalLimitMaximum) {
    throw new RangeError(
      `CRM search final limit must be between 1 and ${CRM_SEARCH_RANKING_CONTRACT.finalLimitMaximum}`
    )
  }
  const keyword = rankedDedupe(
    input.keyword,
    CRM_SEARCH_RANKING_CONTRACT.keywordPoolLimit,
    'Keyword',
    CRM_SEARCH_KEYWORD_ENTITY_TYPES
  )
  const semantic = rankedDedupe(
    input.semantic,
    CRM_SEARCH_RANKING_CONTRACT.semanticPoolLimit,
    'Semantic',
    CRM_SEARCH_ENTITY_TYPES
  )
  const keys = new Set([...keyword.keys(), ...semantic.keys()])
  const fused: Array<FusedCrmSearchHit<KeywordHit, SemanticHit>> = []

  for (const key of keys) {
    const keywordEntry = keyword.get(key)
    const semanticEntry = semantic.get(key)
    const identity = keywordEntry ?? semanticEntry
    if (!identity) continue
    const keywordRank = keywordEntry?.rank ?? null
    const semanticRank = semanticEntry?.rank ?? null
    const keywordContribution = keywordRank === null
      ? 0
      : CRM_SEARCH_RANKING_CONTRACT.keywordWeight
        / (CRM_SEARCH_RANKING_CONTRACT.k + keywordRank)
    const semanticContribution = semanticRank === null
      ? 0
      : CRM_SEARCH_RANKING_CONTRACT.semanticWeight
        / (CRM_SEARCH_RANKING_CONTRACT.k + semanticRank)
    fused.push({
      key,
      entityType: identity.entityType,
      entityId: identity.entityId,
      fusedScore: keywordContribution + semanticContribution,
      keywordContribution,
      semanticContribution,
      keywordRank,
      semanticRank,
      ...(keywordEntry ? { keywordHit: keywordEntry.hit } : {}),
      ...(semanticEntry ? { semanticHit: semanticEntry.hit } : {})
    })
  }

  // Complete source pools are deduplicated and fused before the caller limit.
  return fused.sort(compareFusedCrmSearchHits).slice(0, input.finalLimit)
}
