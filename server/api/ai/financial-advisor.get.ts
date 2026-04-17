/**
 * GET /api/ai/financial-advisor
 *
 * The "CFO in a sidebar" endpoint. Aggregates every finance signal we
 * already have into one structured prompt, sends it to Groq, and
 * returns a typed verdict + strengths / risks / recommendations /
 * alerts for the /reports slide-over.
 *
 * Cached 1 hour per tenant/period.
 */

import { createError } from 'h3'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

type Advisor = {
  asOf: string
  verdict: string
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  score: number
  headline: string
  strengths: Array<{ title: string; detail: string }>
  risks: Array<{ title: string; detail: string; severity: 'low' | 'medium' | 'high' }>
  recommendations: Array<{ priority: 'low' | 'medium' | 'high'; title: string; impact: string; action: string }>
  alerts: Array<{ level: 'info' | 'warning' | 'critical'; message: string }>
  industryContext?: string
}

const SYSTEM_PROMPT = `You are a senior CFO advising the owner of a digital marketing agency.
You read structured financial snapshots and return concise, actionable CFO-grade advice.

Your output MUST be a JSON object with exactly these keys and shapes:
{
  "verdict": "one sentence bottom-line read of this month",
  "grade": "A" | "B" | "C" | "D" | "F",
  "score": 0-100 integer,
  "headline": "one short headline (<= 10 words) for the top of the panel",
  "strengths": [ { "title": "...", "detail": "1-2 sentences" } ],
  "risks":     [ { "title": "...", "detail": "1-2 sentences", "severity": "low"|"medium"|"high" } ],
  "recommendations": [ { "priority": "low"|"medium"|"high", "title": "...", "impact": "expected benefit in dollars or %", "action": "concrete next step" } ],
  "alerts":    [ { "level": "info"|"warning"|"critical", "message": "..." } ]
}

Rules:
 - Reply with the JSON object ONLY — no markdown fences, no prose.
 - Be specific with numbers from the data you're given.
 - Prefer 3-5 items per list; never more than 7.
 - Agency industry benchmarks you can reference when relevant: gross margin 45-60%, net margin 10-20%, DSO < 45 days, DPO 30-45 days, retainer revenue 40-60% of total, top-3 client concentration < 50%.
 - When flagging risk, tie it to an action that would move a specific metric.
 - Never invent data; if a field is missing just skip it.`

async function fetchInternal(event: any, path: string, query?: Record<string, any>): Promise<any> {
  try {
    return await $fetch(path, { headers: { cookie: (event.node.req.headers.cookie as string) ?? '' }, query })
  } catch {
    return null
  }
}

