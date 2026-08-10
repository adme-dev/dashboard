import type { H3Event } from 'h3'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import {
  CRM_KEYWORD_POOL_LIMIT,
  runCrmKeywordSearch,
  type CrmSearchHit
} from './search'
import type { CrmSearchContext } from './searchContext'
import { resolveAgencyCrmSearchContext } from './searchContext'
import type { NormalizedCrmSearchRequest } from './searchRequest'
import {
  reciprocalRankFusion
} from './ranking'
import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_MAX_INPUT_TOKENS,
  CRM_SEARCH_MODEL_ID,
  CRM_SEARCH_VECTOR_DIMENSIONS,
  type CrmSearchMode
} from './searchIndex/contracts'
import { deriveCrmSearchNamespace } from './searchIndex/identity'
import {
  markCrmSearchProviderAttemptSent
} from './searchIndex/operationRepository'
import {
  loadCrmSearchPolicySnapshot,
  type CrmSearchPolicySnapshot
} from './searchIndex/policyRepository'
import {
  reserveCrmSearchUsage,
  settleCrmSearchUsage
} from './searchIndex/usageRepository'
import {
  resolveCrmSearchAnalyticsKeyring,
  selectActiveCrmSearchAnalyticsDigestKey
} from './searchIndex/analyticsKeyring'
import {
  deriveCrmSearchQueryDigest,
  queryLengthBucket,
  type CrmSearchPrecomputedQueryDigestContext,
  type CrmSearchRankEvidence,
  type CrmSearchTelemetryEvent
} from './searchIndex/telemetry'
import { persistCrmSearchTelemetry } from './searchIndex/telemetryRepository'
import {
  buildCrmSearchEmbeddingRequest,
  buildCrmSearchVectorizeQueryOptions,
  filterSemanticMatches,
  parseCrmSearchEmbedding
} from './semanticCandidates'
import {
  createCrmSemanticJoinBackDependencies,
  joinBackSemanticCandidates,
  type CrmSearchJoinedSemanticHit
} from './semanticJoinBack'
import { runCrmShadowSearch } from './shadowSearch'

export const CRM_SEARCH_RETRIEVAL_DEADLINE = Object.freeze({
  revision: 'crm-search-semantic-deadline-v1',
  defaultMs: 500,
  maximumMs: 750
} as const)

type CrmSearchProviderName = 'workers_ai' | 'vectorize'
type CrmRetrievalFallbackReason = 'disabled' | 'privacy' | 'budget' | 'timeout' | 'provider' | 'semantic_db'

export interface CrmRetrievalResult {
  results: CrmSearchHit[]
  mode: 'keyword' | 'shadow' | 'assist'
  fallbackReason?: CrmRetrievalFallbackReason
}

interface CrmProviderUsageReservation {
  status: 'reserved'
  reservationId: string
  providerAttemptId: string
  controlRevision: number
  policyRevision: number
}

interface CrmSafeTelemetryRecord {
  eventType: 'search.keyword_only' | 'search.shadow_completed' | 'search.assist_completed' | 'search.fallback' | 'search.security_rejection'
  organisationScopeId: string
  clientId: string
  correlationId: string
  actorType: CrmSearchContext['actorType']
  queryDigestContext: CrmSearchPrecomputedQueryDigestContext
  keywordResultCount: number
  semanticCandidateCount: number
  fusedResultCount: number
  rankEvidence: CrmSearchRankEvidence
  fallbackClass: 'none' | 'mode_off' | 'privacy_guard' | 'budget_exhausted' | 'deadline' | 'provider_unavailable' | 'policy_changed' | 'authorization_changed' | 'ledger_failure' | 'join_back_failure' | 'validation_failure'
  metricLabels: {
    mode: CrmSearchMode
    surface: CrmSearchContext['surface']
    provider: 'postgres' | CrmSearchProviderName
    statusClass: 'keyword_only' | 'shadow_completed' | 'assist_completed' | 'fallback' | 'security_rejection'
    fallbackClass: CrmSafeTelemetryRecord['fallbackClass']
  }
}

interface CrmSemanticDeadlineInput<T> {
  deadlineMs: number
  task: () => Promise<T>
  onLateCompletion: (work: Promise<T>) => void
}

type CrmSemanticDeadlineResult<T>
  = | { status: 'completed', value: T }
    | { status: 'timed_out' }

