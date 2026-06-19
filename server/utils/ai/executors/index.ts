import type { ActionExecutor } from './types'
import { createTaskExecutor } from './createTask'

/**
 * The action-executor registry, keyed by tool name. The confirm endpoint dispatches a confirmed
 * proposal's `tool_name` through here, so adding a write tool = register one executor (no endpoint
 * change). Today: create_task (Slices 1–2). Phase 2 adds propose_budget_change, etc.
 */
export const executors: Record<string, ActionExecutor> = {
  [createTaskExecutor.toolName]: createTaskExecutor,
}

/** Look up the executor for a proposed action's tool_name; null when unsupported (fail-safe). */
export function getExecutor(toolName: string): ActionExecutor | null {
  return executors[toolName] ?? null
}

export type { ActionExecutor, ExecutorResult } from './types'
