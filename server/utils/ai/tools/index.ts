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
import { rememberTool } from './remember'

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
  rememberTool,
]