export interface CrmRetrievalDependencies {
  runKeyword: (
    context: CrmSearchContext,
    query: string,
    poolLimit: number
  ) => Promise<CrmSearchHit[]>
  prepareTelemetry: (input: {
    context: CrmSearchContext
    query: string
  }) => Promise<CrmSearchPrecomputedQueryDigestContext | null>
  loadFreshPolicy: (context: CrmSearchContext) => Promise<CrmSearchPolicySnapshot>
  deriveCanonicalNamespace: (context: CrmSearchContext) => Promise<string>
  reserveProviderUsage: (input: {
    organisationScopeId: string
    clientId: string
    correlationId: string
    surface: CrmSearchContext['surface']
    provider: CrmSearchProviderName
    providerAction: 'query'
    modelInputTokens: number
    queryDimensions: number
    providerCalls: 1
  }) => Promise<CrmProviderUsageReservation | { status: 'denied' }>
  markProviderCallSent: (input: {
    correlationId: string
    providerAttemptId: string
    expectedControlRevision: number
    expectedPolicyRevision: number
  }) => Promise<unknown>
  settleProviderUsage: (input: {
    reservationId: string
    providerCallSent: boolean
    completion: 'completed' | 'failed' | 'abandoned' | 'late_discarded' | 'released_no_call'
  }) => Promise<unknown>
  runWithinDeadline: <T>(input: CrmSemanticDeadlineInput<T>) => Promise<CrmSemanticDeadlineResult<T>>
  embedQuery: (input: {
    model: typeof CRM_SEARCH_MODEL_ID
    request: { text: [string], pooling: 'cls' }
    correlationId: string
  }) => Promise<unknown>
  queryVectorize: (input: {
    vector: readonly number[]
    options: ReturnType<typeof buildCrmSearchVectorizeQueryOptions>
    correlationId: string
  }) => Promise<unknown>
  joinBack: (input: {
    context: CrmSearchContext
    activeSchemaVersion: string
    canonicalNamespace: string
    candidates: ReturnType<typeof filterSemanticMatches>
    telemetryContext: {
      mode: Exclude<CrmSearchMode, 'off'>
      queryDigestContext: CrmSearchPrecomputedQueryDigestContext
      keywordResultCount: number
    }
  }) => Promise<CrmSearchJoinedSemanticHit[]>
  emitTelemetry: (record: CrmSafeTelemetryRecord) => Promise<void>
  continueLateSettlement: (
    input: {
      reservationId: string | null
      correlationId: string
      providerCallSent: boolean
      completion: 'late_discarded'
    },
    work?: Promise<unknown>
  ) => void
  scheduleShadow?: (input: {
    context: CrmSearchContext
    request: NormalizedCrmSearchRequest
    keyword: readonly CrmSearchHit[]
    providerEnabled: boolean
    retrieveSemantic: () => Promise<unknown>
  }) => CrmRetrievalResult
}

interface SemanticBranchSuccess {
  status: 'success'
  semantic: CrmSearchJoinedSemanticHit[]
  fused: CrmSearchHit[]
}

interface SemanticBranchFallback {
  status: 'fallback'
  reason: Exclude<CrmRetrievalFallbackReason, 'privacy'>
  provider: 'postgres' | CrmSearchProviderName
}

type SemanticBranchResult = SemanticBranchSuccess | SemanticBranchFallback

function keywordResult(
  keyword: readonly CrmSearchHit[],
  request: NormalizedCrmSearchRequest,
  fallbackReason?: CrmRetrievalFallbackReason
): CrmRetrievalResult {
  return {
    results: keyword.slice(0, request.limit),
    mode: 'keyword',
    ...(fallbackReason ? { fallbackReason } : {})
  }
}

function fallbackClass(reason: CrmRetrievalFallbackReason): CrmSafeTelemetryRecord['fallbackClass'] {
  if (reason === 'disabled') return 'policy_changed'
  if (reason === 'privacy') return 'privacy_guard'
  if (reason === 'budget') return 'budget_exhausted'
  if (reason === 'timeout') return 'deadline'
  if (reason === 'semantic_db') return 'join_back_failure'
  return 'provider_unavailable'
}

