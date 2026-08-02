/**
 * GET /api/xero/get-out/cash-position
 *
 * The "do I actually have the cash" widget. Pulls bank account balances
 * from the Xero Bank Summary report, computes a 90-day average outflow
 * to derive days-of-cash-on-hand and runway months.
 *
 * This is the first thing an accountant looks at on any cashflow page.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import {
  fetchBankBalances,
  fetchRecentPaidExpenses,
} from '~~/server/utils/xeroDataFetcher'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantIdRaw = await getSelectedTenant(event)
  if (!tenantIdRaw) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  }
  const tenantId = tenantIdRaw
  const accessToken = token.access_token!

  return cachedFetch(event, `xero-get-out:${tenantId}:cash-position`, 300, async () => {
    const [balances, expenses] = await Promise.all([
      fetchBankBalances(accessToken, tenantId),
      fetchRecentPaidExpenses(accessToken, tenantId),
    ])

    // Liquid cash only. Credit cards are reported by Xero as bank accounts, but
    // card debt is a payable, not negative cash — folding it in here would both
    // understate available funds and make the runway division meaningless.
    const cashOnHand = balances.cash

    // 90-day rolling outflow → daily average. Using actual paid expenses
    // is more accurate than the configured monthly target (which is
    // forward-looking) for the runway calculation.
    const totalRecentExpenses = (expenses?.invoices ?? [])
      .reduce((sum: number, inv: any) => sum + (Number(inv?.total) || 0), 0)
    const avgDailyOutflow = totalRecentExpenses / 90

    // Fallback: if we couldn't compute from history, use the Get Out target
    // as the assumed monthly burn (target = wages + expenses + extras).
    let burnSource: 'historical' | 'target' = 'historical'
    let dailyOutflow = avgDailyOutflow
    if (!Number.isFinite(dailyOutflow) || dailyOutflow <= 0) {
      const cfg = await loadGetOutConfig(tenantId)
      const monthlyBurn = summariseConfig(cfg).totalCents / 100
      dailyOutflow = monthlyBurn / 30
      burnSource = 'target'
    }

    // Negative cash means the operating account is overdrawn — runway math
    // (cash ÷ burn) produces meaningless negative days, so we surface a
    // distinct `overdrawn` state instead of "-175d runway".
    const overdrawn = cashOnHand < 0
    const daysOfCash = overdrawn
      ? 0
      : dailyOutflow > 0 ? Math.floor(cashOnHand / dailyOutflow) : null
    const monthsRunway = overdrawn
      ? 0
      : dailyOutflow > 0 ? Math.round((cashOnHand / (dailyOutflow * 30)) * 10) / 10 : null

    // Health bands (industry rule of thumb): <30 days critical, <90 tight,
    // 90-180 healthy, >180 strong. Overdrawn always = critical.
    let band: 'critical' | 'tight' | 'healthy' | 'strong' | 'unknown' = 'unknown'
    if (overdrawn) band = 'critical'
    else if (daysOfCash != null) {
      if (daysOfCash < 30) band = 'critical'
      else if (daysOfCash < 90) band = 'tight'
      else if (daysOfCash < 180) band = 'healthy'
      else band = 'strong'
    }

    return {
      cashOnHand: Math.round(cashOnHand * 100) / 100,
      // Surfaced separately so card debt stays visible rather than silently
      // netted away: netPosition is what the old (over-counted) figure meant.
      creditCardBalance: Math.round(balances.creditCard * 100) / 100,
      netPosition: Math.round(balances.net * 100) / 100,
      accounts: balances.accounts.map(a => ({
        name: a.name,
        balance: Math.round(a.balance * 100) / 100,
        isCreditCard: a.isCreditCard
      })),
      avgDailyOutflow: Math.round(dailyOutflow * 100) / 100,
      avgMonthlyOutflow: Math.round(dailyOutflow * 30 * 100) / 100,
      daysOfCash,
      monthsRunway,
      band,
      overdrawn,
      burnSource,
      computedAt: new Date().toISOString(),
    }
  })
})
