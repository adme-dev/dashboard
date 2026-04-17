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
import { generateClaudeInsight, CLAUDE_MODELS } from '~~/server/utils/claudeClient'
import { query } from '~~/server/utils/db'
import { embedRecommendation } from '~~/server/utils/advisorEmbedder'
import { METRIC_REGISTRY } from '~~/server/utils/advisorMetrics'
import { buildClientSnapshot } from '~~/server/utils/advisorClientSnapshot'

// Path into the reduced `snapshot` object (not the raw endpoint
// response) for every metric the advisor can tag. Kept in sync with
// how the snapshot is built below.
const SNAPSHOT_PATHS: Record<string, string[]> = {
  netMarginMonth: ['pnl', 'netMarginMonth'],
  netProfitMonth: ['pnl', 'netProfitMonth'],
  netProfitYtd: ['pnl', 'netProfitYtd'],
  revenueMonth: ['pnl', 'revenueMonth'],
  debtorDays: ['execSummary', 'debtorDays'],
  creditorDays: ['execSummary', 'creditorDays'],
  grossProfitPercent: ['execSummary', 'grossProfitPercent'],
  netProfitPercent: ['execSummary', 'netProfitPercent'],
  currentRatio: ['execSummary', 'currentRatio'],
  top1Share: ['concentration', 'top1Share'],
  top3Share: ['concentration', 'top3Share'],
  mrr: ['recurring', 'mrr'],
  outstandingTotal: ['aging', 'totalOutstanding'],
  overdueAmount: ['aging', 'criticalAmount'],
  totalUnearned: ['unearnedRevenue', 'total'],
}