async function emitSafeTelemetry(
  dependencies: CrmRetrievalDependencies,
  context: CrmSearchContext,
  queryDigestContext: CrmSearchPrecomputedQueryDigestContext | null,
  input: {
    eventType: CrmSafeTelemetryRecord['eventType']
    mode: CrmSearchMode
    provider: CrmSafeTelemetryRecord['metricLabels']['provider']
    statusClass: CrmSafeTelemetryRecord['metricLabels']['statusClass']
    fallbackReason?: CrmRetrievalFallbackReason
    keywordResultCount: number
    semanticCandidateCount?: number
    fusedResultCount?: number
  }
): Promise<void> {
  if (!queryDigestContext) return
  const projectedFallback = input.fallbackReason ? fallbackClass(input.fallbackReason) : 'none'
  const semanticCandidateCount = input.semanticCandidateCount ?? 0
  const fusedResultCount = input.fusedResultCount ?? 0
  try {
    await dependencies.emitTelemetry({
      eventType: input.eventType,
      organisationScopeId: context.organisationScopeId,
      clientId: context.clientId,
      correlationId: context.correlationId,
      actorType: context.actorType,
      queryDigestContext,
      keywordResultCount: input.keywordResultCount,
      semanticCandidateCount,
      fusedResultCount,
      rankEvidence: {
        resultCount: fusedResultCount,
        ...(input.fallbackReason ? { reasonClass: projectedFallback } : {})
      },
      fallbackClass: projectedFallback,
      metricLabels: {
        mode: input.mode,
        surface: context.surface,
        provider: input.provider,
        statusClass: input.statusClass,
        fallbackClass: projectedFallback
      }
    })
  } catch {
    // Search telemetry is fail-closed and best-effort at this boundary. It may
    // never change the authorized visible result or log the rejected payload.
  }
}

function validPolicy(
  snapshot: CrmSearchPolicySnapshot,
  expectedMode: Exclude<CrmSearchMode, 'off'>,
  reservation?: CrmProviderUsageReservation
): snapshot is CrmSearchPolicySnapshot & {
  effectiveMode: Exclude<CrmSearchMode, 'off'>
  globalState: 'enabled'
  controlRevision: number
  policyRevision: number
  activeSchemaVersion: string
} {
  return snapshot.providerEnabled === true
    && snapshot.globalState === 'enabled'
    && snapshot.effectiveMode === expectedMode
    && Number.isSafeInteger(snapshot.controlRevision)
    && Number.isSafeInteger(snapshot.policyRevision)
    && typeof snapshot.activeSchemaVersion === 'string'
    && (!reservation
      || (snapshot.controlRevision === reservation.controlRevision
        && snapshot.policyRevision === reservation.policyRevision))
}

function isBudgetFailure(error: unknown): boolean {
  return error instanceof Error && /budget_exhausted|budget/i.test(error.message)
}

async function reserveProvider(
  dependencies: CrmRetrievalDependencies,
  context: CrmSearchContext,
  provider: CrmSearchProviderName
): Promise<CrmProviderUsageReservation | { status: 'denied' }> {
  try {
    return await dependencies.reserveProviderUsage({
      organisationScopeId: context.organisationScopeId,
      clientId: context.clientId,
      correlationId: context.correlationId,
      surface: context.surface,
      provider,
      providerAction: 'query',
      modelInputTokens: provider === 'workers_ai' ? CRM_SEARCH_MAX_INPUT_TOKENS : 0,
      queryDimensions: provider === 'vectorize' ? CRM_SEARCH_VECTOR_DIMENSIONS : 0,
      providerCalls: 1
    })
  } catch (error) {
    if (isBudgetFailure(error)) return { status: 'denied' }
    throw error
  }
}

async function releaseReservation(
  dependencies: CrmRetrievalDependencies,
  reservation: CrmProviderUsageReservation
): Promise<void> {
  await dependencies.settleProviderUsage({
    reservationId: reservation.reservationId,
    providerCallSent: false,
    completion: 'released_no_call'
  })
}

async function invokeReservedProvider<T>(input: {
  dependencies: CrmRetrievalDependencies
  context: CrmSearchContext
  reservation: CrmProviderUsageReservation
  isAbandoned: () => boolean
  call: () => Promise<T>
}): Promise<T> {
  let sent = false
  let settled = false
  try {
    if (input.isAbandoned()) {
      await input.dependencies.settleProviderUsage({
        reservationId: input.reservation.reservationId,
        providerCallSent: false,
        completion: 'released_no_call'
      })
      settled = true
      throw new Error('crm_search_semantic_deadline_elapsed')
    }
    await input.dependencies.markProviderCallSent({
      correlationId: input.context.correlationId,
      providerAttemptId: input.reservation.providerAttemptId,
      expectedControlRevision: input.reservation.controlRevision,
      expectedPolicyRevision: input.reservation.policyRevision
    })
    sent = true
    if (input.isAbandoned()) {
      await input.dependencies.settleProviderUsage({
        reservationId: input.reservation.reservationId,
        providerCallSent: true,
        completion: 'late_discarded'
      })
      settled = true
      throw new Error('crm_search_semantic_deadline_elapsed')
    }
    const result = await input.call()
    await input.dependencies.settleProviderUsage({
      reservationId: input.reservation.reservationId,
      providerCallSent: true,
      completion: input.isAbandoned() ? 'late_discarded' : 'completed'
    })
    settled = true
    return result
  } catch (error) {
    if (!settled) {
      try {
        await input.dependencies.settleProviderUsage({
          reservationId: input.reservation.reservationId,
          providerCallSent: sent,
          completion: sent
            ? input.isAbandoned() ? 'late_discarded' : 'failed'
            : 'released_no_call'
        })
      } catch {
        // Preserve the semantic failure. The durable precommit remains visible
        // for reconciliation instead of being hidden by a second exception.
      }
    }
    throw error
  }
}

