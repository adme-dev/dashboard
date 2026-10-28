import { z } from 'zod'

const money = z.number().finite().min(0).max(9_999_999_999.99).multipleOf(0.01)
export const departmentBudgetListSchema = z.strictObject({
  clientId: z.string().uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  afterId: z.string().uuid().optional(), limit: z.number().int().min(1).max(100).default(50)
})
export const departmentBudgetUpdateSchema = z.strictObject({
  clientId: z.string().uuid(),
  changes: z.array(z.strictObject({
    spendId: z.string().uuid(), expectedBudget: money, budget: money, rolling: z.boolean()
  })).min(1).max(100).refine(rows => new Set(rows.map(row => row.spendId)).size === rows.length, 'Duplicate record'),
  acknowledgement: z.literal('UPDATE_RECORDED_BUDGETS'),
  note: z.string().trim().min(1).max(500)
})
export const departmentBudgetProposalSchema = z.strictObject({ clientId: z.string().uuid(), proposalId: z.string().uuid() })
export const departmentBudgetExecuteSchema = departmentBudgetProposalSchema.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), ack: z.literal(true) })
export const departmentBudgetReviewSchema = departmentBudgetExecuteSchema.extend({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().min(5).max(500) })
