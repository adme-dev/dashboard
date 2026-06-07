import type { AiTool } from '../toolRegistry'
import { financeTool } from './finance'
import { adspendTool } from './adspend'
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

/** The assembled tool registry — 13 read tools + 1 write tool (create_task), Slices 1–2. */
export const registry: AiTool<any>[] = [
  financeTool,
  adspendTool,
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
]
