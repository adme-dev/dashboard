import { z } from 'zod'
// Internal calls use Nitro's auto-imported global $fetch (NOT raw ofetch): it resolves relative
// internal routes (e.g. '/api/xero/...') on the Cloudflare runtime. Raw ofetch has no origin base
// and throws on a relative URL — see confirm-action.post.ts (#129).
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'

const params = z.object({})
type Args = z.infer<typeof params>

type CashPosition = { balance: number, runwayDays: number | null, risk: string }
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
    const r: any = await $fetch('/api/xero/get-out/cash-position', { headers: ctx.event.headers as any })
    return { balance: Number(r?.cashOnHand ?? 0), runwayDays: r?.daysOfCash ?? null, risk: String(r?.band ?? 'unknown') }
  },
  outstanding: async (ctx) => {
    const r: any = await $fetch('/api/xero/invoices', { headers: ctx.event.headers as any })
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

export async function getFinanceSnapshot(args: Args, ctx: ToolContext, deps: FinanceSnapshotDeps = defaultDeps): Promise<ToolResult> {
  try {
    const [cash, receivables] = await Promise.all([deps.cashPosition(ctx), deps.outstanding(ctx)])
    return ok({
      cash,
      receivables: {
        total: receivables.total,
        top: receivables.top.slice(0, 5),
        more: Math.max(0, receivables.top.length - 5),
      },
    })
  } catch {
    return fail('Could not load finance data — the Xero connection may be unavailable.')
  }
}

export const financeTool: AiTool<Args> = {
  name: 'get_finance_snapshot',
  description: 'Get the agency’s current cash position (bank balance, runway in days, risk band) and accounts-receivable summary (total outstanding + top overdue invoices). Use for "what’s our cash runway / who owes us money / how’s cashflow". Do NOT use for ad spend (use get_adspend_pacing) or per-client P&L. Returns compact numbers only.',
  parameters: params,
  requiredPermission: 'FINANCE',
  handler: (a, c) => getFinanceSnapshot(a, c),
}
