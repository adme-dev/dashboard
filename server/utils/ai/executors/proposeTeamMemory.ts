import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutionServices, ExecutorResult } from './types'
import { upsertMemory } from '../memory/store'
import type { UpsertMemoryInput } from '../memory/types'
import type { MemoryDb } from '../memory/store'

/**
 * Executor for propose_team_memory — on a manager's confirmation, writes the fact into DEPARTMENT-scoped
 * shared memory (scope='department', scope_ref=departmentId, source='explicit'). The confirmer is the
 * curator; MANAGEMENT is re-checked at confirm time. The save is injected for unit-testing.
 */
export type MemorySaver = (input: UpsertMemoryInput, db?: MemoryDb) => Promise<string>

export function makeTeamMemoryExecutor(save: MemorySaver = upsertMemory): ActionExecutor {
  return {
    toolName: 'propose_team_memory',
    label: 'team memory',
    riskTier: 'confirm',
    requiredPermission: 'MANAGEMENT',
    executionClass: 'local-transactional',
    async execute(p: any, ctx: ToolContext, services?: ExecutionServices): Promise<ExecutorResult> {
      const memoryDb: MemoryDb | undefined = services?.db ? {
        queryOne: async <T>(sql: string, params?: unknown[]) => (await services.db!.query(sql, params)).rows[0] as T ?? null,
        queryRows: async <T>(sql: string, params?: unknown[]) => (await services.db!.query(sql, params)).rows as T[],
        execute: async (sql: string, params?: unknown[]) => await services.db!.query(sql, params)
      } : undefined
      const input = {
        userId: ctx.userId,                 // the confirming curator is recorded as the contributor
        memType: p.memType === 'procedural' ? 'procedural' : 'semantic',
        content: p.content,
        scope: 'department',
        scopeRef: p.departmentId,
        source: 'explicit',
        salience: 0.8,                       // curated team knowledge ranks above casual inferred memory
      } satisfies UpsertMemoryInput
      const id = memoryDb ? await save(input, memoryDb) : await save(input)
      return { resultRef: String(id), summary: `✅ Added to ${p.departmentName}'s shared memory: “${p.content}”.` }
    },
  }
}

export const teamMemoryExecutor: ActionExecutor = makeTeamMemoryExecutor()
