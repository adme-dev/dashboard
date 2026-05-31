// server/utils/anomalyDetection/index.ts
import { profitabilityAnalyser } from './analysers/profitability'
import { revenueAnalyser } from './analysers/revenue'
import { expensesAnalyser } from './analysers/expenses'
import { cashflowAnalyser } from './analysers/cashflow'
import { receivablesAnalyser } from './analysers/receivables'
import { budgetAnalyser } from './analysers/budget'
import { adspendAnalyser } from './analysers/adspend'
import { clientsAnalyser } from './analysers/clients'
import { transactionsAnalyser } from './analysers/transactions'
import { ga4Analyser } from './analysers/ga4'

import type { AnalyserContext, DetectedAnomaly } from './types'

const ALL = [
  profitabilityAnalyser,
  revenueAnalyser,
  expensesAnalyser,
  cashflowAnalyser,
  receivablesAnalyser,
  budgetAnalyser,
  adspendAnalyser,
  clientsAnalyser,
  transactionsAnalyser,
  ga4Analyser,
]

export async function runAllAnalysers(ctx: AnalyserContext): Promise<DetectedAnomaly[]> {
  const results = await Promise.all(ALL.map(a => safeAnalyser(a, ctx)))
  return results.flat()
}

async function safeAnalyser(a: typeof ALL[number], ctx: AnalyserContext) {
  try { return await a(ctx) } catch (err) {
    console.error(`[anomalies] analyser failed: ${a.name}`, err)
    return []
  }
}
