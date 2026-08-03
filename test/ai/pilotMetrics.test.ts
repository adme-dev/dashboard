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
    ...overrides
  }
}

function successfulTurns(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `invocation-${index}`,
    releaseId: '10000000-0000-4000-8000-000000000001',
    actorKey: `actor-${index % 5}`,
    status: 'success',
    fallbackUsed: false,
    costUsdMicros: '50',
    latencyMs: 500,
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
      scopeViolationCount: 0,
      approvalBypassCount: 0,
      prohibitedEffectCount: 0,
      gate: 'insufficient_data',
      blockers: ['successful_tasks_below_minimum']
    })
  })

  it('de-duplicates invocation rows by ledger id and treats fallback or non-success rows as failed turns', () => {
    const invocations = successfulTurns(20)
    invocations.push({ ...invocations[0]! })
    invocations.push({ ...invocations[1]!, id: 'fallback', fallbackUsed: true })
    invocations.push({ ...invocations[2]!, id: 'error', status: 'error' })
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

  it('fails on any exact-version evaluation mismatch or zero-tolerance event', () => {
    const metrics = aggregatePilotReleaseMetrics({
      release: release({
        evaluation: { runId: 'run', packVersionId: 'wrong-version', status: 'completed', gatePassed: true },
        scopeViolationCount: 1,
        approvalBypassCount: 2,
        prohibitedEffectCount: 1
      }),
      window: WINDOW,
      invocations: successfulTurns(20, { costUsdMicros: '10', latencyMs: 100 }),
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
      if (sql.includes('FROM ai_invocations')) return []
      if (sql.includes('FROM ai_feedback')) return []
      throw new Error('unexpected query')
    })

    const metrics = await getPilotReleaseMetrics(WINDOW, { queryRows })

    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toMatchObject({ cohort: 'finance_bookkeeping', releaseId: release().releaseId })
    expect(queryRows.mock.calls.every(([, params]) => params.includes(WINDOW.from) && params.includes(WINDOW.to))).toBe(true)
    expect(queryRows.mock.calls[0]![0]).toContain('LIMIT 6')
    expect(queryRows.mock.calls[1]![0]).toContain('LIMIT 10001')
    expect(queryRows.mock.calls[2]![0]).toContain('LIMIT 10001')
  })
})
