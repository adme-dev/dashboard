import { z } from 'zod'
// Internal calls use Nitro's auto-imported global $fetch (NOT raw ofetch): it resolves relative
// internal routes (e.g. '/api/xero/...') on the Cloudflare runtime. Raw ofetch has no origin base
// and throws on a relative URL — see confirm-action.post.ts (#129).
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'

const params = z.object({})
type Args = z.infer<typeof params>

type CashPosition = {
  /** Liquid cash — bank accounts only, credit cards excluded. */
  balance: number
  /** Credit-card balances, negative when drawn down. */
  creditCard: number
  /** balance + creditCard. */
  net: number
  runwayDays: number | null
  risk: string
}
type Overdue = { number: string, client: string, amount: number, overdueDays: number }
type Receivables = { total: number, top: Overdue[] }

export type FinanceSnapshotDeps = {
  cashPosition: (ctx: ToolContext) => Promise<CashPosition>
  outstanding: (ctx: ToolContext) => Promise<Receivables>
}

// Real wiring: Xero data is route-mediated (no pure DB util exists; advisorMetrics.ts sets the
// internal-$fetch precedent). Forward the caller's auth headers so Xero connection/tenant resolve.
const defaultDeps: FinanceSnapshotDeps = {
  cashPosition: async (ctx) => {
    const r: any = await aiInternalFetch('/api/xero/get-out/cash-position', {}, ctx)
    return {
      balance: Number(r?.cashOnHand ?? 0),
      creditCard: Number(r?.creditCardBalance ?? 0),
      net: Number(r?.netPosition ?? r?.cashOnHand ?? 0),
      runwayDays: r?.daysOfCash ?? null,
      risk: String(r?.band ?? 'unknown')
    }
  },
  outstanding: async (ctx) => {
    const r: any = await aiInternalFetch('/api/xero/invoices', {}, ctx)
    const overdue: Overdue[] = (r?.overdue ?? []).map((inv: any) => ({
      number: inv?.number ?? inv?.invoiceNumber ?? '—',
      client: inv?.contact ?? 'Unknown',
      amount: Number(inv?.amountDue ?? 0),
      overdueDays: Number(inv?.daysOverdue ?? 0),
    })).sort((a: Overdue, b: Overdue) => b.amount - a.amount)
    const total = Number(r?.outstandingTotal ?? overdue.reduce((s, o) => s + o.amount, 0))
    return { total, top: overdue }
  },
}

/**
 * Render a fetch failure into something the model can act on. The previous
 * blanket `catch` collapsed every cause into one generic sentence, so a 12s
 * timeout on a live Xero org was indistinguishable from "not connected" — the
 * model reported it had no data rather than that the lookup had failed.
 */
export function describeFetchFailure(err: any): string {
  const status = err?.response?.status ?? err?.response?.statusCode ?? err?.statusCode ?? err?.status
  const message = err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? String(err ?? 'unknown error')
  return status ? `${status}: ${message}` : String(message)
}

export async function getFinanceSnapshot(args: Args, ctx: ToolContext, deps: FinanceSnapshotDeps = defaultDeps): Promise<ToolResult> {
  // Settled, not all: a Xero timeout on the cash lookup shouldn't throw away a
  // perfectly good receivables result. Whatever loaded is returned, and
  // whatever didn't is named explicitly so the model can say so.
  const [cashRes, arRes] = await Promise.allSettled([deps.cashPosition(ctx), deps.outstanding(ctx)])

  if (cashRes.status === 'rejected' && arRes.status === 'rejected') {
    return fail(
      `Could not load finance data — the Xero connection may be unavailable. `
      + `Cash position: ${describeFetchFailure(cashRes.reason)}. `
      + `Receivables: ${describeFetchFailure(arRes.reason)}.`
    )
  }

  const unavailable: Array<{ source: string, reason: string }> = []
  if (cashRes.status === 'rejected') {
    unavailable.push({ source: 'cash_position', reason: describeFetchFailure(cashRes.reason) })
  }
  if (arRes.status === 'rejected') {
    unavailable.push({ source: 'receivables', reason: describeFetchFailure(arRes.reason) })
  }

  return ok({
    ...(cashRes.status === 'fulfilled' ? { cash: cashRes.value } : {}),
    ...(arRes.status === 'fulfilled'
      ? {
          receivables: {
            total: arRes.value.total,
            top: arRes.value.top.slice(0, 5),
            more: Math.max(0, arRes.value.top.length - 5)
          }
        }
      : {}),
    ...(unavailable.length ? { unavailable } : {})
  })
}

export const financeTool: AiTool<Args> = {
  name: 'get_finance_snapshot',
  description: 'Get the agency’s current cash position and accounts-receivable summary (total outstanding + top overdue invoices). Use for "what’s our cash runway / who owes us money / how’s cashflow". Cash is returned as three figures: `balance` is liquid cash in bank accounts, `creditCard` is credit-card debt (negative when drawn down), and `net` is the two combined — quote `balance` as the cash position and mention `creditCard` separately rather than leading with `net`. Do NOT use for ad spend (use get_adspend_pacing) or per-client P&L. Returns compact numbers only. If an `unavailable` array is present, those sources failed to load — tell the user that lookup failed and why, and never state or imply the figure cannot be determined when the other fields did return.',
  parameters: params,
  requiredPermission: 'FINANCE',
  handler: (a, c) => getFinanceSnapshot(a, c),
}
