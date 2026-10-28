import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentBudgetListSchema, departmentBudgetUpdateSchema, departmentBudgetProposalSchema, departmentBudgetExecuteSchema, departmentBudgetReviewSchema } from '../marketing/departmentBudgetSchemas'

export const departmentBudgetTools: AiTool<unknown>[] = [
  { name: 'marketing_propose_budget_allocations', description: 'Prepare exact recorded budget changes for independent review. Include current amounts and explicit acknowledgement; all records must belong to one active client. No allocation is changed yet.', parameters: departmentBudgetUpdateSchema, mutates: true, handler: async () => fail('Use the department coordinator', 'forbidden') },
  { name: 'marketing_get_budget_proposal', description: 'Inspect an allocation proposal, exact revision, approval and durable result for an active client.', parameters: departmentBudgetProposalSchema, handler: async (args, ctx) => (await import('../marketing/departmentBudgetReview')).executeDepartmentBudgetProposal('marketing_get_budget_proposal', args, ctx, '', '') },
  { name: 'marketing_review_budget_allocations', description: 'Independently approve or reject an exact allocation proposal. The requester cannot review their own work.', parameters: departmentBudgetReviewSchema, mutates: true, handler: async () => fail('Use the department coordinator', 'forbidden') },
  { name: 'marketing_list_budget_allocations', description: 'Read recorded client media budget allocations and actual spend for a month, with cursor pagination. Use these record IDs and current amounts for an exact allocation update. Stored data only; agency commissions and accounting are excluded.', parameters: departmentBudgetListSchema, handler: async (args, ctx) => (await import('../marketing/departmentBudgetOperations')).listDepartmentBudgetAllocations(args, ctx) },
  { name: 'marketing_set_budget_allocations', description: 'Apply an exact independently approved allocation proposal. Revalidates both reviewers and current budgets, then commits budgets, audit and receipt atomically. Does not change provider budgets.', parameters: departmentBudgetExecuteSchema, mutates: true, handler: async () => fail('Use the department MCP execution coordinator', 'forbidden') }
]
export async function executeDepartmentBudgetTool(name: string, args: unknown, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  if (name === 'marketing_list_budget_allocations') return (await import('../marketing/departmentBudgetOperations')).listDepartmentBudgetAllocations(args, ctx)
  return (await import('../marketing/departmentBudgetReview')).executeDepartmentBudgetProposal(name, args, ctx, key, digest)
}