function round2(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }
  if (!token?.access_token) {
    throw createError({ statusCode: 401, statusMessage: 'Xero not connected' })
  }

  const q = getQuery(event)
  const toDate = typeof q.toDate === 'string' ? q.toDate : new Date().toISOString().slice(0, 10)
  const cacheKey = `ai:financial-advisor:${tenantId}:${toDate}`

  return cachedFetch<Advisor>(event, cacheKey, 3600, async () => {
    // Pull every report in parallel from our own endpoints — they're
    // already cached via SWR, so this is cheap after the first run.
    const [pnl, bs, exec, aging, pipeline, mrr, unearned, credits, concentration, budget] = await Promise.all([
      fetchInternal(event, '/api/xero/reports/pnl-detailed', { toDate }),
      fetchInternal(event, '/api/xero/reports/balance-sheet', { toDate }),
      fetchInternal(event, '/api/xero/reports/executive-summary', { date: toDate }),
      fetchInternal(event, '/api/xero/reports/aging'),
      fetchInternal(event, '/api/xero/invoice-pipeline'),
      fetchInternal(event, '/api/xero/repeating-invoices'),
      fetchInternal(event, '/api/xero/prepayments-overpayments'),
      fetchInternal(event, '/api/xero/credit-notes'),
      fetchInternal(event, '/api/xero/client-concentration'),
      fetchInternal(event, '/api/xero/reports/budget-variance'),
    ])

    // Reduce to just the summary numbers a CFO would scan — the full
    // payloads are huge and the LLM doesn't need every invoice row.
    const snapshot = {
      asOf: toDate,
      pnl: pnl?.summary ? {
        revenueMonth: round2(pnl.summary.revenue?.month),
        revenuePrevMonth: round2(pnl.summary.revenue?.previousMonth),
        revenueYtd: round2(pnl.summary.revenue?.ytd),
        grossProfitMonth: round2(pnl.summary.grossProfit?.month),
        operatingExpensesMonth: round2(pnl.summary.operatingExpenses?.month),
        netProfitMonth: round2(pnl.summary.netProfit?.month),
        netProfitYtd: round2(pnl.summary.netProfit?.ytd),
        netMarginMonth: round2(pnl.summary.netMargin?.month),
        netMarginYtd: round2(pnl.summary.netMargin?.ytd),
      } : null,
      balanceSheet: bs ? {
        totalAssets: round2(bs.totalAssets),
        totalLiabilities: round2(bs.totalLiabilities),
        totalEquity: round2(bs.totalEquity),
        workingCapital: round2(bs.workingCapital),
        debtToEquity: round2(bs.debtToEquity),
        equityRatio: round2(bs.equityRatio),
      } : null,
      execSummary: exec?.metrics ? {
        debtorDays: exec.metrics.debtorDays?.latest ?? null,
        creditorDays: exec.metrics.creditorDays?.latest ?? null,
        grossProfitPercent: exec.metrics.grossProfitPercent?.latest ?? null,
        netProfitPercent: exec.metrics.netProfitPercent?.latest ?? null,
        currentRatio: exec.metrics.currentRatio?.latest ?? null,
        shortTermCashForecast: exec.metrics.shortTermCashForecast?.latest ?? null,
      } : null,
      aging: aging ? {
        totalOutstanding: round2(aging.totalOutstanding),
        totalInvoices: aging.totalInvoices,
        criticalAmount: round2(aging.criticalAmount),
        criticalCount: aging.criticalCount,
        averageDaysPastDue: round2(aging.averageDaysPastDue),
        topDebtors: (aging.topContacts ?? []).slice(0, 3).map((c: any) => ({ name: c.name, amount: round2(c.amount), oldestDays: c.oldestDays })),
      } : null,
      pipeline: pipeline?.summary ? {
        totalValue: round2(pipeline.summary.totalValue),
        outstandingValue: round2(pipeline.summary.outstandingValue),
        overdueRate: round2(pipeline.summary.overdueRate),
        averageCollectionTime: pipeline.summary.averageCollectionTime,
        riskLevel: pipeline.summary.riskLevel,
      } : null,
      recurring: mrr?.summary ? {
        mrr: round2(mrr.summary.mrr),
        arr: round2(mrr.summary.arr),
        activeCount: mrr.summary.activeCount,
        clientCount: mrr.summary.clientCount,
        recurringMonthlyCosts: round2(mrr.summary.recurringMonthlyCosts),
        netRecurring: round2(mrr.summary.netRecurring),
      } : null,
      unearnedRevenue: unearned?.summary ? {
        total: round2(unearned.summary.totalUnearned),
        prepay: round2(unearned.summary.prepayRemaining),
        overpay: round2(unearned.summary.overpayRemaining),
      } : null,
      credits: credits?.summary ? {
        issuedYtd: round2(credits.summary.issuedYtdTotal),
        issuedMonth: round2(credits.summary.issuedMonthTotal),
      } : null,
      concentration: concentration?.summary ? {
        clientCount: concentration.summary.clientCount,
        top1Share: concentration.summary.top1Share,
        top3Share: concentration.summary.top3Share,
        top10Share: concentration.summary.top10Share,
        risk: concentration.summary.risk,
        topClients: (concentration.clients ?? []).slice(0, 3).map((c: any) => ({ name: c.name, sharePct: c.sharePct })),
      } : null,
      budget: budget?.summary ? {
        totalBudget: round2(budget.summary.totalBudget),
        totalActual: round2(budget.summary.totalActual),
        totalVariance: round2(budget.summary.totalVariance),
        overBudgetCount: budget.summary.overBudgetCount,
      } : null,
    }

    // Deep reasoning + strong structured-output adherence on Groq as of
    // April 2026 → openai/gpt-oss-120b. Fall back to llama-3.3-70b if the
    // provider ever 404s that model ID.
    let raw: string
    try {
      raw = await generateGroqInsight(
        `Analyse this agency's financials for ${toDate} and return the structured advice JSON.\n\nSNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}`,
        {
          model: GROQ_MODELS.REASONING_120B,
          temperature: 0.3,
          maxTokens: 2500,
          systemPrompt: SYSTEM_PROMPT,
        }
      )
    } catch (err: any) {
      console.warn('[financial-advisor] REASONING_120B failed, falling back to LLAMA_70B:', err?.message)
      raw = await generateGroqInsight(
        `Analyse this agency's financials for ${toDate} and return the structured advice JSON.\n\nSNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}`,
        {
          model: GROQ_MODELS.LLAMA_70B,
          temperature: 0.3,
          maxTokens: 2500,
          systemPrompt: SYSTEM_PROMPT,
        }
      )
    }

    // Be tolerant of markdown fences the model sometimes wraps JSON in.
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    let parsed: Partial<Advisor>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      throw createError({ statusCode: 502, statusMessage: 'Advisor produced invalid JSON' })
    }

    const result: Advisor = {
      asOf: toDate,
      verdict: parsed.verdict ?? 'Analysis unavailable.',
      grade: (parsed.grade as Advisor['grade']) ?? 'C',
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 50,
      headline: parsed.headline ?? 'Monthly review',
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 7) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 7) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 7) : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts.slice(0, 7) : [],
    }
    return result
  })
})
