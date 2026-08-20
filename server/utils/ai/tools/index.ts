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
import { proposeSetCampaignBudgetTool, proposeBulkSetCampaignBudgetsTool } from './proposeSetCampaignBudget'
import { knowledgeArticleTool } from './proposeKnowledgeArticle'
import { rememberTool } from './remember'
import { assignTaskTool, statusChangeTool, briefConvertTool } from './deliveryActions'
import { capacityTool } from './capacity'
import { opportunityTool, logActivityTool, quoteTool, draftFollowupTool } from './crmActions'
import { expenseApprovalTool, eomGenerateTool, expenseClassifyTool } from './financeActions'
import { creativeQueueTool, proofStatusTool } from './creativeActions'
import { teamMemoryTool } from './proposeTeamMemory'
import { checkPacingTool } from './checkPacing'
import { checkBriefCompletenessTool } from './checkBriefCompleteness'
import { searchCrmTool } from './searchCrm'
import { crmPipelineTool } from './crmPipeline'
import { leadsTool } from './leads'
import { socialListeningTool } from './socialListening'
import { socialInboxTool } from './socialInbox'
import { emailCampaignsTool } from './emailCampaigns'
import { socialNewsRecommendationsTool } from './socialNewsRecommendations'
import { capabilitiesTool } from './capabilities'
import { actionLogTool } from './actionLogTool'
import { creativeAssetsTool } from './creativeAssetsTool'
import { adBreakdownTool } from './adBreakdown'
import { modelCapabilitiesTool } from './modelCapabilities'

// CRM tools share the same fresh CLIENTS-gated context boundary. Keep them as
// one registry slice so a newly registered CRM action cannot silently omit it.
const crmTools = [opportunityTool, logActivityTool, quoteTool, draftFollowupTool]
if (crmTools.some(tool => tool.requiredPermission !== 'CLIENTS')) {
  throw new Error('Registered CRM AI tools must require CLIENTS')
}

/** The assembled tool registry — read tools + create_task + remember (personal memory capture). */
export const registry: AiTool<any>[] = [
  capabilitiesTool,
  actionLogTool,
  creativeAssetsTool,
  adBreakdownTool,
  modelCapabilitiesTool,
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
  proposeSetCampaignBudgetTool,
  proposeBulkSetCampaignBudgetsTool,
  knowledgeArticleTool,
  rememberTool,
  // Delivery writes (Account Manager / Producer) + capacity read.
  assignTaskTool,
  statusChangeTool,
  briefConvertTool,
  capacityTool,
  // Sales / CRM writes + draft.
  ...crmTools,
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
  // Ops Autopilot: C5 brief-completeness gatekeeper read tool.
  checkBriefCompletenessTool,
  // Sub-project 1 — broadened read coverage (auto-projects to MCP + in-app chat).
  searchCrmTool,
  crmPipelineTool,
  leadsTool,
  socialListeningTool,
  socialInboxTool,
  emailCampaignsTool,
  socialNewsRecommendationsTool,
]
