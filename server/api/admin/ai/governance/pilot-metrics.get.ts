import { createError, eventHandler, getQuery, setResponseHeader, type H3Event } from 'h3'
import { requirePermission, type User } from '~~/server/utils/auth'
import {
  PilotMetricsError,
  getPilotReleaseMetrics,
  parsePilotMetricsWindow,
  type PilotMetricsWindow,
  type PilotReleaseMetrics,
  type PilotMetricsReport
} from '~~/server/utils/ai/governance/pilotMetrics'

interface PilotMetricsGetDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  setResponseHeader(event: H3Event, name: string, value: string): void
  getQuery(event: H3Event): Record<string, unknown>
  getMetrics(window: PilotMetricsWindow): Promise<PilotMetricsReport>
  now(): Date
}

const defaultDependencies: PilotMetricsGetDependencies = {
  requirePermission,
  setResponseHeader,
  getQuery: event => getQuery(event),
  getMetrics: getPilotReleaseMetrics,
  now: () => new Date()
}

function publicMetric(metric: PilotReleaseMetrics): PilotReleaseMetrics {
  return {
    releaseId: metric.releaseId,
    packKey: metric.packKey,
    cohort: metric.cohort,
    window: { from: metric.window.from, to: metric.window.to },
    eligibleUsers: metric.eligibleUsers,
    activeUsers: metric.activeUsers,
    successfulTurns: metric.successfulTurns,
    failedTurns: metric.failedTurns,
    p50LatencyMs: metric.p50LatencyMs,
    p95LatencyMs: metric.p95LatencyMs,
    totalCostUsdMicros: metric.totalCostUsdMicros,
    usefulFeedbackRate: metric.usefulFeedbackRate,
    ratingCount: metric.ratingCount,
    scopeViolationCount: metric.scopeViolationCount,
    approvalBypassCount: metric.approvalBypassCount,
    prohibitedEffectCount: metric.prohibitedEffectCount,
    gate: metric.gate,
    blockers: [...metric.blockers]
  }
}

export function createPilotMetricsGetHandler(dependencies: PilotMetricsGetDependencies = defaultDependencies) {
  return async (event: H3Event) => {
    await dependencies.requirePermission(event, 'ADMIN')
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    let window: PilotMetricsWindow
    try {
      window = parsePilotMetricsWindow(dependencies.getQuery(event))
    } catch (error) {
      if (error instanceof PilotMetricsError && error.code === 'invalid_pilot_metrics_window') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid pilot metrics window', data: { code: error.code } })
      }
      throw error
    }
    try {
      const report = await dependencies.getMetrics(window)
      return {
        generatedAt: dependencies.now().toISOString(),
        window,
        summary: {
          gate: report.summary.gate,
          blockers: [...report.summary.blockers],
          requiredPackCount: report.summary.requiredPackCount,
          presentReleaseCount: report.summary.presentReleaseCount
        },
        metrics: report.metrics.map(publicMetric)
      }
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: 'Pilot evidence is unavailable',
        data: { code: 'pilot_metrics_unavailable' }
      })
    }
  }
}

export default eventHandler(createPilotMetricsGetHandler())