async function executeSemanticBranch(input: {
  context: CrmSearchContext
  request: NormalizedCrmSearchRequest
  keyword: readonly CrmSearchHit[]
  initialPolicy: CrmSearchPolicySnapshot & {
    effectiveMode: Exclude<CrmSearchMode, 'off'>
    globalState: 'enabled'
    controlRevision: number
    policyRevision: number
    activeSchemaVersion: string
  }
  dependencies: CrmRetrievalDependencies
  queryDigestContext: CrmSearchPrecomputedQueryDigestContext
  keywordResultCount: number
  setActiveReservation: (
    reservation: CrmProviderUsageReservation | null,
    provider: CrmSearchProviderName | null
  ) => void
  isAbandoned: () => boolean
}): Promise<SemanticBranchResult> {
  const { context, request, initialPolicy, dependencies } = input
  let namespace: string
  try {
    namespace = await dependencies.deriveCanonicalNamespace(context)
  } catch {
    return { status: 'fallback', reason: 'semantic_db', provider: 'postgres' }
  }

  let aiReservation: CrmProviderUsageReservation | { status: 'denied' }
  try {
    aiReservation = await reserveProvider(dependencies, context, 'workers_ai')
  } catch {
    return { status: 'fallback', reason: 'provider', provider: 'workers_ai' }
  }
  if (aiReservation.status === 'denied') {
    return { status: 'fallback', reason: 'budget', provider: 'workers_ai' }
  }
  input.setActiveReservation(aiReservation, 'workers_ai')

  let beforeEmbedding: CrmSearchPolicySnapshot
  try {
    beforeEmbedding = await dependencies.loadFreshPolicy(context)
  } catch {
    await releaseReservation(dependencies, aiReservation)
    input.setActiveReservation(null, null)
    return { status: 'fallback', reason: 'provider', provider: 'postgres' }
  }
  if (!validPolicy(beforeEmbedding, initialPolicy.effectiveMode, aiReservation)
    || beforeEmbedding.activeSchemaVersion !== initialPolicy.activeSchemaVersion) {
    await releaseReservation(dependencies, aiReservation)
    input.setActiveReservation(null, null)
    return { status: 'fallback', reason: 'disabled', provider: 'postgres' }
  }

  let embedding: number[]
  try {
    embedding = await invokeReservedProvider({
      dependencies,
      context,
      reservation: aiReservation,
      isAbandoned: input.isAbandoned,
      call: async () => parseCrmSearchEmbedding(await dependencies.embedQuery({
        model: CRM_SEARCH_MODEL_ID,
        request: buildCrmSearchEmbeddingRequest(request.query),
        correlationId: context.correlationId
      }))
    })
  } catch {
    input.setActiveReservation(null, null)
    return { status: 'fallback', reason: 'provider', provider: 'workers_ai' }
  }
  input.setActiveReservation(null, null)
  if (input.isAbandoned()) {
    return { status: 'fallback', reason: 'disabled', provider: 'workers_ai' }
  }

  let beforeVector: CrmSearchPolicySnapshot
  try {
    beforeVector = await dependencies.loadFreshPolicy(context)
  } catch {
    return { status: 'fallback', reason: 'provider', provider: 'postgres' }
  }
  if (!validPolicy(beforeVector, initialPolicy.effectiveMode)
    || beforeVector.controlRevision !== aiReservation.controlRevision
    || beforeVector.policyRevision !== aiReservation.policyRevision
    || beforeVector.activeSchemaVersion !== initialPolicy.activeSchemaVersion) {
    return { status: 'fallback', reason: 'disabled', provider: 'postgres' }
  }

  let vectorReservation: CrmProviderUsageReservation | { status: 'denied' }
  try {
    vectorReservation = await reserveProvider(dependencies, context, 'vectorize')
  } catch {
    return { status: 'fallback', reason: 'provider', provider: 'vectorize' }
  }
  if (vectorReservation.status === 'denied') {
    return { status: 'fallback', reason: 'budget', provider: 'vectorize' }
  }
  if (vectorReservation.controlRevision !== beforeVector.controlRevision
    || vectorReservation.policyRevision !== beforeVector.policyRevision) {
    await releaseReservation(dependencies, vectorReservation)
    return { status: 'fallback', reason: 'disabled', provider: 'postgres' }
  }
  input.setActiveReservation(vectorReservation, 'vectorize')

  let candidates: ReturnType<typeof filterSemanticMatches>
  try {
    const options = buildCrmSearchVectorizeQueryOptions({
      namespace,
      activeSchemaVersion: initialPolicy.activeSchemaVersion,
      allowedEntityTypes: CRM_SEARCH_ENTITY_TYPES
    })
    candidates = await invokeReservedProvider({
      dependencies,
      context,
      reservation: vectorReservation,
      isAbandoned: input.isAbandoned,
      call: async () => {
        const response = await dependencies.queryVectorize({
          vector: embedding,
          options,
          correlationId: context.correlationId
        })
        if (!response || typeof response !== 'object' || Array.isArray(response)) {
          throw new TypeError('CRM search Vectorize response is invalid')
        }
        const value = response as Record<string, unknown>
        if (!Array.isArray(value.matches)
          || !Number.isSafeInteger(value.count)
          || value.count !== value.matches.length) {
          throw new TypeError('CRM search Vectorize response is invalid')
        }
        return filterSemanticMatches(value.matches)
      }
    })
  } catch {
    input.setActiveReservation(null, null)
    return { status: 'fallback', reason: 'provider', provider: 'vectorize' }
  }
  input.setActiveReservation(null, null)
  if (input.isAbandoned()) {
    return { status: 'fallback', reason: 'disabled', provider: 'vectorize' }
  }

  let semantic: CrmSearchJoinedSemanticHit[]
  try {
    semantic = await dependencies.joinBack({
      context,
      activeSchemaVersion: initialPolicy.activeSchemaVersion,
      canonicalNamespace: namespace,
      candidates,
      telemetryContext: {
        mode: initialPolicy.effectiveMode,
        queryDigestContext: input.queryDigestContext,
        keywordResultCount: input.keywordResultCount
      }
    })
  } catch {
    return { status: 'fallback', reason: 'semantic_db', provider: 'postgres' }
  }
  try {
    return {
      status: 'success',
      semantic,
      fused: fuseResults(input.keyword, semantic, request.limit)
    }
  } catch {
    return { status: 'fallback', reason: 'provider', provider: 'postgres' }
  }
}