function readSnapshotPath(obj: any, path: string[]): number | null {
  let cur = obj
  for (const k of path) {
    if (cur == null) return null
    cur = cur[k]
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null
}

type Advisor = {
  asOf: string
  verdict: string
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  score: number
  headline: string
  strengths: Array<{ title: string; detail: string }>
  risks: Array<{ title: string; detail: string; severity: 'low' | 'medium' | 'high' }>
  recommendations: Array<{
    priority: 'low' | 'medium' | 'high'
    title: string
    impact: string
    action: string
    target_metric?: string | null
    target_direction?: 'up' | 'down' | null
  }>
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
  "recommendations": [ { "priority": "low"|"medium"|"high", "title": "...", "impact": "expected benefit in dollars or %", "action": "concrete next step", "target_metric": "<optional metric key from registry below>", "target_direction": "up"|"down" } ],
  "alerts":    [ { "level": "info"|"warning"|"critical", "message": "..." } ]
}

Metric registry (use EXACTLY these keys when tagging target_metric, otherwise omit the field):
 - netMarginMonth — net profit margin for the month (percent, up is good)
 - netProfitMonth — net profit for the month (currency, up)
 - netProfitYtd — YTD net profit (currency, up)
 - revenueMonth — revenue for the month (currency, up)
 - debtorDays — days sales outstanding (days, DOWN is good)
 - creditorDays — days payable outstanding (days, up is generally good within limits)
 - grossProfitPercent — gross profit % (percent, up)
 - netProfitPercent — net profit % (percent, up)
 - currentRatio — current assets / current liabilities (ratio, up)
 - top1Share — top-1 client revenue share (percent, DOWN is good — concentration risk)
 - top3Share — top-3 client revenue share (percent, DOWN)
 - mrr — monthly recurring revenue (currency, up)
 - outstandingTotal — total outstanding A/R (currency, DOWN)
 - overdueAmount — 90+ day overdue A/R (currency, DOWN)
 - totalUnearned — unearned revenue / deferred (currency, up — implies prepaid retainers)

Rules:
 - Reply with the JSON object ONLY — no markdown fences, no prose.
 - Be specific with numbers from the data you're given.
 - Prefer 3-5 items per list; never more than 7.
 - Agency industry benchmarks you can reference when relevant: gross margin 45-60%, net margin 10-20%, DSO < 45 days, DPO 30-45 days, retainer revenue 40-60% of total, top-3 client concentration < 50%.
 - When flagging risk, tie it to an action that would move a specific metric.
 - Never invent data; if a field is missing just skip it.
 - Tag target_metric + target_direction on any recommendation that clearly moves one of the registry metrics. Skip the tag if the action doesn't fit the registry.`

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
  const requestedClientId = typeof q.clientId === 'string' && q.clientId !== 'agency' ? q.clientId : null
  const cacheKey = requestedClientId
    ? `ai:financial-advisor:${tenantId}:${toDate}:client:${requestedClientId}`
    : `ai:financial-advisor:${tenantId}:${toDate}`

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

    // Client-scoped snapshot — derived from tracking categories and
    // contact matches. Null until per-client Xero OAuth lands.
    let clientSnapshot: Awaited<ReturnType<typeof buildClientSnapshot>> = null
    if (requestedClientId) {
      clientSnapshot = await buildClientSnapshot(event, requestedClientId, toDate)
    }

    // Carry-over: pull up to 10 recommendations still open or in-progress
    // from prior months so the LLM can call them out instead of repeating
    // itself. Scoped to (tenant, client) so each scope has its own memory.
    let carryOver: Array<{ title: string; action: string; priority: string; status: string; period_label: string | null }> = []
    try {
      const carryWhere = requestedClientId
        ? `r.tenant_id = $1 AND r.client_id = $2 AND r.status IN ('open', 'in_progress')`
        : `r.tenant_id = $1 AND r.client_id IS NULL AND r.status IN ('open', 'in_progress')`
      const carryParams: any[] = requestedClientId ? [tenantId, requestedClientId] : [tenantId]
      carryOver = await query<any>(
        `SELECT r.title, r.action, r.priority, r.status, far.period_label
         FROM recommendations r
         LEFT JOIN financial_advisor_reports far ON far.id = r.source_report_id
         WHERE ${carryWhere}
         ORDER BY
           CASE r.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
           r.created_at DESC
         LIMIT 10`,
        carryParams
      )
    } catch (err: any) {
      console.warn('[financial-advisor] carry-over query failed:', err?.message ?? err)
    }

    const carryOverBlock = carryOver.length === 0 ? '' : `\n\nCARRY-OVER ITEMS (unresolved from prior months — reference these when still relevant, but don't repeat them verbatim):\n${JSON.stringify(carryOver, null, 2)}`
    const clientBlock = clientSnapshot ? `\n\nCLIENT-SCOPED VIEW for ${clientSnapshot.client.name} (derived from the agency's tracking categories + contact matches — treat numbers as approximate):\n${JSON.stringify(clientSnapshot, null, 2)}` : ''
    const promptBody = requestedClientId && clientSnapshot
      ? `Analyse the agency's books for its client "${clientSnapshot.client.name}" and return the structured advice JSON. Speak directly to the AGENCY'S OWNER about their relationship with this client — pricing, collections, profitability, retention. Base AGENCY SNAPSHOT is included for context but focus on the CLIENT-SCOPED VIEW.\n\nAGENCY SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}${clientBlock}${carryOverBlock}`
      : `Analyse this agency's financials for ${toDate} and return the structured advice JSON.\n\nSNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}${carryOverBlock}`

    // Backend selection: Claude for prompt-cached runs (the SYSTEM_PROMPT
    // is the same ~3K tokens every call — huge cache win), Groq otherwise.
    // Default stays Groq so flipping ADVISOR_BACKEND=claude is opt-in, and
    // Claude errors fall back to Groq so a bad API key doesn't break advisor.
    const backend = (process.env.ADVISOR_BACKEND ?? 'groq').toLowerCase()
    let raw: string
    let modelUsed = 'openai/gpt-oss-120b'

    if (backend === 'claude') {
      try {
        const result = await generateClaudeInsight(promptBody, {
          model: CLAUDE_MODELS.SONNET_4_6,
          maxTokens: 2500,
          systemPrompt: SYSTEM_PROMPT,
        })
        raw = result.text
        modelUsed = result.model
        console.log(
          `[financial-advisor] claude ok — in=${result.usage.inputTokens} out=${result.usage.outputTokens} cache_read=${result.usage.cacheReadTokens} cache_write=${result.usage.cacheCreationTokens}`
        )
      } catch (err: any) {
        console.warn('[financial-advisor] Claude failed, falling back to Groq:', err?.message)
        raw = await generateGroqInsight(promptBody, {
          model: GROQ_MODELS.REASONING_120B,
          temperature: 0.3,
          maxTokens: 2500,
          systemPrompt: SYSTEM_PROMPT,
        })
      }
    } else {
      try {
        raw = await generateGroqInsight(promptBody, {
          model: GROQ_MODELS.REASONING_120B,
          temperature: 0.3,
          maxTokens: 2500,
          systemPrompt: SYSTEM_PROMPT,
        })
      } catch (err: any) {
        console.warn('[financial-advisor] REASONING_120B failed, falling back to LLAMA_70B:', err?.message)
        raw = await generateGroqInsight(promptBody, {
          model: GROQ_MODELS.LLAMA_70B,
          temperature: 0.3,
          maxTokens: 2500,
          systemPrompt: SYSTEM_PROMPT,
        })
        modelUsed = 'llama-3.3-70b-versatile'
      }
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

    // Archive the report keyed by tenant + period so owners can look
    // back at past CFO reads. Best-effort — never break the endpoint.
    // Also mirror each recommendation into the `recommendations` backlog
    // table so owners can triage + assign them from /advisor.
    try {
      const periodDate = new Date(toDate)
      const periodLabel = periodDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
      const user = (event.context as any).user
      const archiveRows = await query<{ id: string }>(
        `INSERT INTO financial_advisor_reports
            (tenant_id, period_key, period_label, grade, score, headline, verdict, payload, model, generated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          tenantId,
          toDate,
          periodLabel,
          result.grade,
          result.score,
          result.headline,
          result.verdict,
          JSON.stringify(result),
          modelUsed,
          user?.id ?? null,
        ]
      )
      const reportId = archiveRows?.[0]?.id ?? null

      if (reportId && result.recommendations.length > 0) {
        for (const rec of result.recommendations) {
          // Validate target_metric against the registry. If the model
          // emits something we don't track, drop it rather than poison
          // the attribution job later.
          const metricName = rec.target_metric && METRIC_REGISTRY[rec.target_metric] ? rec.target_metric : null
          const registryEntry = metricName ? METRIC_REGISTRY[metricName] : null
          const baselineValue = metricName ? readSnapshotPath(snapshot, SNAPSHOT_PATHS[metricName] ?? []) : null
          const direction = (rec.target_direction === 'up' || rec.target_direction === 'down')
            ? rec.target_direction
            : (registryEntry?.preferredDirection ?? null)

          const inserted = await query<{ id: string }>(
            `INSERT INTO recommendations
                (tenant_id, client_id, source_report_id, title, action, impact, priority,
                 target_metric, baseline_metric_value, target_direction,
                 xero_metric_snapshot)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
              tenantId,
              requestedClientId,
              reportId,
              rec.title,
              rec.action,
              rec.impact ?? null,
              rec.priority,
              metricName,
              baselineValue,
              direction,
              JSON.stringify(requestedClientId && clientSnapshot ? { agency: snapshot, client: clientSnapshot } : snapshot),
            ]
          )
          const recId = inserted?.[0]?.id
          if (recId) {
            // Fire-and-forget: embed for Vectorize-backed similarity search.
            // Errors are swallowed inside the helper — never fail the
            // advisor response over a vector upsert.
            embedRecommendation(event, {
              id: recId,
              tenant_id: tenantId,
              client_id: requestedClientId,
              client_name: clientSnapshot?.client.name ?? null,
              source_report_id: reportId,
              period_key: toDate,
              period_label: periodLabel,
              title: rec.title,
              action: rec.action,
              impact: rec.impact ?? null,
              priority: rec.priority,
              status: 'open',
            }).catch((err: any) => {
              console.warn('[financial-advisor] embed failed:', err?.message ?? err)
            })
          }
        }
      }
    } catch (err: any) {
      console.warn('[financial-advisor] archive failed:', err?.message ?? err)
    }

    return result
  })
})
