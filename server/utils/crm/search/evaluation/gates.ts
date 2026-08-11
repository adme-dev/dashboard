import type { CrmSearchPromotionGateDecision } from './contracts'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN
}

function bool(value: unknown): boolean {
  return value === true
}

function finite(...values: unknown[]): boolean {
  return values.every(value => typeof value === 'number' && Number.isFinite(value))
}

function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function evaluatePromotionGates(input: unknown): CrmSearchPromotionGateDecision {
  const evidence = record(input)
  const failures: string[] = []
  const leakage = record(evidence.leakage)
  if (['crossClient', 'unauthorized', 'deletedRecord', 'telemetry']
    .some(key => number(leakage[key]) !== 0)) failures.push('leakage_must_be_zero')

  const parity = record(evidence.resultParity)
  if (!bool(parity.offMatchesKeyword) || !bool(parity.shadowMatchesKeyword)) failures.push('keyword_parity')

  const exact = record(evidence.exactName)
  const exactValues = [exact.assistNdcgAt10, exact.keywordNdcgAt10, exact.assistMrr, exact.keywordMrr]
  if (!finite(...exactValues)
    || number(exact.assistNdcgAt10) < number(exact.keywordNdcgAt10)
    || number(exact.assistMrr) < number(exact.keywordMrr)) failures.push('exact_name_regression')

  const natural = record(evidence.naturalLanguage)
  if (!(number(natural.assistNdcgAt10) >= number(natural.keywordNdcgAt10) * 1.10)
    || number(natural.assistMrr) < number(natural.keywordMrr)) failures.push('natural_language_quality')
  const confidence = record(natural.pairedBootstrap95)
  if (number(confidence.samples) !== 1_000 || !(number(confidence.lower) > 0)) failures.push('paired_bootstrap')

  const regression = record(evidence.maximumStratumRegression)
  if (!finite(regression.ndcgAt10, regression.mrr)
    || number(regression.ndcgAt10) > 0.05 || number(regression.mrr) > 0.05) failures.push('stratum_regression')
  const noResult = record(evidence.noResult)
  if (!finite(noResult.assistFalsePositiveRate, noResult.keywordFalsePositiveRate)
    || number(noResult.assistFalsePositiveRate) > number(noResult.keywordFalsePositiveRate)) {
    failures.push('no_result_regression')
  }

  const load = record(evidence.load)
  for (const stratum of ['cold', 'warm', 'concurrent']) {
    const observed = record(load[stratum])
    const loadValuesAreFinite = finite(observed.semanticAddedP95Ms, observed.assistOverheadP95Ms,
      observed.fallbackRate, observed.lateBilledRate)
    if (!loadValuesAreFinite
      || number(observed.semanticAddedP95Ms) > 500
      || number(observed.assistOverheadP95Ms) > 500
      || number(observed.fallbackRate) > 0.05
      || number(observed.lateBilledRate) > 0.01) failures.push(`load_${stratum}`)
  }
  const concurrent = record(load.concurrent)
  if (!finite(concurrent.concurrency, concurrent.observedP95Concurrency)
    || number(concurrent.concurrency) < Math.max(10, 2 * number(concurrent.observedP95Concurrency))) {
    failures.push('concurrent_load_credibility')
  }

  if (!bool(evidence.budgetsSafe)) failures.push('budget_safety')
  if (!bool(evidence.converged)) failures.push('reconciliation_convergence')
  const capacity = record(evidence.capacity)
  const capacityValuesAreFinite = finite(capacity.vectorForecast, capacity.vectorLimit,
    capacity.namespaceForecast, capacity.namespaceLimit)
  if (!capacityValuesAreFinite
    || !(number(capacity.vectorForecast) * 5 < number(capacity.vectorLimit) * 4)
    || !(number(capacity.namespaceForecast) * 5 < number(capacity.namespaceLimit) * 4)) {
    failures.push('capacity_headroom')
  }

  const shadow = record(evidence.shadow)
  const clients = Array.isArray(shadow.clients) ? shadow.clients.map(record) : []
  if (clients.length < 3
    || clients.some(client => !bool(client.separatelyApproved)
      || !finite(client.unbiasedEligibleSamples, client.consecutiveDays)
      || number(client.unbiasedEligibleSamples) < 200
      || number(client.consecutiveDays) < 7)) failures.push('shadow_evidence')

  return Object.freeze({ passed: failures.length === 0, failures: Object.freeze(failures) as unknown as string[] })
}

const evidenceBindingKeys = [
  'environment',
  'implementationGitSha',
  'artifactManifestDigest',
  'pagesBundleDigest',
  'workerBundleDigest',
  'bindingManifestDigest',
  'evidenceBundleHash',
  'loadProtocolDigest',
  'providerContractDigest',
  'schemaVersion',
  'modelId',
  'tokenizerRevision',
  'rankingRevision',
  'thresholdRevision'
] as const

function expired(value: unknown, now: number): boolean {
  return typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= now
}

function mismatch(left: UnknownRecord, right: UnknownRecord, keys: readonly string[]): boolean {
  return keys.some(key => left[key] !== right[key])
}

export function validatePromotionAuthority(input: unknown): { authorized: boolean, failures: string[] } {
  const authority = record(input)
  const run = record(authority.evaluationRun)
  const evaluationApproval = record(authority.evaluationApproval)
  const changeApproval = record(authority.assistChangeApproval)
  const transition = record(authority.requestedTransition)
  const failures: string[] = []
  const now = typeof authority.now === 'string' ? Date.parse(authority.now) : Number.NaN
  const updater = authority.plannedPolicyUpdaterId
  const evaluationApprover = evaluationApproval.approvedBy
  const changeApprover = changeApproval.approvedBy

  if (!Number.isFinite(now) || run.gatePassed !== true || expired(run.expiresAt, now)) failures.push('evaluation_run_not_current')
  if (evaluationApproval.evaluationRunId !== run.id
    || expired(evaluationApproval.expiresAt, now)
    || evaluationApproval.revokedAt != null
    || evaluationApproval.consumedAt != null
    || evaluationApproval.evidenceHash !== run.evidenceBundleHash) failures.push('evaluation_approval_not_current')
  if (!identity(updater) || !identity(evaluationApprover) || !identity(run.runnerId)
    || evaluationApproval.plannedPolicyUpdaterId !== updater
    || evaluationApprover === updater
    || evaluationApprover === run.runnerId
    || [...(Array.isArray(run.implementationAuthorIds) ? run.implementationAuthorIds : []),
      ...(Array.isArray(run.fixtureAuthorIds) ? run.fixtureAuthorIds : []),
      ...(Array.isArray(run.judgementAuthorIds) ? run.judgementAuthorIds : [])]
      .includes(evaluationApprover)) failures.push('evaluation_actor_separation')

  if (changeApproval.approvalType !== 'client_assist'
    || expired(changeApproval.expiresAt, now)
    || changeApproval.revokedAt != null
    || changeApproval.consumedAt != null) failures.push('assist_approval_not_current')
  if (!identity(changeApprover) || changeApprover === updater
    || changeApprover === evaluationApprover) failures.push('change_actor_separation')
  if (mismatch(changeApproval, transition, [
    'organisationScopeId', 'clientId', 'expectedControlRevision', 'expectedPolicyRevision', ...evidenceBindingKeys
  ])) failures.push('change_approval_binding')
  if (mismatch(run, transition, evidenceBindingKeys)) failures.push('evaluation_evidence_binding')

  return Object.freeze({ authorized: failures.length === 0, failures: Object.freeze(failures) as unknown as string[] })
}