function fuseResults(
  keyword: readonly CrmSearchHit[],
  semantic: readonly CrmSearchJoinedSemanticHit[],
  limit: number
): CrmSearchHit[] {
  const keywordRanks = keyword.map(hit => ({
    ...hit,
    entityType: hit.type,
    entityId: hit.id
  }))
  const semanticRanks = semantic.map(hit => ({ ...hit }))
  const fused = reciprocalRankFusion({
    keyword: keywordRanks,
    semantic: semanticRanks,
    finalLimit: limit
  })
  return fused.map((entry) => {
    const source = entry.semanticHit ?? entry.keywordHit
    if (!source) throw new Error('crm_search_rank_fusion_failure')
    return {
      type: entry.entityType,
      id: entry.entityId,
      title: source.title,
      subtitle: source.subtitle,
      rank: entry.fusedScore
    }
  })
}

export async function retrieveCrm(
  context: CrmSearchContext,
  request: NormalizedCrmSearchRequest,
  dependencies: CrmRetrievalDependencies
): Promise<CrmRetrievalResult> {
  // This is the only branch whose failure propagates to the public request.
  const keyword = await dependencies.runKeyword(
    context,
    request.query,
    CRM_KEYWORD_POOL_LIMIT
  )
  let queryDigestContext: CrmSearchPrecomputedQueryDigestContext | null = null
  try {
    queryDigestContext = await dependencies.prepareTelemetry({ context, query: request.query })
  } catch {
    queryDigestContext = null
  }
  if (context.surface === 'portal_global') {
    const result = keywordResult(keyword, request, 'disabled')
    await emitSafeTelemetry(dependencies, context, queryDigestContext, {
      eventType: 'search.keyword_only',
      mode: 'off',
      provider: 'postgres',
      statusClass: 'keyword_only',
      fallbackReason: 'disabled',
      keywordResultCount: keyword.length,
      fusedResultCount: result.results.length
    })
    return result
  }
  if (!request.semanticEligible) {
    const result = keywordResult(keyword, request, 'privacy')
    await emitSafeTelemetry(dependencies, context, queryDigestContext, {
      eventType: 'search.keyword_only',
      mode: 'off',
      provider: 'postgres',
      statusClass: 'keyword_only',
      fallbackReason: 'privacy',
      keywordResultCount: keyword.length,
      fusedResultCount: result.results.length
    })
    return result
  }
  if (!queryDigestContext) return keywordResult(keyword, request, 'provider')

  let policy: CrmSearchPolicySnapshot
  try {
    policy = await dependencies.loadFreshPolicy(context)
  } catch {
    const result = keywordResult(keyword, request, 'provider')
    await emitSafeTelemetry(dependencies, context, queryDigestContext, {
      eventType: 'search.fallback',
      mode: 'off',
      provider: 'postgres',
      statusClass: 'fallback',
      fallbackReason: 'provider',
      keywordResultCount: keyword.length,
      fusedResultCount: result.results.length
    })
    return result
  }
  if (policy.effectiveMode === 'off' || !validPolicy(policy, policy.effectiveMode)) {
    return keywordResult(keyword, request, 'disabled')
  }

  let activeReservation: CrmProviderUsageReservation | null = null
  let activeProvider: CrmSearchProviderName | null = null
  let abandoned = false
  const semanticTask = () => executeSemanticBranch({
    context,
    request,
    keyword,
    initialPolicy: policy as Parameters<typeof executeSemanticBranch>[0]['initialPolicy'],
    dependencies,
    queryDigestContext,
    keywordResultCount: keyword.length,
    setActiveReservation: (reservation, provider) => {
      activeReservation = reservation
      activeProvider = provider
    },
    isAbandoned: () => abandoned
  })
  const semanticWithinDeadline = async (): Promise<SemanticBranchResult> => {
    try {
      const deadline = await dependencies.runWithinDeadline({
        deadlineMs: CRM_SEARCH_RETRIEVAL_DEADLINE.defaultMs,
        task: semanticTask,
        onLateCompletion(work) {
          // The timeout signal must fence the branch before the provider task
          // can resume; waiting for runWithinDeadline to return leaves a race.
          abandoned = true
          const safeSettlement = {
            reservationId: activeReservation?.reservationId ?? null,
            correlationId: context.correlationId,
            providerCallSent: activeReservation !== null,
            completion: 'late_discarded' as const
          }
          const sanitized = work.then(() => undefined, () => undefined)
          dependencies.continueLateSettlement(safeSettlement, sanitized)
        }
      })
      if (deadline.status === 'completed') return deadline.value
      abandoned = true
      return {
        status: 'fallback',
        reason: 'timeout',
        provider: activeProvider ?? 'postgres'
      }
    } catch {
      return {
        status: 'fallback',
        reason: 'provider',
        provider: activeProvider ?? 'postgres'
      }
    }
  }

  if (policy.effectiveMode === 'shadow') {
    const runShadowSemantic = async (): Promise<SemanticBranchResult> => {
      const semantic = await semanticWithinDeadline()
      if (semantic.status === 'fallback') {
        await emitSafeTelemetry(dependencies, context, queryDigestContext, {
          eventType: 'search.fallback',
          mode: 'shadow',
          provider: semantic.provider,
          statusClass: 'fallback',
          fallbackReason: semantic.reason,
          keywordResultCount: keyword.length,
          fusedResultCount: Math.min(keyword.length, request.limit)
        })
        return semantic
      }
      try {
        await emitSafeTelemetry(dependencies, context, queryDigestContext, {
          eventType: 'search.shadow_completed',
          mode: 'shadow',
          provider: 'vectorize',
          statusClass: 'shadow_completed',
          keywordResultCount: keyword.length,
          semanticCandidateCount: semantic.semantic.length,
          fusedResultCount: semantic.fused.length
        })
        return semantic
      } catch {
        return { status: 'fallback', reason: 'provider', provider: 'postgres' }
      }
    }
    return dependencies.scheduleShadow?.({
      context,
      request,
      keyword,
      providerEnabled: policy.providerEnabled,
      retrieveSemantic: runShadowSemantic
    }) ?? { results: keyword.slice(0, request.limit), mode: 'shadow' }
  }
  if (context.surface !== 'agency_ai') return keywordResult(keyword, request, 'disabled')

  const semantic = await semanticWithinDeadline()
  if (semantic.status === 'fallback') {
    await emitSafeTelemetry(dependencies, context, queryDigestContext, {
      eventType: 'search.fallback',
      mode: 'assist',
      provider: semantic.provider,
      statusClass: 'fallback',
      fallbackReason: semantic.reason,
      keywordResultCount: keyword.length,
      fusedResultCount: Math.min(keyword.length, request.limit)
    })
    return keywordResult(keyword, request, semantic.reason)
  }

  try {
    const results = semantic.fused
    await emitSafeTelemetry(dependencies, context, queryDigestContext, {
      eventType: 'search.assist_completed',
      mode: 'assist',
      provider: 'vectorize',
      statusClass: 'assist_completed',
      keywordResultCount: keyword.length,
      semanticCandidateCount: semantic.semantic.length,
      fusedResultCount: results.length
    })
    return { results, mode: 'assist' }
  } catch {
    return keywordResult(keyword, request, 'provider')
  }
}

