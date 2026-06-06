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
import { createTaskTool } from './createTask'

/** The assembled tool registry — 9 read tools + 1 write tool (create_task), Slice 1. */
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
  createTaskTool,
]
