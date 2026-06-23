import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'
import { pickByExactName, type NamedRef } from './createTask'

/**
 * Finance write tools (PRD §7 Finance): approve/reject an expense, and generate an end-of-month invoice
 * run. Both Option B (propose→confirm→audit). EOM generation is the highest-risk action in the agency
 * (it assigns invoice numbers + pulls spend), so it is `rich_confirm` + ADMIN-gated and demands an
 * explicit acknowledgement at confirm time.
 */

const ilike = (name: string) => `%${escapeLike(name)}%`

type ExpenseRef = NamedRef & { amount?: number, status?: string }

export type FinanceDeps = {
  // Pending-approval expenses the caller can act on (their OWN expenses are excluded — you can't approve your own).
  resolveExpense: (needle: string, userId: string) => Promise<ExpenseRef[]>
  // Draft/rejected expenses (the only ones the edit endpoint can re-classify).
  resolveDraftExpense: (needle: string) => Promise<ExpenseRef[]>
  resolveCategory: (name: string) => Promise<NamedRef[]>
  resolveClient: (name: string) => Promise<NamedRef[]>
  propose: (ctx: ToolContext, toolName: string, payload: unknown) => Promise<string>
}

const defaultDeps: FinanceDeps = {
  resolveExpense: (needle, userId) =>
    queryRows<ExpenseRef>(
      `SELECT id, COALESCE(NULLIF(merchant,''), NULLIF(description,''), 'expense') AS name, amount, status
         FROM expenses
        WHERE status IN ('submitted','pending_approval')
          AND user_id <> $2
          AND (merchant ILIKE $1 OR description ILIKE $1)
        ORDER BY expense_date DESC NULLS LAST LIMIT 6`,
      [ilike(needle), userId]),
  resolveDraftExpense: (needle) =>
    queryRows<ExpenseRef>(
      `SELECT id, COALESCE(NULLIF(merchant,''), NULLIF(description,''), 'expense') AS name, amount, status
         FROM expenses
        WHERE status IN ('draft','rejected')
          AND (merchant ILIKE $1 OR description ILIKE $1)
        ORDER BY expense_date DESC NULLS LAST LIMIT 6`,
      [ilike(needle)]),
  resolveCategory: (name) =>
    queryRows<NamedRef>(`SELECT id, name FROM expense_categories WHERE name ILIKE $1 ORDER BY (lower(name)=lower($2)) DESC, name LIMIT 6`, [ilike(name), name]),
  resolveClient: (name) =>
    queryRows<NamedRef>(`SELECT id, name FROM agency_clients WHERE name ILIKE $1 AND is_active = true ORDER BY (lower(name)=lower($2)) DESC, name LIMIT 6`, [ilike(name), name]),
  propose: (ctx, toolName, payload) => proposeAction(ctx, ctx.conversationId ?? null, toolName, payload),
}

// ---------- propose_expense_approval ----------
const approvalParams = z.object({
  expense: z.string(),                                   // merchant/description text to find the pending expense
  action: z.enum(['approve', 'reject']).default('approve'),
  reason: z.string().optional(),                         // required for reject (endpoint enforces too)
})
type ApprovalArgs = z.infer<typeof approvalParams>

export async function proposeExpenseApproval(args: ApprovalArgs, ctx: ToolContext, deps: FinanceDeps = defaultDeps): Promise<ToolResult> {
  if (!roleHasPermission(ctx.userRole, 'FINANCE')) return fail('You do not have permission to approve expenses.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare this action outside a conversation.')
  if (args.action === 'reject' && !args.reason?.trim()) return fail('A reason is required to reject an expense.')

  const matches = pickByExactName(await deps.resolveExpense(args.expense, ctx.userId), args.expense)
  if (matches.length === 0) return fail(`No pending expense matching "${args.expense}" that you can approve.`)
  if (matches.length > 1) return ok({ disambiguation: { field: 'expense', options: matches } })
  const exp = matches[0]!

  const resolved = { expenseId: exp.id, label: exp.name, amount: exp.amount ?? null, action: args.action, reason: args.reason?.trim() || null }
  return ok({ proposalId: await deps.propose(ctx, 'propose_expense_approval', resolved), resolved })
}

