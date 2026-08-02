// server/utils/anomalyDetection/analysers/cashflow.ts
import { buildFingerprint } from '../fingerprints'
import type { AnalyserContext, DetectedAnomaly } from '../types'

const toCurrency = (v: number | null | undefined) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0

export async function cashflowAnalyser(
  ctx: AnalyserContext,
): Promise<DetectedAnomaly[]> {
  const { bankMonitoring, cashForecast } = ctx.data
  if (!bankMonitoring && !cashForecast) return []

  const out: DetectedAnomaly[] = []

  if (bankMonitoring) {
    const portfolio = bankMonitoring.portfolio
    const accounts = bankMonitoring.accounts || []

    // Check for overdraft on any account
    for (const acct of accounts) {
      if (typeof acct.currentBalance === 'number' && acct.currentBalance < 0) {
        out.push({
          fingerprint: buildFingerprint('cashflow', 'bank-overdraft-' + (acct.accountName?.replace(/\s+/g, '-').toLowerCase().slice(0, 20) || 'unknown')),
          type: 'cashflow',
          severity: 'critical',
          title: `Account in overdraft: ${acct.accountName}`,
          description: `${acct.accountName} has a negative balance of $${Math.abs(acct.currentBalance).toFixed(0)}.`,
          metric: { label: acct.accountName, value: toCurrency(acct.currentBalance), format: 'currency' },
          recommendation: 'Transfer funds immediately or arrange overdraft facilities to avoid fees and failed payments.',
          tags: ['overdraft', 'bank'],
          dataSources: ['Bank Monitoring'],
        })
      }
    }

    // Low cash reserves.
    // Keyed off totalCash, not totalBalance: the latter nets drawn credit cards
    // against real cash, and a card-heavy org lands negative — which failed the
    // `>= 0` guard and silently suppressed this alert entirely. Falls back to
    // totalBalance so a stale cached response still evaluates.
    const totalCash = typeof portfolio?.totalCash === 'number' ? portfolio.totalCash : portfolio?.totalBalance
    if (typeof totalCash === 'number' && totalCash < 10000 && totalCash >= 0) {
      out.push({
        fingerprint: buildFingerprint('cashflow', 'low-cash-reserves'),
        type: 'cashflow',
        severity: 'warning',
        title: 'Low cash reserves',
        description: `Total cash across all accounts is $${totalCash.toFixed(0)}, below the $10,000 safety threshold.`,
        metric: { label: 'Total Cash', value: toCurrency(totalCash), format: 'currency' },
        recommendation: 'Accelerate receivable collection, defer non-essential spending, or arrange a credit facility.',
        tags: ['cash reserves', 'liquidity'],
        dataSources: ['Bank Monitoring'],
      })
    }

    // High cash velocity
    if (typeof portfolio?.cashVelocity === 'number' && portfolio.cashVelocity > 5) {
      out.push({
        fingerprint: buildFingerprint('cashflow', 'cash-velocity-extreme'),
        type: 'cashflow',
        severity: 'info',
        title: 'High cash velocity',
        description: `Cash velocity is ${portfolio.cashVelocity.toFixed(1)}x — money is cycling through accounts faster than normal.`,
        metric: { label: 'Cash Velocity', value: portfolio.cashVelocity, format: 'number' },
        recommendation: 'High velocity can indicate healthy activity or tight cash management. Review if reserves are adequate.',
        tags: ['velocity', 'cash movement'],
        dataSources: ['Bank Monitoring'],
      })
    }

    // High burn rate — running out in <30 days
    // Runway divides liquid cash by burn — netting card debt in produced a
    // negative runway that could never satisfy the `>= 0` guard below.
    if (typeof totalCash === 'number' && typeof portfolio?.totalOutflows === 'number' && portfolio.totalOutflows > 0) {
      const period = bankMonitoring.period
      const days = period?.days || 30
      const dailyBurn = portfolio.totalOutflows / days
      const runwayDays = dailyBurn > 0 ? totalCash / dailyBurn : Infinity
      if (runwayDays < 30 && runwayDays >= 0) {
        out.push({
          fingerprint: buildFingerprint('cashflow', 'high-burn-rate'),
          type: 'cashflow',
          severity: 'warning',
          title: 'High cash burn rate',
          description: `At current spending rates ($${dailyBurn.toFixed(0)}/day), cash reserves will be depleted in ${Math.round(runwayDays)} days.`,
          metric: { label: 'Runway', value: Math.round(runwayDays), format: 'number' },
          comparison: { label: 'Daily Burn', value: toCurrency(dailyBurn), format: 'currency', trend: 'up' },
          recommendation: 'Reduce discretionary spending and accelerate invoice collection to extend cash runway.',
          tags: ['burn rate', 'runway'],
          dataSources: ['Bank Monitoring'],
        })
      }
    }
  }

  if (cashForecast) {
    // Shortfall projected
    if (cashForecast.shortfallDates?.length > 0) {
      out.push({
        fingerprint: buildFingerprint('cashflow', 'shortfall-projected'),
        type: 'cashflow',
        severity: 'critical',
        title: 'Cash shortfall projected',
        description: `Forecast shows negative cash balance on ${cashForecast.shortfallDates.length} date(s). First shortfall: ${cashForecast.shortfallDates[0]}.`,
        metric: { label: 'Min Projected Balance', value: toCurrency(cashForecast.minProjectedBalance ?? 0), format: 'currency' },
        comparison: { label: 'Current Cash', value: toCurrency(cashForecast.currentCash ?? 0), format: 'currency', trend: 'down' },
        recommendation: 'Arrange bridging finance, accelerate collections, or defer outgoing payments before the shortfall date.',
        tags: ['forecast', 'shortfall'],
        dataSources: ['Cash Flow Forecast'],
      })
    }
  }

  return out
}
