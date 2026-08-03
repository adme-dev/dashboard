import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createPilotMetricsGetHandler } = await import(
  '~~/server/api/admin/ai/governance/pilot-metrics.get'
)

const WINDOW = {
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-31T00:00:00.000Z'
}

describe('GET /api/admin/ai/governance/pilot-metrics', () => {
  const requirePermission = vi.fn()
  const setResponseHeader = vi.fn()
  const getQuery = vi.fn()
  const getMetrics = vi.fn()
  const now = vi.fn(() => new Date('2026-08-03T01:02:03.000Z'))

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: '10000000-0000-4000-8000-000000000001', role: 'admin' })
    getQuery.mockReturnValue(WINDOW)
    getMetrics.mockResolvedValue({ metrics: [], summary: { gate: 'insufficient_data', blockers: ['required_pilot_releases_missing'], requiredPackCount: 5, presentReleaseCount: 0 } })
  })

  function handler() {
    return createPilotMetricsGetHandler({ requirePermission, setResponseHeader, getQuery, getMetrics, now })
  }

  it('requires ADMIN before parsing or reading metrics and always disables caching', async () => {
    const event = { context: {} } as never
    requirePermission.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(handler()(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(getQuery).not.toHaveBeenCalled()
    expect(getMetrics).not.toHaveBeenCalled()

    requirePermission.mockResolvedValue({ id: 'actor', role: 'admin' })
    await handler()(event)
    expect(requirePermission).toHaveBeenCalledWith(event, 'ADMIN')
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
  })

  it('strictly validates a bounded from/to query without accepting arrays or extra keys', async () => {
    for (const query of [
      { ...WINDOW, extra: 'no' },
      { from: [WINDOW.from], to: WINDOW.to },
      { from: '2026-06-01T00:00:00.000Z', to: WINDOW.to }
    ]) {
      getQuery.mockReturnValueOnce(query)
      await expect(handler()({ context: {} } as never)).rejects.toMatchObject({ statusCode: 400, data: { code: 'invalid_pilot_metrics_window' } })
    }
    expect(getMetrics).not.toHaveBeenCalled()
  })

  it('returns only aggregate cohort evidence and structurally drops identity, content, and trace fields', async () => {
    getMetrics.mockResolvedValue({ summary: { gate: 'pass', blockers: [], requiredPackCount: 5, presentReleaseCount: 5 }, metrics: [{ releaseId: 'release-1', packKey: 'paid_media_read_draft', cohort: 'paid_media', window: WINDOW, eligibleUsers: 6, activeUsers: 5, successfulTurns: 20, failedTurns: 1, p50LatencyMs: 500, p95LatencyMs: 900, totalCostUsdMicros: 1_000, usefulFeedbackRate: 0.9, ratingCount: 10, scopeViolationCount: 0, approvalBypassCount: 0, prohibitedEffectCount: 0, gate: 'pass', blockers: [], prompt: 'hidden', response: 'hidden', memory: 'hidden', email: 'hidden@example.test', userId: 'hidden', userName: 'Hidden', traceRef: 'hidden', tokens: 123, credential: 'hidden' }] })

    const result = await handler()({ context: {} } as never)
    const serialized = JSON.stringify(result).toLowerCase()

    expect(result).toMatchObject({ generatedAt: '2026-08-03T01:02:03.000Z', window: WINDOW, summary: { gate: 'pass', requiredPackCount: 5 }, metrics: [{ releaseId: 'release-1', cohort: 'paid_media', ratingCount: 10, gate: 'pass' }] })
    for (const forbidden of ['prompt', 'response', 'memory', 'email', 'userid', 'username', 'trace', 'token', 'credential', 'hidden']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('sanitizes repository failures without returning database detail', async () => {
    getMetrics.mockRejectedValue(Object.assign(new Error('password=secret relation ai_invocations failed'), { code: 'pilot_metrics_query_failed' }))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Pilot evidence is unavailable',
      data: { code: 'pilot_metrics_unavailable' }
    })
  })
})