export const expenseApprovalTool: AiTool<ApprovalArgs> = {
  name: 'propose_expense_approval',
  description: 'PROPOSE approving or rejecting a pending expense. Does NOT change anything — prepares a proposal the '
    + 'user confirms. Give text matching the expense (merchant/description) and the action; a reason is required to '
    + 'reject. You cannot approve your own expense. If the result has a `disambiguation`, ask the user to pick. '
    + 'Only say it\'s ready when there is a `proposalId`.',
  parameters: approvalParams,
  mutates: true,
  requiredPermission: 'FINANCE',
  handler: (a, c) => proposeExpenseApproval(a, c),
}

// ---------- propose_eom_generate (rich_confirm) ----------
const eomParams = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
})
type EomArgs = z.infer<typeof eomParams>

export async function proposeEomGenerate(args: EomArgs, ctx: ToolContext, deps: FinanceDeps = defaultDeps): Promise<ToolResult> {
  if (!roleHasPermission(ctx.userRole, 'ADMIN')) return fail('You do not have permission to generate an EOM invoice run.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare this action outside a conversation.')
  const resolved = { month: args.month, year: args.year }
  return ok({ proposalId: await deps.propose(ctx, 'propose_eom_generate', resolved), resolved })
}

export const eomGenerateTool: AiTool<EomArgs> = {
  name: 'propose_eom_generate',
  description: 'PROPOSE generating the end-of-month (EOM) invoice run for a month/year. This is HIGH-RISK — it pulls '
    + 'jobs + ad spend and assigns invoice numbers (a draft run; it does NOT push to Xero). Does NOT generate anything '
    + 'until the user explicitly confirms a rich confirmation card. Give the month (1–12) and year. Owner/admin only.',
  parameters: eomParams,
  mutates: true,
  riskTier: 'rich_confirm',
  requiredPermission: 'ADMIN',
  handler: (a, c) => proposeEomGenerate(a, c),
}

// ---------- propose_expense_classify (Bookkeeper, PRD §7) ----------
const classifyParams = z.object({
  expense: z.string(),                 // merchant/description text to find a DRAFT/REJECTED expense
  categoryName: z.string().optional(), // the expense category to set
  clientName: z.string().optional(),   // optionally match the expense to a client
})
type ClassifyArgs = z.infer<typeof classifyParams>

export async function proposeExpenseClassify(args: ClassifyArgs, ctx: ToolContext, deps: FinanceDeps = defaultDeps): Promise<ToolResult> {
  if (!roleHasPermission(ctx.userRole, 'FINANCE')) return fail('You do not have permission to classify expenses.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare this action outside a conversation.')
  if (!args.categoryName && !args.clientName) return fail('Specify a category and/or a client to classify the expense.')

  const matches = pickByExactName(await deps.resolveDraftExpense(args.expense), args.expense)
  if (matches.length === 0) return fail(`No draft/rejected expense matching "${args.expense}" (only un-submitted expenses can be re-classified).`)
  if (matches.length > 1) return ok({ disambiguation: { field: 'expense', options: matches } })
  const exp = matches[0]!

  let category: NamedRef | null = null
  if (args.categoryName) {
    const c = pickByExactName(await deps.resolveCategory(args.categoryName), args.categoryName)
    if (c.length === 0) return fail(`No expense category matching "${args.categoryName}".`)
    if (c.length > 1) return ok({ disambiguation: { field: 'categoryName', options: c } })
    category = c[0]!
  }
  let client: NamedRef | null = null
  if (args.clientName) {
    const cl = pickByExactName(await deps.resolveClient(args.clientName), args.clientName)
    if (cl.length === 0) return fail(`No client matching "${args.clientName}".`)
    if (cl.length > 1) return ok({ disambiguation: { field: 'clientName', options: cl } })
    client = cl[0]!
  }

  const resolved = {
    expenseId: exp.id, label: exp.name,
    categoryId: category?.id ?? null, categoryName: category?.name ?? null,
    clientId: client?.id ?? null, clientName: client?.name ?? null,
  }
  return ok({ proposalId: await deps.propose(ctx, 'propose_expense_classify', resolved), resolved })
}

export const expenseClassifyTool: AiTool<ClassifyArgs> = {
  name: 'propose_expense_classify',
  description: 'PROPOSE categorising a draft/un-submitted expense — set its category and/or match it to a client. '
    + 'Does NOT change anything — prepares a proposal the user confirms. Give text matching the expense plus a category '
    + 'and/or client. Only draft/rejected expenses can be re-classified. If the result has a `disambiguation`, ask the '
    + 'user to pick. Only say it\'s ready when there is a `proposalId`.',
  parameters: classifyParams,
  mutates: true,
  requiredPermission: 'FINANCE',
  handler: (a, c) => proposeExpenseClassify(a, c),
}
