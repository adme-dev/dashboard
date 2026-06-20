import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutorResult } from './types'
import { upsertMemory } from '../memory/store'
import type { UpsertMemoryInput } from '../memory/types'

/**
 * Executor for propose_team_memory — on a manager's confirmation, writes the fact into DEPARTMENT-scoped
 * shared memory (scope='department', scope_ref=departmentId, source='explicit'). The confirmer is the
 * curator; MANAGEMENT is re-checked at confirm time. The save is injected for unit-testing.
 */
export type MemorySaver = (input: UpsertMemoryInput) => Promise<string>

export function makeTeamMemoryExecutor(save: MemorySaver = upsertMemory): ActionExecutor {
  return {
    toolName: 'propose_team_memory',
    label: 'team memory',
    riskTier: 'confirm',
    requiredPermission: 'MANAGEMENT',
    async execute(p: any, ctx: ToolContext): Promise<ExecutorResult> {
      const id = await save({
        userId: ctx.userId,                 // the confirming curator is recorded as the contributor
        memType: p.memType === 'procedural' ? 'procedural' : 'semantic',
        content: p.content,
        scope: 'department',
        scopeRef: p.departmentId,
        source: 'explicit',
        salience: 0.8,                       // curated team knowledge ranks above casual inferred memory
      })
      return { resultRef: String(id), summary: `✅ Added to ${p.departmentName}'s shared memory: “${p.content}”.` }
    },
  }
}

export const teamMemoryExecutor: ActionExecutor = makeTeamMemoryExecutor()
