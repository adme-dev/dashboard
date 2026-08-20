import type { ActionExecutor } from './types'
import { createTaskExecutor } from './createTask'
import { scheduleSocialPostExecutor } from './scheduleSocialPost'
import { budgetAlertExecutor } from './proposeBudgetAlert'
import { budgetChangeExecutor } from './proposeBudgetChange'
import { setCampaignBudgetExecutor, bulkSetCampaignBudgetsExecutor } from './setCampaignBudget'
import { knowledgeArticleExecutor } from './proposeKnowledgeArticle'
import { assignTaskExecutor, statusChangeExecutor, briefConvertExecutor } from './deliveryActions'
import { opportunityExecutor, logActivityExecutor, quoteExecutor } from './crmActions'
import { expenseApprovalExecutor, eomGenerateExecutor, expenseClassifyExecutor } from './financeActions'
import { proofStatusExecutor } from './creativeActions'
import { teamMemoryExecutor } from './proposeTeamMemory'
import { createSocialCaseTaskExecutor, linkSocialConversationTaskExecutor } from './socialInboxActions'

/**
 * The action-executor registry, keyed by tool name. The confirm endpoint dispatches a confirmed
 * proposal's `tool_name` through here, so adding a write tool = register one executor (no endpoint
 * change). Covers the per-department write packs (PRD §7) as they land.
 */
export const executors: Record<string, ActionExecutor> = {
  [createTaskExecutor.toolName]: createTaskExecutor,
  [scheduleSocialPostExecutor.toolName]: scheduleSocialPostExecutor,
  [budgetAlertExecutor.toolName]: budgetAlertExecutor,
  [budgetChangeExecutor.toolName]: budgetChangeExecutor,
  [setCampaignBudgetExecutor.toolName]: setCampaignBudgetExecutor,
  [bulkSetCampaignBudgetsExecutor.toolName]: bulkSetCampaignBudgetsExecutor,
  [knowledgeArticleExecutor.toolName]: knowledgeArticleExecutor,
  [assignTaskExecutor.toolName]: assignTaskExecutor,
  [statusChangeExecutor.toolName]: statusChangeExecutor,
  [briefConvertExecutor.toolName]: briefConvertExecutor,
  [opportunityExecutor.toolName]: opportunityExecutor,
  [logActivityExecutor.toolName]: logActivityExecutor,
  [quoteExecutor.toolName]: quoteExecutor,
  [expenseApprovalExecutor.toolName]: expenseApprovalExecutor,
  [eomGenerateExecutor.toolName]: eomGenerateExecutor,
  [expenseClassifyExecutor.toolName]: expenseClassifyExecutor,
  [proofStatusExecutor.toolName]: proofStatusExecutor,
  [teamMemoryExecutor.toolName]: teamMemoryExecutor,
  [linkSocialConversationTaskExecutor.toolName]: linkSocialConversationTaskExecutor,
  [createSocialCaseTaskExecutor.toolName]: createSocialCaseTaskExecutor,
}

/** Look up the executor for a proposed action's tool_name; null when unsupported (fail-safe). */
export function getExecutor(toolName: string): ActionExecutor | null {
  return executors[toolName] ?? null
}
