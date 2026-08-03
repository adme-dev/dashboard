import { describe, expect, it, vi } from 'vitest'
import {
  PilotMetricsError,
  aggregatePilotReleaseMetrics,
  getPilotReleaseMetrics,
  parsePilotMetricsWindow,
  type PilotMetricReleaseSource
} from '~~/server/utils/ai/governance/pilotMetrics'

const WINDOW = {
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-31T00:00:00.000Z'
}

function release(overrides: Partial<PilotMetricReleaseSource> = {}): PilotMetricReleaseSource {
  return {
    releaseId: '10000000-0000-4000-8000-000000000001',
    packKey: 'paid_media_read_draft',
    packVersionId: '20000000-0000-4000-8000-000000000001',
    eligibleUsers: 6,
    maxLatencyMs: 1_000,
    maxCostUsdMicros: 100,
    evaluation: {
      runId: '30000000-0000-4000-8000-000000000001',
      packVersionId: '20000000-0000-4000-8000-000000000001',
      status: 'completed',
      gatePassed: true
    },
    scopeViolationCount: 0,
    approvalBypassCount: 0,
    prohibitedEffectCount: 0,
    pilotEpisodeStartedAt: WINDOW.from,
    pilotEpisodeAuditId: '40000000-0000-4000-8000-000000000001',
    ...overrides
  }
}

function successfulTurns(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `invocation-${index}`,
    durableEvidence: true,
    attemptId: `turn-${index}:l1:primary`,
    turnId: `turn-${index}`,
    releaseId: '10000000-0000-4000-8000-000000000001',
    packVersionId: '20000000-0000-4000-8000-000000000001',
    representativeTaskId: `case-${index}`,
    assistantMessageId: `message-${index}`,
    actorKey: `actor-${index % 5}`,
    status: 'success',
    state: 'assessed',
    terminalOutcome: 'success',
    memberEligible: true,
    fallbackUsed: false,
    costUsdMicros: '50',
    latencyMs: 500,
    scopeRespected: true,
    approvalBoundaryRespected: true,
    prohibitedEffectsCount: 0,
    freshnessRespected: true,
    fabricationObserved: false,
    credentialLeakObserved: false,
    enforcementScopeRespected: true,
    enforcementApprovalBoundaryRespected: true,
    enforcementProhibitedEffectsCount: 0,
    ...overrides
  }))
}

