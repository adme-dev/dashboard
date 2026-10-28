import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentWorkContracts, DEPARTMENT_WORK_WRITE_NAMES, type DepartmentWorkToolName } from '../marketing/departmentWorkSchemas'

const DESCRIPTIONS: Record<DepartmentWorkToolName, string> = {
  marketing_get_work_options: 'List the boards you can work on, the active client\'s projects and, for one board, its valid statuses and assignable members. Use these exact IDs for task creation, assignment and status changes. Stored data only.',
  marketing_list_work_tasks: 'List an active client\'s tasks (linked through the client\'s projects) on boards you can access, with status, assignee, dates, blocker and current version. Open tasks by default; cursor paginated. Cost, rate and quote fields are excluded.',
  marketing_list_work_briefs: 'List an active client\'s briefs with status, priority, assignee, deadline and conversion links. Budgets and submitter contact details are excluded. Shows which status transitions this connector supports.',
  marketing_create_work_task: 'Create one task on a client project and a board you can access, after explicit acknowledgement. Optional status (board-valid), board-member assignee, linked client brief and dates. Records the creation activity and sends the usual assignment notification; no billing fields.',
  marketing_update_work_task: 'Edit a client task\'s title, description, priority, dates or blocker after acknowledgement. Requires the task version you read; a changed task is rejected. Logs each field change and runs the board\'s normal update automations.',
  marketing_assign_work_task: 'Assign, reassign or unassign a client task after acknowledgement. The assignee must be an active member of the task\'s board and the task version must match what you read. Sends the normal assignee notification.',
  marketing_set_work_task_status: 'Move a client task to another status valid for its board after acknowledgement, with the task version you read. Runs the same board events, automations, lifecycle checks and watcher notifications as the board view.',
  marketing_assign_work_brief: 'Assign a client brief to an active team member (a member of the brief\'s board when it has one) after acknowledgement. The current assignee must match what you read. Adds the assignee as a watcher and notifies them.',
  marketing_set_work_brief_status: 'Move a client brief through supported working states (submitted→under review or needs info, under review→needs info, approved→in progress, in progress→completed) with a note. Approval, rejection and cancellation remain application decisions because they convert projects and quotes.'
}

export const departmentWorkTools: AiTool<unknown>[] = (Object.keys(departmentWorkContracts) as DepartmentWorkToolName[]).map((name) => {
  const mutates = (DEPARTMENT_WORK_WRITE_NAMES as readonly string[]).includes(name)
  return {
    name,
    description: DESCRIPTIONS[name],
    parameters: departmentWorkContracts[name] as AiTool<unknown>['parameters'],
    mutates,
    requiredPermission: 'MARKETING_MANAGEMENT',
    returnsUntrusted: true,
    handler: async (args: unknown, ctx: ToolContext) => mutates
      ? fail('Use the department MCP execution coordinator', 'coordinator_required')
      : executeDepartmentWorkTool(name, args, ctx)
  }
})

export async function executeDepartmentWorkTool(
  name: string, args: unknown, ctx: ToolContext, key?: string, digest?: string
): Promise<ToolResult> {
  if (!departmentWorkTools.some(tool => tool.name === name)) return fail('Unknown department work operation', 'not_found')
  // Dynamic import keeps policy/registry metadata free of executable service dependencies.
  const { runDepartmentWorkOperation } = await import('../marketing/departmentWorkOperations')
  return runDepartmentWorkOperation(name, args, ctx, key, digest)
}
