import { describe, expect, it } from 'vitest'
import {
  evaluatePromotionGates,
  validatePromotionAuthority
} from '~~/server/utils/crm/search/evaluation/gates'

const digest = (character: string) => character.repeat(64)
const now = '2026-08-10T00:00:00.000Z'

function passingEvidence() {
  return {
    leakage: { crossClient: 0, unauthorized: 0, deletedRecord: 0, telemetry: 0 },
    resultParity: { offMatchesKeyword: true, shadowMatchesKeyword: true },
    exactName: { keywordNdcgAt10: 0.9, assistNdcgAt10: 0.9, keywordMrr: 0.9, assistMrr: 0.9 },
    naturalLanguage: {
      keywordNdcgAt10: 0.5,
      assistNdcgAt10: 0.56,
      keywordMrr: 0.5,
      assistMrr: 0.51,
      pairedBootstrap95: { lower: 0.01, upper: 0.11, samples: 1_000 }
    },
    maximumStratumRegression: { ndcgAt10: 0.04, mrr: 0.04 },
    noResult: { keywordFalsePositiveRate: 0.01, assistFalsePositiveRate: 0.01 },
    load: {
      cold: { semanticAddedP95Ms: 400, assistOverheadP95Ms: 400, fallbackRate: 0.04, lateBilledRate: 0.005 },
      warm: { semanticAddedP95Ms: 350, assistOverheadP95Ms: 350, fallbackRate: 0.03, lateBilledRate: 0.005 },
      concurrent: {
        semanticAddedP95Ms: 450,
        assistOverheadP95Ms: 450,
        fallbackRate: 0.05,
        lateBilledRate: 0.01,
        concurrency: 20,
        observedP95Concurrency: 10
      }
    },
    budgetsSafe: true,
    capacity: { vectorForecast: 799, vectorLimit: 1_000, namespaceForecast: 79, namespaceLimit: 100 },
    converged: true,
    shadow: {
      clients: [
        { clientId: 'client-1', separatelyApproved: true, unbiasedEligibleSamples: 200, consecutiveDays: 7 },
        { clientId: 'client-2', separatelyApproved: true, unbiasedEligibleSamples: 200, consecutiveDays: 7 },
        { clientId: 'client-3', separatelyApproved: true, unbiasedEligibleSamples: 200, consecutiveDays: 7 }
      ]
    }
  }
}

function validAuthority() {
  const binding = {
    environment: 'preview',
    implementationGitSha: 'a'.repeat(40),
    artifactManifestDigest: digest('b'),
    pagesBundleDigest: digest('c'),
    workerBundleDigest: digest('d'),
    bindingManifestDigest: digest('e'),
    evidenceBundleHash: digest('f'),
    loadProtocolDigest: digest('1'),
    providerContractDigest: digest('2'),
    schemaVersion: 'crm-search-v1',
    modelId: '@cf/baai/bge-base-en-v1.5',
    tokenizerRevision: 'bge-base-en-v1.5-pinned',
    rankingRevision: 'rrf-v1',
    thresholdRevision: 'cosine-0.75-v1'
  }
  return {
    now,
    plannedPolicyUpdaterId: 'updater-1',
    evaluationRun: {
      id: 'run-1',
      gatePassed: true,
      expiresAt: '2026-08-12T00:00:00.000Z',
      runnerId: 'runner-1',
      implementationAuthorIds: ['implementer-1'],
      fixtureAuthorIds: ['fixture-author-1'],
      judgementAuthorIds: ['judge-1', 'judge-2'],
      ...binding
    },
    evaluationApproval: {
      id: 'evaluation-approval-1',
      evaluationRunId: 'run-1',
      approvedBy: 'evaluation-approver-1',
      plannedPolicyUpdaterId: 'updater-1',
      evidenceHash: binding.evidenceBundleHash,
      expiresAt: '2026-08-11T00:00:00.000Z',
      revokedAt: null,
      consumedAt: null
    },
    assistChangeApproval: {
      id: 'assist-approval-1',
      approvalType: 'client_assist',
      approvedBy: 'change-approver-1',
      organisationScopeId: 'scope-1',
      clientId: 'client-1',
      expectedControlRevision: 7,
      expectedPolicyRevision: 3,
      expiresAt: '2026-08-11T00:00:00.000Z',
      revokedAt: null,
      consumedAt: null,
      ...binding
    },
    requestedTransition: {
      organisationScopeId: 'scope-1',
      clientId: 'client-1',
      expectedControlRevision: 7,
      expectedPolicyRevision: 3,
      ...binding
    }
  }
}

