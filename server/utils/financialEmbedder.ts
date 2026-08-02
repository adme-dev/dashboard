import type { H3Event } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { generateEmbedding, upsertVector } from '~~/server/utils/aiVectorize'

/**
 * Financial data embedder — embeds rich textual summaries of financial data
 * (expenses, invoices, clients, P&L, cash position) into Vectorize for
 * semantic search in AI chat.
 *
 * Uses the same SHA-256 change detection + ai_embeddings_log pattern as aiEntityEmbedder.ts.
 */

async function hashContent(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function shouldReembed(entityType: string, entityId: string, contentHash: string): Promise<boolean> {
  const existing = await queryOne<any>(`
    SELECT content_hash FROM ai_embeddings_log
    WHERE entity_type = $1 AND entity_id = $2
  `, [entityType, entityId])
  return existing?.content_hash !== contentHash
}

async function logEmbedding(entityType: string, entityId: string, vectorId: string, contentHash: string): Promise<void> {
  await execute(`
    INSERT INTO ai_embeddings_log (entity_type, entity_id, vector_id, content_hash)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET vector_id = EXCLUDED.vector_id,
        content_hash = EXCLUDED.content_hash,
        created_at = NOW()
  `, [entityType, entityId, vectorId, contentHash])
}

function fmtAUD(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-AU')
}

function getCurrentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface EmbedResult {
  status: 'embedded' | 'skipped' | 'error'
  entityId: string
  error?: string
}

// ─── Expense Snapshot ───

export async function embedExpenseSnapshot(event: H3Event, period?: string, preData?: any): Promise<EmbedResult> {
  const p = period || getCurrentPeriod()
  const entityId = `fin-expenses-${p}`

  try {
    const data = preData || await $fetch('/api/xero/expenses', {
      headers: event.headers,
    })
    if (!data?.categories?.length) return { status: 'skipped', entityId }

    const totalNet = data.taxSummary?.totalNet || data.categories.reduce((s: number, c: any) => s + c.amount, 0)
    const topCats = (data.categories || []).slice(0, 5)
    const topVendors = (data.vendors || []).slice(0, 5)
    const fv = data.fixedVsVariable || {}
    const fixedTotal = fv.fixed?.total || 0
    const varTotal = fv.variable?.total || 0
    const combined = (fixedTotal + varTotal) || 1
    const subs = data.subscriptions || {}
    const mom = data.monthOverMonth || {}
    const changeStr = mom.change ? `${mom.change > 0 ? '+' : ''}${mom.change}%` : 'N/A'

    const text = [
      `Monthly Expense Summary for ${p}`,
      `Total expenses: ${fmtAUD(totalNet)} (ex GST). Change from previous period: ${changeStr}.`,
      `Top categories: ${topCats.map((c: any, i: number) => `${i + 1}. ${c.name}: ${fmtAUD(c.amount)} (${Math.round(c.amount / totalNet * 100)}%)`).join(', ')}`,
      `Top vendors: ${topVendors.map((v: any, i: number) => `${i + 1}. ${v.name}: ${fmtAUD(v.amount)}`).join(', ')}`,
      `Fixed: ${Math.round(fixedTotal / combined * 100)}% (${fmtAUD(fixedTotal)}) | Variable: ${Math.round(varTotal / combined * 100)}% (${fmtAUD(varTotal)})`,
      subs.items?.length ? `Subscriptions: ${subs.items.length} vendors totalling ${fmtAUD(subs.total)}/month. Largest: ${subs.items.slice(0, 3).map((s: any) => `${s.vendor} ${fmtAUD(s.amount)}`).join(', ')}` : '',
      data.taxSummary ? `GST: ${fmtAUD(data.taxSummary.totalTax)} on ${fmtAUD(data.taxSummary.totalGross)} gross` : '',
    ].filter(Boolean).join('\n')

    const contentHash = await hashContent(text)
    if (!(await shouldReembed('fin-expenses', entityId, contentHash))) {
      return { status: 'skipped', entityId }
    }

    const embedding = await generateEmbedding(event, text)
    if (embedding.length === 0) return { status: 'error', entityId, error: 'AI binding unavailable' }

    const vectorId = entityId
    await upsertVector(event, vectorId, embedding, {
      type: 'fin-expenses',
      period: p,
      title: `Expense Summary ${p}`,
    })
    await logEmbedding('fin-expenses', entityId, vectorId, contentHash)
    return { status: 'embedded', entityId }
  } catch (err: any) {
    return { status: 'error', entityId, error: err.message || String(err) }
  }
}

// ─── Invoice Snapshot ───

export async function embedInvoiceSnapshot(event: H3Event, period?: string, preData?: any): Promise<EmbedResult> {
  const p = period || getCurrentPeriod()
  const entityId = `fin-invoices-${p}`

  try {
    const data = preData || await $fetch('/api/xero/invoices', {
      headers: event.headers,
    })
    if (!data) return { status: 'skipped', entityId }

    // Response shape: { summary: { outstandingTotal, overdueTotal, ... }, outstanding: [...], overdue: [...], paid: [...] }
    const s = (data as any).summary
    if (!s) return { status: 'skipped', entityId }

    const outstandingList = (data as any).outstanding || []
    const overdueList = (data as any).overdue || []
    const paidList = (data as any).paid || []

    const topOutstanding = outstandingList
      .sort((a: any, b: any) => (b.amountDue || 0) - (a.amountDue || 0))
      .slice(0, 3)

    const text = [
      `Invoice Summary for ${p}`,
      `Outstanding: ${s.outstandingCount || outstandingList.length} invoices worth ${fmtAUD(s.outstandingTotal || 0)}. Overdue: ${s.overdueCount || overdueList.length} worth ${fmtAUD(s.overdueTotal || 0)}.`,
      `Due soon: ${fmtAUD(s.dueSoonTotal || 0)}. Avg days to pay: ${s.avgDaysToPay ?? 'N/A'}.`,
      `Paid last 30d: ${s.paidLast30Count || paidList.length} invoices worth ${fmtAUD(s.paidLast30Total || 0)}.`,
      topOutstanding.length ? `Top outstanding: ${topOutstanding.map((i: any, idx: number) => `${idx + 1}. ${i.contact || 'Unknown'}: ${fmtAUD(i.amountDue)}`).join(', ')}` : '',
      `Aging: Current ${s.agingBuckets?.current || 0}, Due soon ${s.agingBuckets?.dueSoon || 0}, 7d overdue ${s.agingBuckets?.overdue7 || 0}, 30d+ overdue ${(s.agingBuckets?.overdue30 || 0) + (s.agingBuckets?.overdue60 || 0)}`,
    ].filter(Boolean).join('\n')

    const contentHash = await hashContent(text)
    if (!(await shouldReembed('fin-invoices', entityId, contentHash))) {
      return { status: 'skipped', entityId }
    }

    const embedding = await generateEmbedding(event, text)
    if (embedding.length === 0) return { status: 'error', entityId, error: 'AI binding unavailable' }

    const vectorId = entityId
    await upsertVector(event, vectorId, embedding, {
      type: 'fin-invoices',
      period: p,
      title: `Invoice Summary ${p}`,
    })
    await logEmbedding('fin-invoices', entityId, vectorId, contentHash)
    return { status: 'embedded', entityId }
  } catch (err: any) {
    return { status: 'error', entityId, error: err.message || String(err) }
  }
}

// ─── Client Financial Profile ───

export async function embedClientFinancials(event: H3Event, clientId: string, clientName: string, period?: string, preData?: any): Promise<EmbedResult> {
  const p = period || getCurrentPeriod()
  const entityId = `fin-client-${clientId}-${p}`

  try {
    const data = preData || {}
    const revenue = data.revenue || 0
    const outstandingAmt = data.outstanding || 0
    const overdueAmt = data.overdue || 0
    const metaSpend = data.metaSpend || 0
    const googleSpend = data.googleSpend || 0
    const totalAdSpend = metaSpend + googleSpend
    const avgDaysToPay = data.avgDaysToPay || 'N/A'

    const text = [
      `Financial Profile for ${clientName} — ${p}`,
      `Revenue: ${fmtAUD(revenue)} | Outstanding: ${fmtAUD(outstandingAmt)} | Overdue: ${fmtAUD(overdueAmt)}`,
      totalAdSpend > 0 ? `Ad spend (Meta): ${fmtAUD(metaSpend)} | Ad spend (Google): ${fmtAUD(googleSpend)} | Total: ${fmtAUD(totalAdSpend)}` : '',
      `Payment pattern: Average ${avgDaysToPay} days to pay.`,
    ].filter(Boolean).join('\n')

    const contentHash = await hashContent(text)
    if (!(await shouldReembed('fin-client', entityId, contentHash))) {
      return { status: 'skipped', entityId }
    }

    const embedding = await generateEmbedding(event, text)
    if (embedding.length === 0) return { status: 'error', entityId, error: 'AI binding unavailable' }

    const vectorId = entityId
    await upsertVector(event, vectorId, embedding, {
      type: 'fin-client',
      period: p,
      title: `${clientName} Financial Profile ${p}`,
      clientId,
    })
    await logEmbedding('fin-client', entityId, vectorId, contentHash)
    return { status: 'embedded', entityId }
  } catch (err: any) {
    return { status: 'error', entityId, error: err.message || String(err) }
  }
}

// ─── P&L Snapshot ───

export async function embedPnlSnapshot(event: H3Event, period?: string, preData?: any): Promise<EmbedResult> {
  const p = period || getCurrentPeriod()
  const entityId = `fin-pnl-${p}`

  try {
    const data = preData || await $fetch('/api/xero/reports/pnl', {
      headers: event.headers,
    })
    if (!data) return { status: 'skipped', entityId }

    // Response shape: { revenueTotal, expensesTotal, netProfit, profitMargin, periods: [...], expensesByCategory: [...] }
    const revenue = (data as any).revenueTotal || 0
    const expenses = (data as any).expensesTotal || 0
    const netProfit = (data as any).netProfit ?? (revenue - expenses)
    const margin = (data as any).profitMargin != null ? ((data as any).profitMargin * 100) : (revenue > 0 ? ((netProfit / revenue) * 100) : 0)

    // Top expense categories
    const expCats = ((data as any).expensesByCategory || []).slice(0, 5)

    const text = [
      `P&L Summary for ${p} (${(data as any).fromDate || ''} to ${(data as any).toDate || ''})`,
      `Revenue: ${fmtAUD(revenue)} | Expenses: ${fmtAUD(expenses)} | Net profit: ${fmtAUD(netProfit)} | Margin: ${margin.toFixed(1)}%`,
      expCats.length ? `Expense breakdown: ${expCats.map((e: any, i: number) => `${i + 1}. ${e.name} ${fmtAUD(e.value)}`).join(', ')}` : '',
    ].filter(Boolean).join('\n')

    const contentHash = await hashContent(text)
    if (!(await shouldReembed('fin-pnl', entityId, contentHash))) {
      return { status: 'skipped', entityId }
    }

    const embedding = await generateEmbedding(event, text)
    if (embedding.length === 0) return { status: 'error', entityId, error: 'AI binding unavailable' }

    const vectorId = entityId
    await upsertVector(event, vectorId, embedding, {
      type: 'fin-pnl',
      period: p,
      title: `P&L Summary ${p}`,
    })
    await logEmbedding('fin-pnl', entityId, vectorId, contentHash)
    return { status: 'embedded', entityId }
  } catch (err: any) {
    return { status: 'error', entityId, error: err.message || String(err) }
  }
}

// ─── Cash Position ───

export async function embedCashPosition(event: H3Event, preData?: any): Promise<EmbedResult> {
  const today = new Date().toISOString().slice(0, 10)
  const entityId = `fin-cash-${today}`

  try {
    const data = preData || await $fetch('/api/xero/bank-monitoring', {
      headers: event.headers,
    })
    if (!data) return { status: 'skipped', entityId }

    // Response shape: { portfolio: { totalBalance, riskLevel, netCashFlow, ... }, accounts: [...], alerts: [...] }
    const portfolio = (data as any).portfolio || {}
    const totalBalance = portfolio.totalBalance || 0
    const riskLevel = portfolio.riskLevel || 'unknown'
    const accounts = (data as any).accounts || []
    const netCashFlow = portfolio.netCashFlow || 0
    const alerts = (data as any).alerts || []

    const text = [
      `Cash Position as of ${today}`,
      `Total balance: ${fmtAUD(totalBalance)}. Risk level: ${riskLevel}.`,
      accounts.length ? `Accounts: ${accounts.slice(0, 4).map((a: any) => `${a.accountName} ${fmtAUD(a.currentBalance || 0)} (${a.healthStatus || 'ok'})`).join(', ')}` : '',
      netCashFlow ? `Net cash flow (30 days): ${netCashFlow > 0 ? '+' : ''}${fmtAUD(netCashFlow)}.` : '',
      alerts.length ? `Alerts: ${alerts.slice(0, 3).map((a: any) => a.message || a).join('; ')}` : 'Alerts: None',
    ].filter(Boolean).join('\n')

    const contentHash = await hashContent(text)
    if (!(await shouldReembed('fin-cash', entityId, contentHash))) {
      return { status: 'skipped', entityId }
    }

    const embedding = await generateEmbedding(event, text)
    if (embedding.length === 0) return { status: 'error', entityId, error: 'AI binding unavailable' }

    const vectorId = entityId
    await upsertVector(event, vectorId, embedding, {
      type: 'fin-cash',
      period: today,
      title: `Cash Position ${today}`,
    })
    await logEmbedding('fin-cash', entityId, vectorId, contentHash)
    return { status: 'embedded', entityId }
  } catch (err: any) {
    return { status: 'error', entityId, error: err.message || String(err) }
  }
}

// ─── Batch Embed All ───

export interface BatchEmbedResult {
  processed: number
  errors: number
  skipped: number
  details: string[]
  /**
   * Types that were not completed within the request budget. Present only when
   * work was deferred; call again with these types to continue. Progress is
   * durable — anything already embedded is hash-skipped on the next pass, so
   * repeated calls converge.
   */
  remaining?: string[]
}

export interface BatchEmbedOptions {
  /**
   * Wall-clock budget for the whole call. Each stage fans out to a heavy
   * Xero-backed endpoint, and running all five unbounded is what pushed this
   * past Cloudflare's per-request execution limit and returned an opaque 500.
   * Stop early and report instead of being killed.
   */
  budgetMs?: number
  /** Injectable clock, for tests. */
  now?: () => number
}

const DEFAULT_BATCH_BUDGET_MS = 20_000

/**
 * Client embeds run in small waves rather than one 20-wide Promise.allSettled.
 * Each client costs an embedding call, a Vectorize upsert and a DB write, so
 * the old shape fired ~60 subrequests simultaneously.
 */
const CLIENT_EMBED_CONCURRENCY = 4

/** Top-N clients by outstanding balance to embed. */
const CLIENT_EMBED_LIMIT = 20

export async function embedAllFinancialSnapshots(
  event: H3Event,
  period?: string,
  types?: string[],
  preData?: Record<string, any>,
  options: BatchEmbedOptions = {},
): Promise<BatchEmbedResult> {
  const now = options.now ?? (() => Date.now())
  const budgetMs = options.budgetMs ?? DEFAULT_BATCH_BUDGET_MS
  const startedAt = now()
  const outOfBudget = () => now() - startedAt >= budgetMs

  const results: EmbedResult[] = []
  const details: string[] = []
  const remaining: string[] = []
  const allTypes = types || ['expenses', 'invoices', 'pnl', 'cash', 'clients']

  const snapshotJobs: Array<[string, () => Promise<EmbedResult>]> = [
    ['expenses', () => embedExpenseSnapshot(event, period, preData?.expenses)],
    ['invoices', () => embedInvoiceSnapshot(event, period, preData?.invoices)],
    ['pnl', () => embedPnlSnapshot(event, period, preData?.pnl)],
    ['cash', () => embedCashPosition(event, preData?.cash)],
  ]

  for (const [name, run] of snapshotJobs) {
    if (!allTypes.includes(name)) continue
    if (outOfBudget()) {
      remaining.push(name)
      details.push(`${name}: deferred (request budget exhausted)`)
      continue
    }
    const r = await run()
    results.push(r)
    details.push(`${name}: ${r.status}${r.error ? ` (${r.error})` : ''}`)
  }

  // Client embeddings — top N by outstanding balance
  if (allTypes.includes('clients')) {
    if (outOfBudget()) {
      remaining.push('clients')
      details.push('clients: deferred (request budget exhausted)')
    } else {
      try {
        const contacts = preData?.contacts || await $fetch('/api/xero/contacts', {
          headers: event.headers,
        })
        const contactList = (contacts as any)?.contacts || (Array.isArray(contacts) ? contacts : [])

        // Sort by outstanding balance, take top N
        const topClients = contactList
          .filter((c: any) => c.balances?.accountsReceivable?.outstanding > 0 || c.balances?.accountsPayable?.outstanding > 0)
          .sort((a: any, b: any) => {
            const aOut = (a.balances?.accountsReceivable?.outstanding || 0) + (a.balances?.accountsPayable?.outstanding || 0)
            const bOut = (b.balances?.accountsReceivable?.outstanding || 0) + (b.balances?.accountsPayable?.outstanding || 0)
            return bOut - aOut
          })
          .slice(0, CLIENT_EMBED_LIMIT)

        let clientEmbedded = 0, clientSkipped = 0, clientErrors = 0, notReached = 0

        for (let i = 0; i < topClients.length; i += CLIENT_EMBED_CONCURRENCY) {
          if (outOfBudget()) {
            notReached = topClients.length - i
            break
          }
          const wave = topClients.slice(i, i + CLIENT_EMBED_CONCURRENCY)
          const waveResults = await Promise.allSettled(
            wave.map((c: any) => {
              const clientData = {
                revenue: c.balances?.accountsReceivable?.outstanding || 0,
                outstanding: c.balances?.accountsReceivable?.outstanding || 0,
                overdue: c.balances?.accountsReceivable?.overdue || 0,
                metaSpend: 0,
                googleSpend: 0,
              }
              return embedClientFinancials(event, c.contactID, c.name, period, clientData)
            })
          )

          for (const cr of waveResults) {
            if (cr.status === 'fulfilled') {
              if (cr.value.status === 'embedded') clientEmbedded++
              else if (cr.value.status === 'skipped') clientSkipped++
              else clientErrors++
              results.push(cr.value)
            } else {
              clientErrors++
              results.push({ status: 'error', entityId: 'unknown-client', error: String(cr.reason) })
            }
          }
        }

        if (notReached > 0) remaining.push('clients')
        details.push(
          `clients: ${clientEmbedded} embedded, ${clientSkipped} skipped, ${clientErrors} errors`
          + (notReached > 0 ? `, ${notReached} not reached (request budget exhausted)` : '')
          + ` (${topClients.length} total)`
        )
      } catch (err: any) {
        details.push(`clients: error (${err.message || String(err)})`)
      }
    }
  }

  return {
    processed: results.filter(r => r.status === 'embedded').length,
    errors: results.filter(r => r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    details,
    ...(remaining.length ? { remaining } : {}),
  }
}