async function defaultRunWithinDeadline<T>(
  input: CrmSemanticDeadlineInput<T>
): Promise<CrmSemanticDeadlineResult<T>> {
  if (!Number.isSafeInteger(input.deadlineMs)
    || input.deadlineMs < 1
    || input.deadlineMs > CRM_SEARCH_RETRIEVAL_DEADLINE.maximumMs) {
    throw new RangeError('CRM search semantic deadline is invalid')
  }
  const work = Promise.resolve().then(input.task)
  let timeout: ReturnType<typeof setTimeout> | undefined
  const result = await Promise.race([
    work.then(value => ({ status: 'completed' as const, value })),
    new Promise<{ status: 'timed_out' }>((resolve) => {
      timeout = setTimeout(() => resolve({ status: 'timed_out' }), input.deadlineMs)
    })
  ])
  if (result.status === 'completed') {
    if (timeout) clearTimeout(timeout)
    return result
  }
  input.onLateCompletion(work)
  return result
}

interface RuntimeBindings {
  ai: {
    run: (model: string, input: { text: string[], pooling: string }) => Promise<unknown>
  }
  vectorize: {
    query: (vector: readonly number[], options: unknown) => Promise<unknown>
  }
}

async function persistSafeTelemetryRecord(record: CrmSafeTelemetryRecord): Promise<void> {
  const eventRecord: CrmSearchTelemetryEvent = {
    organisationScopeId: record.organisationScopeId,
    clientId: record.clientId,
    correlationId: record.correlationId,
    eventType: record.eventType,
    actorType: record.actorType,
    mode: record.metricLabels.mode,
    surface: record.metricLabels.surface,
    sampled: record.metricLabels.mode === 'shadow',
    ...record.queryDigestContext,
    keywordResultCount: record.keywordResultCount,
    semanticCandidateCount: record.semanticCandidateCount,
    fusedResultCount: record.fusedResultCount,
    rankEvidence: record.rankEvidence,
    fallbackClass: record.fallbackClass,
    statusClass: record.metricLabels.statusClass
  }
  await persistCrmSearchTelemetry({ event: eventRecord, aggregate: null })
}