describe('CRM search promotion gates', () => {
  it('passes only complete server-computed quality, safety, load, capacity, and shadow evidence', () => {
    expect(evaluatePromotionGates(passingEvidence())).toEqual({ passed: true, failures: [] })
  })

  type PromotionEvidence = ReturnType<typeof passingEvidence>
  type EvidenceMutation = (evidence: PromotionEvidence) => void
  const failingEvidenceCases: Array<[string, EvidenceMutation]> = [
    ['an authorization leak', (evidence) => { evidence.leakage.unauthorized = 1 }],
    ['a non-positive paired confidence lower bound', (evidence) => { evidence.naturalLanguage.pairedBootstrap95.lower = 0 }],
    ['a budget race', (evidence) => { evidence.budgetsSafe = false }],
    ['insufficient vector headroom', (evidence) => { evidence.capacity.vectorForecast = 800 }],
    ['six shadow days', (evidence) => { evidence.shadow.clients[0]!.consecutiveDays = 6 }],
    ['biased shadow sampling', (evidence) => { evidence.shadow.clients[0]!.unbiasedEligibleSamples = 199 }],
    ['an unapproved shadow client', (evidence) => { evidence.shadow.clients[0]!.separatelyApproved = false }]
  ]

  it.each(failingEvidenceCases)('fails closed for %s', (_label, mutate) => {
    const evidence = passingEvidence()
    mutate(evidence)
    expect(evaluatePromotionGates(evidence).passed).toBe(false)
  })

  it.each(['exactName', 'maximumStratumRegression', 'noResult'] as const)(
    'fails closed when %s evidence is missing',
    (key) => {
      const evidence = passingEvidence()
      const { [key]: _missing, ...incompleteEvidence } = evidence
      expect(evaluatePromotionGates(incompleteEvidence).passed).toBe(false)
    }
  )

  it('fails closed when a load stratum or its numeric evidence is missing', () => {
    const evidence = passingEvidence()
    delete (evidence.load as Partial<PromotionEvidence['load']>).warm
    expect(evaluatePromotionGates(evidence).passed).toBe(false)

    const missingConcurrency = passingEvidence()
    delete (missingConcurrency.load.concurrent as Partial<PromotionEvidence['load']['concurrent']>).concurrency
    expect(evaluatePromotionGates(missingConcurrency).passed).toBe(false)
  })

  it('accepts fresh, unused, unrevoked, actor-separated approvals bound to the exact evidence', () => {
    expect(validatePromotionAuthority(validAuthority())).toEqual({ authorized: true, failures: [] })
  })

  type PromotionAuthority = ReturnType<typeof validAuthority>
  type AuthorityMutation = (authority: PromotionAuthority) => void
  const invalidAuthorityCases: Array<[string, AuthorityMutation]> = [
    ['expired evaluation run', (authority) => { authority.evaluationRun.expiresAt = now }],
    ['revoked evaluation approval', (authority) => { authority.evaluationApproval.revokedAt = '2026-08-09T00:00:00.000Z' }],
    ['expired change approval', (authority) => { authority.assistChangeApproval.expiresAt = now }],
    ['runner approval', (authority) => { authority.evaluationApproval.approvedBy = authority.evaluationRun.runnerId }],
    ['same two approvers', (authority) => { authority.assistChangeApproval.approvedBy = authority.evaluationApproval.approvedBy }],
    ['updater self-approval', (authority) => { authority.evaluationApproval.approvedBy = authority.plannedPolicyUpdaterId }],
    ['missing updater identity', (authority) => {
      delete (authority as Partial<PromotionAuthority>).plannedPolicyUpdaterId
      delete (authority.evaluationApproval as Partial<PromotionAuthority['evaluationApproval']>).plannedPolicyUpdaterId
    }],
    ['missing change approver identity', (authority) => {
      delete (authority.assistChangeApproval as Partial<PromotionAuthority['assistChangeApproval']>).approvedBy
    }],
    ['evidence mismatch', (authority) => { authority.requestedTransition.evidenceBundleHash = digest('9') }],
    ['schema mismatch', (authority) => { authority.requestedTransition.schemaVersion = 'crm-search-v2' }],
    ['revision mismatch', (authority) => { authority.requestedTransition.expectedPolicyRevision = 4 }]
  ]

  it.each(invalidAuthorityCases)('rejects %s', (_label, mutate) => {
    const authority = validAuthority()
    mutate(authority)
    expect(validatePromotionAuthority(authority).authorized).toBe(false)
  })
})
