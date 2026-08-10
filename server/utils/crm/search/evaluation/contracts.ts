export const CRM_SEARCH_EVALUATION_SCHEMA_VERSION = 'crm-search-evaluation-v1' as const
export const CRM_SEARCH_BOOTSTRAP_SAMPLES = 1_000 as const
export const CRM_SEARCH_APPROVAL_MAX_AGE_DAYS = 14 as const

export type CrmSearchEvaluationEntityType = 'person' | 'company' | 'opportunity'
export type CrmSearchLoadStratum = 'cold' | 'warm' | 'concurrent'

export interface CrmSearchRelevanceJudgement {
  entityKeyDigest: string
  relevance: number
}

export interface CrmSearchMetricCase {
  queryKeyDigest: string
  strata: string[]
  judgements: CrmSearchRelevanceJudgement[]
  keywordResults: string[]
  assistResults: string[]
}

export interface CrmSearchMetricSummary {
  precisionAt5: number
  recallAt10: number
  mrr: number
  ndcgAt10: number
}

export interface CrmSearchEvaluationMetrics extends CrmSearchMetricSummary {
  keywordBaseline: CrmSearchMetricSummary
  noResultFalsePositiveRate: number
  bootstrapConfidenceIntervals: {
    naturalLanguageNdcgAt10Delta: {
      method: 'paired'
      confidenceLevel: 0.95
      samples: number
      lower: number
      upper: number
    }
  }
}

export interface CrmSearchFixtureBundle {
  schemaVersion: string
  corpus: {
    version: string
    sha256: string
    piiFree: boolean
    records: Array<Record<string, unknown>>
  }
  development: {
    version: string
    sha256: string
    queries: Array<{
      queryKeyDigest: string
      clientKey: string
      entityType: CrmSearchEvaluationEntityType
      strata: string[]
      relevantEntityDigests: string[]
    }>
  }
  holdoutManifest: {
    version: string
    sealed: boolean
    sealedJudgementSha256: string
    queryCount: number
    clientCounts: Record<string, number>
    entityTypeCounts: Record<CrmSearchEvaluationEntityType, number>
    strataCounts: Record<string, number>
  }
  preregistration: {
    sha256: string
    frozenAt: string
    candidateIds: string[]
    selectionRule: string
  }
  adjudicationManifest: {
    sha256: string
    implementationAuthorIds: string[]
    fixtureAuthorIds: string[]
    judgementAuthorIds: string[]
    domainReviewerIds: string[]
    adjudicatorIds: string[]
    disagreementCount: number
    resolvedCount: number
  }
}

export interface CrmSearchEvaluationRunRequest {
  fixtureVersion: string
  sealedArtifactId: string
  implementationGitSha: string
  schemaVersion: string
  requestedBy: string
}

export interface CrmSearchPromotionGateDecision {
  passed: boolean
  failures: string[]
}