function resolveRuntimeBindings(event: H3Event): RuntimeBindings | null {
  const env = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env
  const ai = env?.AI as Record<string, unknown> | undefined
  const vectorize = env?.CRM_SEARCH_VECTORIZE as Record<string, unknown> | undefined
  if (!ai || typeof ai.run !== 'function'
    || !vectorize || typeof vectorize.query !== 'function') return null
  const aiRun = ai.run as (...args: unknown[]) => Promise<unknown>
  const vectorQuery = vectorize.query as (...args: unknown[]) => Promise<unknown>
  return {
    ai: {
      run: (model, input) => Reflect.apply(aiRun, ai, [model, input])
    },
    vectorize: {
      query: (vector, options) => Reflect.apply(vectorQuery, vectorize, [vector, options])
    }
  }
}

export function createCrmRetrievalDependencies(event: H3Event): CrmRetrievalDependencies {
  // Bindings are captured once, synchronously, while request context is valid.
  const bindings = resolveRuntimeBindings(event)
  const analyticsKey = selectActiveCrmSearchAnalyticsDigestKey(
    resolveCrmSearchAnalyticsKeyring(event)
  )
  const revalidateContext = async (context: CrmSearchContext) => {
    try {
      return await resolveAgencyCrmSearchContext(event, {
        clientId: context.clientId,
        surface: context.surface === 'agency_ai' ? 'agency_ai' : 'agency_global'
      } as never)
    } catch {
      return null
    }
  }
  const dependencies: CrmRetrievalDependencies = {
    runKeyword: runCrmKeywordSearch,
    async prepareTelemetry(input) {
      if (!analyticsKey) return null
      return {
        queryDigest: await deriveCrmSearchQueryDigest({
          secret: analyticsKey.secret,
          keyVersion: analyticsKey.keyVersion,
          organisationScopeId: input.context.organisationScopeId,
          clientId: input.context.clientId,
          query: input.query
        }),
        queryDigestKeyVersion: analyticsKey.keyVersion,
        queryLengthBucket: queryLengthBucket(input.query)
      }
    },
    loadFreshPolicy: context => loadCrmSearchPolicySnapshot({
      organisationScopeId: context.organisationScopeId,
      clientId: context.clientId,
      surface: context.surface,
      infrastructureReady: bindings !== null,
      now: new Date().toISOString()
    }),
    deriveCanonicalNamespace: context => deriveCrmSearchNamespace({
      organisationScopeId: context.organisationScopeId,
      clientId: context.clientId
    }),
    async reserveProviderUsage(input) {
      try {
        const reserved = await reserveCrmSearchUsage({
          organisationScopeId: input.organisationScopeId,
          clientId: input.clientId,
          correlationId: input.correlationId,
          operationId: null,
          usageKind: 'query',
          provider: input.provider,
          providerAction: input.providerAction,
          surface: input.surface,
          schemaVersion: null,
          teardownId: null,
          reservationAt: new Date().toISOString(),
          providerCalls: input.providerCalls,
          modelInputTokens: input.modelInputTokens,
          queryDimensions: input.queryDimensions,
          insertedDimensions: 0,
          storedDimensions: 0,
          providerAttemptId: null,
          providerAttemptSequence: null,
          expectedLeaseGeneration: null
        })
        return {
          status: 'reserved',
          reservationId: reserved.id,
          providerAttemptId: reserved.providerAttemptId,
          controlRevision: reserved.controlRevision,
          policyRevision: reserved.policyRevision
        }
      } catch (error) {
        if (isBudgetFailure(error)) return { status: 'denied' }
        throw error
      }
    },
    markProviderCallSent: input => markCrmSearchProviderAttemptSent({
      usageKind: 'query',
      correlationId: input.correlationId,
      providerAttemptId: input.providerAttemptId,
      expectedControlRevision: input.expectedControlRevision,
      expectedPolicyRevision: input.expectedPolicyRevision
    }),
    settleProviderUsage: settleCrmSearchUsage,
    runWithinDeadline: defaultRunWithinDeadline,
    async embedQuery(input) {
      if (!bindings) throw new Error('crm_search_provider_unavailable')
      return bindings.ai.run(input.model, input.request)
    },
    async queryVectorize(input) {
      if (!bindings) throw new Error('crm_search_provider_unavailable')
      return bindings.vectorize.query(input.vector, input.options)
    },
    joinBack: input => joinBackSemanticCandidates(input,
      createCrmSemanticJoinBackDependencies(revalidateContext, async (rejection) => {
        await persistSafeTelemetryRecord({
          eventType: 'search.security_rejection',
          organisationScopeId: input.context.organisationScopeId,
          clientId: input.context.clientId,
          correlationId: rejection.correlationId,
          actorType: input.context.actorType,
          queryDigestContext: input.telemetryContext.queryDigestContext,
          keywordResultCount: input.telemetryContext.keywordResultCount,
          semanticCandidateCount: input.candidates.length,
          fusedResultCount: 0,
          rankEvidence: { reasonClass: rejection.reasonClass },
          fallbackClass: 'authorization_changed',
          metricLabels: {
            mode: input.telemetryContext.mode,
            surface: input.context.surface,
            provider: 'postgres',
            statusClass: 'security_rejection',
            fallbackClass: 'authorization_changed'
          }
        })
      })),
    emitTelemetry: persistSafeTelemetryRecord,
    continueLateSettlement(_input, work) {
      if (work) runAfterResponse(event, work, 'crm-search-late-settlement')
    }
  }
  dependencies.scheduleShadow = input => runCrmShadowSearch({
    context: input.context,
    request: input.request,
    keyword: input.keyword,
    providerEnabled: input.providerEnabled
  }, {
    sample: Math.random,
    captureBindings: () => bindings,
    retrieveSemantic: () => input.retrieveSemantic(),
    runBackgroundTask: promise => runAfterResponse(event, promise, 'crm-search-shadow')
  })
  return dependencies
}
