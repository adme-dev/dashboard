import type { AiTool } from '../toolRegistry'
import { financeTool } from './finance'
import { adspendTool } from './adspend'
import { campaignBreakdownTool } from './campaignBreakdown'
import { budgetHealthTool } from './budgetHealth'
import { tasksTool } from './tasks'
import { projectsTool } from './projects'
import { anomaliesTool } from './anomalies'
import { clientOverviewTool } from './clients'
import { knowledgeTool } from './knowledge'
import { socialTool } from './social'
import { briefsTool } from './briefs'
import { profitabilityTool } from './profitability'
import { retainerBurnTool } from './retainerBurn'
import { overServicingTool } from './overServicing'
import { revenueForecastTool } from './revenueForecast'
import { createTaskTool } from './createTask'
import { scheduleSocialPostTool } from './scheduleSocialPost'
import { budgetAlertTool } from './proposeBudgetAlert'
import { proposeBudgetChangeTool } from './proposeBudgetChange'
import { knowledgeArticleTool } from './proposeKnowledgeArticle'
import { rememberTool } from './remember'
import { assignTaskTool, statusChangeTool, briefConvertTool } from './deliveryActions'
import { capacityTool } from './capacity'
import { opportunityTool, logActivityTool, quoteTool, draftFollowupTool } from './crmActions'
import { expenseApprovalTool, eomGenerateTool, expenseClassifyTool } from './financeActions'
import { creativeQueueTool, proofStatusTool } from './creativeActions'
import { teamMemoryTool } from './proposeTeamMemory'
import { checkPacingTool } from './checkPacing'

/** The assembled tool registry — read tools + create_task + remember (personal memory capture). */
export const registry: AiTool<any>[] = [
  financeTool,
  adspendTool,
  campaignBreakdownTool,
  budgetHealthTool,
  tasksTool,
  projectsTool,
  anomaliesTool,
  clientOverviewTool,
  knowledgeTool,
  socialTool,
  briefsTool,
  profitabilityTool,
  retainerBurnTool,
  overServicingTool,
  revenueForecastTool,
  createTaskTool,
  scheduleSocialPostTool,
  budgetAlertTool,
  proposeBudgetChangeTool,
  knowledgeArticleTool,
  rememberTool,
  // Delivery writes (Account Manager / Producer) + capacity read.
  assignTaskTool,
  statusChangeTool,
  briefConvertTool,
  capacityTool,
  // Sales / CRM writes + draft.
  opportunityTool,
  logActivityTool,
  quoteTool,
  draftFollowupTool,
  // Finance / Bookkeeper writes.
  expenseApprovalTool,
  eomGenerateTool,
  expenseClassifyTool,
  // Creative: queue read + proof-status write.
  creativeQueueTool,
  proofStatusTool,
  // Cross-cutting: promote a fact to department-shared memory (MANAGEMENT-gated curation).
  teamMemoryTool,
  // Ops Autopilot: pacing watchdog read tool.
  checkPacingTool,
]
