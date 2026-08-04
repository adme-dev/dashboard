import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * Executors for the Finance write tools. Run the real mutation on a confirmed proposal via the existing
 * endpoints, forwarding the caller's headers. EOM generation is rich_confirm + ADMIN — the confirm
 * endpoint demands richConfirmAck and re-checks ADMIN before this runs. POST injected for unit-testing.
 */

export type Poster = (url: string, body: any, ctx: ToolContext) => Promise<any>
const internalFetch = (<T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => (globalThis as any).$fetch(request, options) as Promise<T>) as <T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => Promise<T>
const defaultPost: Poster = (url, body, ctx) => internalFetch(url, { method: 'POST', body, headers: ctx.event.headers as any })

export function makeExpenseApprovalExecutor(post: Poster = defaultPost): ActionExecutor {
  return {
    toolName: 'propose_expense_approval',
    label: 'expense approval',
    riskTier: 'confirm',
    requiredPermission: 'FINANCE',
    executionClass: 'internal-http',
    async execute(p: any, ctx: ToolContext): Promise<ExecutorResult> {
      const r = await post(`/api/agency/expenses/${p.expenseId}/approve`, { action: p.action, reason: p.reason ?? undefined }, ctx)
      const id = r?.expense?.id ?? p.expenseId
      const verb = p.action === 'approve' ? 'Approved' : 'Rejected'
      return { resultRef: String(id), summary: `✅ ${verb} the expense “${p.label}”.` }
    },
  }
}

export function makeEomGenerateExecutor(post: Poster = defaultPost): ActionExecutor {
  return {
    toolName: 'propose_eom_generate',
    label: 'EOM run',
    riskTier: 'rich_confirm',
    requiredPermission: 'ADMIN',
    executionClass: 'internal-http',
    async execute(p: any, ctx: ToolContext): Promise<ExecutorResult> {
      const r = await post('/api/agency/eom/generate', { month: p.month, year: p.year }, ctx)
      const id = r?.id
      if (!id) throw new Error('EOM generate returned no run id')
      const n = typeof r?.invoice_count === 'number' ? r.invoice_count : null
      return { resultRef: String(id), summary: `✅ Generated the EOM run for ${p.month}/${p.year}${n != null ? ` — ${n} invoice${n === 1 ? '' : 's'}` : ''} (draft, not pushed to Xero).` }
    },
  }
}

export type Putter = (url: string, body: any, ctx: ToolContext) => Promise<any>
const defaultPut: Putter = (url, body, ctx) => internalFetch(url, { method: 'PUT', body, headers: ctx.event.headers as any })

export function makeExpenseClassifyExecutor(put: Putter = defaultPut): ActionExecutor {
  return {
    toolName: 'propose_expense_classify',
    label: 'expense classification',
    riskTier: 'confirm',
    requiredPermission: 'FINANCE',
    executionClass: 'internal-http',
    async execute(p: any, ctx: ToolContext): Promise<ExecutorResult> {
      const body: any = {}
      if (p.categoryId) body.categoryId = p.categoryId
      if (p.clientId) body.clientId = p.clientId
      const r = await put(`/api/agency/expenses/${p.expenseId}`, body, ctx)
      const id = r?.expense?.id ?? p.expenseId
      const bits = [p.categoryName && `category “${p.categoryName}”`, p.clientName && `client ${p.clientName}`].filter(Boolean).join(' and ')
      return { resultRef: String(id), summary: `✅ Classified the expense “${p.label}”${bits ? ` — ${bits}` : ''}.` }
    },
  }
}

export const expenseApprovalExecutor: ActionExecutor = makeExpenseApprovalExecutor()
export const eomGenerateExecutor: ActionExecutor = makeEomGenerateExecutor()
export const expenseClassifyExecutor: ActionExecutor = makeExpenseClassifyExecutor()