describe('governed assistant pilot metrics', () => {
  it('rejects invalid, reversed, and longer-than-31-day windows', () => {
    expect(() => parsePilotMetricsWindow({ from: 'not-a-date', to: WINDOW.to })).toThrowError(PilotMetricsError)
    expect(() => parsePilotMetricsWindow({ from: WINDOW.to, to: WINDOW.from })).toThrowError(PilotMetricsError)
    expect(() => parsePilotMetricsWindow({ from: '2026-06-01T00:00:00.000Z', to: WINDOW.to })).toThrowError(PilotMetricsError)
    expect(parsePilotMetricsWindow(WINDOW)).toEqual(WINDOW)
  })

  it('returns insufficient aggregate evidence for an empty window without inventing ratings or latency', () => {
    expect(aggregatePilotReleaseMetrics({ release: release(), window: WINDOW, invocations: [], feedback: [] })).toEqual({
      releaseId: '10000000-0000-4000-8000-000000000001',
      packKey: 'paid_media_read_draft',
      cohort: 'paid_media',
      window: WINDOW,
      eligibleUsers: 6,
      activeUsers: 0,
      successfulTurns: 0,
      failedTurns: 0,
      p50LatencyMs: null,
      p95LatencyMs: null,
      totalCostUsdMicros: 0,
      usefulFeedbackRate: null,
      ratingCount: 0,
      scopeViolationCount: 0,
      approvalBypassCount: 0,
      prohibitedEffectCount: 0,
      gate: 'insufficient_data',
      blockers: ['representative_task_telemetry_missing', 'successful_tasks_below_minimum']
    })
  })

  it('de-duplicates invocation rows by ledger id and treats fallback or non-success rows as failed turns', () => {
    const invocations = successfulTurns(20)
    invocations.push({ ...invocations[0]! })
    invocations.push({ ...invocations[1]!, id: 'fallback', attemptId: 'turn-fallback:l1:fallback', turnId: 'turn-fallback', fallbackUsed: true })
    invocations.push({ ...invocations[2]!, id: 'error', attemptId: 'turn-error:l1:primary', turnId: 'turn-error', status: 'error' })
    invocations.push({ ...invocations[3]!, id: 'foreign', releaseId: '90000000-0000-4000-8000-000000000009' })

    const result = aggregatePilotReleaseMetrics({ release: release(), window: WINDOW, invocations, feedback: [] })

    expect(result.successfulTurns).toBe(20)
    expect(result.failedTurns).toBe(2)
    expect(result.activeUsers).toBe(5)
    expect(result.totalCostUsdMicros).toBe(1_100)
    expect(result.gate).toBe('pass')
  })

  it('uses the nearest-rank P95, total-spend cost per success, and the pack budgets', () => {
    const invocations = successfulTurns(20).map((row, index) => ({
      ...row,
      latencyMs: (index + 1) * 100,
      costUsdMicros: '101'
    }))
    const result = aggregatePilotReleaseMetrics({ release: release(), window: WINDOW, invocations, feedback: [] })

    expect(result.p50LatencyMs).toBe(1_000)
    expect(result.p95LatencyMs).toBe(1_900)
    expect(result.totalCostUsdMicros).toBe(2_020)
    expect(result.gate).toBe('fail')
    expect(result.blockers).toEqual([
      'p95_latency_budget_exceeded',
      'cost_per_successful_task_budget_exceeded'
    ])
  })

  it('applies useful-feedback threshold only when at least ten unique ratings exist', () => {
    const lowVolume = Array.from({ length: 9 }, (_, index) => ({ id: `feedback-${index}`, releaseId: release().releaseId, rating: index < 7 ? 1 : -1 }))
    const thresholdVolume = [...lowVolume, { id: 'feedback-9', releaseId: release().releaseId, rating: -1 }]
    const invocations = successfulTurns(20, { costUsdMicros: '10', latencyMs: 100 })

    expect(aggregatePilotReleaseMetrics({ release: release(), window: WINDOW, invocations, feedback: lowVolume })).toMatchObject({
      usefulFeedbackRate: 7 / 9,
      gate: 'pass',
      blockers: []
    })
    expect(aggregatePilotReleaseMetrics({ release: release(), window: WINDOW, invocations, feedback: thresholdVolume })).toMatchObject({
      usefulFeedbackRate: 0.7,
      gate: 'fail',
      blockers: ['useful_feedback_rate_below_minimum']
    })
  })

  it('fails on any exact-version evaluation mismatch or live zero-tolerance event', () => {
    const metrics = aggregatePilotReleaseMetrics({
      release: release({
        evaluation: { runId: 'run', packVersionId: 'wrong-version', status: 'completed', gatePassed: true },
        scopeViolationCount: 0,
        approvalBypassCount: 0,
        prohibitedEffectCount: 0
      }),
      window: WINDOW,
      invocations: successfulTurns(20, {
        costUsdMicros: '10', latencyMs: 100, scopeRespected: false,
        approvalBoundaryRespected: false, prohibitedEffectsCount: 1
      }),
      feedback: []
    })

    expect(metrics.gate).toBe('fail')
    expect(metrics.blockers).toEqual([
      'exact_version_evaluation_gate_not_passed',
      'scope_violation_detected',
      'approval_bypass_detected',
      'prohibited_effect_detected'
    ])
  })

  it('fails closed when database money or counters exceed safe integer bounds', () => {
    expect(() => aggregatePilotReleaseMetrics({
      release: release(),
      window: WINDOW,
      invocations: successfulTurns(1, { costUsdMicros: '9007199254740992' }),
      feedback: []
    })).toThrowError(expect.objectContaining({ code: 'invalid_pilot_metric_row' }))
  })

  it('maps only the five named pilot packs to the three explicit cohorts and bounds source queries with sentinels', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      if (sql.includes('FROM ai_pack_releases')) return [{
        release_id: release().releaseId,
        pack_key: 'finance_read_draft',
        pack_version_id: release().packVersionId,
        eligible_users: '5',
        max_latency_ms: '1000',
        max_cost_usd_micros: '100',
        evaluation_run_id: release().evaluation!.runId,
        evaluation_pack_version_id: release().packVersionId,
        evaluation_status: 'completed',
        evaluation_gate_passed: true,
        scope_violation_count: '0',
        approval_bypass_count: '0',
        prohibited_effect_count: '0'
      }]
      if (sql.includes('FROM ai_pilot_task_evidence')) return []
      if (sql.includes('FROM ai_feedback')) return []
      throw new Error('unexpected query')
    })

    const report = await getPilotReleaseMetrics(WINDOW, { queryRows })

    expect(report.metrics).toHaveLength(5)
    expect(report.metrics.find(metric => metric.packKey === 'finance_read_draft')).toMatchObject({ cohort: 'finance_bookkeeping', releaseId: release().releaseId })
    expect(queryRows.mock.calls.every(([, params]) => params.includes(WINDOW.from) && params.includes(WINDOW.to))).toBe(true)
    expect(queryRows.mock.calls[0]![0]).toContain('LIMIT 7')
    expect(queryRows.mock.calls[1]![0]).toContain('LIMIT 10001')
    expect(queryRows.mock.calls[2]![0]).toContain('LIMIT 10001')
  })

  it('returns the complete five-pack matrix and an insufficient overall gate when required releases are missing', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      if (sql.includes('FROM ai_pack_releases')) return [{
        release_id: release().releaseId,
        pack_key: 'paid_media_read_draft',
        pack_version_id: release().packVersionId,
        eligible_users: '5',
        max_latency_ms: '1000',
        max_cost_usd_micros: '100',
        evaluation_run_id: release().evaluation!.runId,
        evaluation_pack_version_id: release().packVersionId,
        evaluation_status: 'completed',
        evaluation_gate_passed: true,
        pilot_episode_started_at: '2026-07-01T00:00:00.000Z',
        scope_violation_count: '0', approval_bypass_count: '0', prohibited_effect_count: '0'
      }]
      return []
    })

    const report = await getPilotReleaseMetrics(WINDOW, { queryRows }) as any

    expect(report.metrics.map((metric: any) => metric.packKey)).toEqual([
      'account_management_read_draft', 'production_read_draft', 'paid_media_read_draft',
      'finance_read_draft', 'bookkeeping_read_draft'
    ])
    expect(report.summary).toMatchObject({ gate: 'insufficient_data', requiredPackCount: 5, presentReleaseCount: 1 })
    expect(report.summary.blockers).toContain('required_pilot_releases_missing')
    expect(report.metrics.filter((metric: any) => metric.releaseId === null)).toHaveLength(4)
  })

  it('fails the overall matrix closed when one required pack has duplicate current pilot releases', async () => {
    const duplicateRows = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'].map(releaseId => ({
      release_id: releaseId, pack_key: 'paid_media_read_draft', pack_version_id: release().packVersionId,
      eligible_users: '5', max_latency_ms: '1000', max_cost_usd_micros: '100',
      evaluation_run_id: release().evaluation!.runId, evaluation_pack_version_id: release().packVersionId,
      evaluation_status: 'completed', evaluation_gate_passed: true,
      pilot_episode_started_at: '2026-07-01T00:00:00.000Z',
      scope_violation_count: '0', approval_bypass_count: '0', prohibited_effect_count: '0'
    }))
    const queryRows = vi.fn(async (sql: string) => sql.includes('FROM ai_pack_releases') ? duplicateRows : [])

    const report = await getPilotReleaseMetrics(WINDOW, { queryRows }) as any

    expect(report.summary.gate).toBe('fail')
    expect(report.summary.blockers).toContain('duplicate_pilot_release:paid_media_read_draft')
    expect(report.metrics.find((metric: any) => metric.packKey === 'paid_media_read_draft')).toMatchObject({ releaseId: null, gate: 'fail' })
  })

  it('excludes ordinary turns and blocks missing representative, episode, safety, and measurement telemetry', () => {
    const result = aggregatePilotReleaseMetrics({
      release: release({ pilotEpisodeStartedAt: null } as any),
      window: WINDOW,
      invocations: [{
        ...successfulTurns(1)[0]!, turnId: 'turn-ordinary', attemptId: 'turn-ordinary:primary',
        representativeTaskId: null, packVersionId: release().packVersionId,
        assistantMessageId: null, scopeRespected: null, approvalBoundaryRespected: null,
        prohibitedEffectsCount: null, costUsdMicros: null, latencyMs: null
      } as any],
      feedback: []
    }) as any

    expect(result.successfulTurns).toBe(0)
    expect(result.gate).toBe('insufficient_data')
    expect(result.blockers).toEqual(expect.arrayContaining([
      'pilot_episode_audit_missing',
      'representative_task_telemetry_missing'
    ]))
  })

  it('de-duplicates attempts once per trusted turn and exact release while preserving incomplete terminal evidence', () => {
    const base = {
      releaseId: release().releaseId, packVersionId: release().packVersionId, actorKey: 'actor-1',
      turnId: 'turn-1', representativeTaskId: 'case-1', assistantMessageId: 'message-1',
      durableEvidence: true, state: 'assessed', terminalOutcome: 'success', memberEligible: true,
      scopeRespected: true, approvalBoundaryRespected: true, prohibitedEffectsCount: 0,
      freshnessRespected: true, fabricationObserved: false, credentialLeakObserved: false,
      enforcementScopeRespected: true, enforcementApprovalBoundaryRespected: true,
      enforcementProhibitedEffectsCount: 0
    }
    const result = aggregatePilotReleaseMetrics({
      release: release({ pilotEpisodeStartedAt: WINDOW.from } as any), window: WINDOW,
      invocations: [
        { ...base, id: 'row-primary', attemptId: 'turn-1:l1:primary', status: 'error', fallbackUsed: false, costUsdMicros: null, latencyMs: 40 },
        { ...base, id: 'row-fallback', attemptId: 'turn-1:l1:fallback', status: 'success', fallbackUsed: true, costUsdMicros: '20', latencyMs: 80 },
        { ...base, id: 'duplicate', attemptId: 'turn-1:l1:fallback', status: 'success', fallbackUsed: true, costUsdMicros: '20', latencyMs: 80 }
      ] as any,
      feedback: [{ id: 'feedback-1', releaseId: release().releaseId, turnId: 'turn-1', assistantMessageId: 'message-1', rating: 1 } as any]
    }) as any

    expect(result.successfulTurns).toBe(0)
    expect(result.failedTurns).toBe(1)
    expect(result.ratingCount).toBe(1)
    expect(result.blockers).toContain('incomplete_cost_measurement')
  })

  it('counts live safety observations independently and never substitutes evaluation safety', () => {
    const result = aggregatePilotReleaseMetrics({
      release: release({ pilotEpisodeStartedAt: WINDOW.from } as any), window: WINDOW,
      invocations: [{
        id: 'row', attemptId: 'turn-1:l1:primary', turnId: 'turn-1', releaseId: release().releaseId,
        packVersionId: release().packVersionId, actorKey: 'actor', representativeTaskId: 'case-1',
        assistantMessageId: 'message-1', status: 'success', fallbackUsed: false,
        durableEvidence: true, state: 'assessed', terminalOutcome: 'success', memberEligible: true,
        costUsdMicros: '10', latencyMs: 100, scopeRespected: false,
        approvalBoundaryRespected: false, prohibitedEffectsCount: 1,
        freshnessRespected: true, fabricationObserved: false, credentialLeakObserved: false,
        enforcementScopeRespected: false, enforcementApprovalBoundaryRespected: false,
        enforcementProhibitedEffectsCount: 1
      }] as any,
      feedback: []
    }) as any

    expect(result).toMatchObject({ scopeViolationCount: 1, approvalBypassCount: 1, prohibitedEffectCount: 1, gate: 'fail' })
  })

  it('blocks every issued durable task until terminal message linkage and independent assessment are complete', () => {
    const result = aggregatePilotReleaseMetrics({
      release: release(), window: WINDOW,
      invocations: [{
        ...successfulTurns(1)[0], state: 'issued', terminalOutcome: null,
        assistantMessageId: null, scopeRespected: null, approvalBoundaryRespected: null,
        prohibitedEffectsCount: null, freshnessRespected: null, fabricationObserved: null,
        credentialLeakObserved: null
      } as any], feedback: []
    })
    expect(result.successfulTurns).toBe(0)
    expect(result.blockers).toEqual(expect.arrayContaining([
      'representative_task_terminal_missing', 'assistant_message_link_missing',
      'independent_assessment_missing'
    ]))
  })

  it('reads durable evidence as authority and never joins invocation metadata for qualification', async () => {
    const queryRows = vi.fn(async (sql: string) => sql.includes('FROM ai_pack_releases') ? [] : [])
    await getPilotReleaseMetrics(WINDOW, { queryRows })
    expect(queryRows.mock.calls[1]![0]).toContain('FROM ai_pilot_task_evidence')
    expect(queryRows.mock.calls[1]![0]).not.toContain("metadata -> 'pilotEvidence'")
    expect(queryRows.mock.calls[2]![0]).toContain('JOIN ai_pilot_task_evidence evidence')
    expect(queryRows.mock.calls[2]![0]).toContain('pilot_episode_audit_id')
    expect(queryRows.mock.calls[2]![0]).toContain('ai_release_pilot_members')
  })

  it('never qualifies legacy invocation-shaped telemetry without durable evidence state', () => {
    const legacy = successfulTurns(20).map(({ durableEvidence: _durable, state: _state, terminalOutcome: _outcome,
      freshnessRespected: _freshness, fabricationObserved: _fabrication, credentialLeakObserved: _credential,
      enforcementScopeRespected: _scope, enforcementApprovalBoundaryRespected: _approval,
      enforcementProhibitedEffectsCount: _effects, ...row }) => row)
    const result = aggregatePilotReleaseMetrics({ release: release(), window: WINDOW, invocations: legacy, feedback: [] })
    expect(result.successfulTurns).toBe(0)
    expect(result.blockers).toContain('representative_task_telemetry_missing')
  })
})
