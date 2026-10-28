import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentCreativeContracts, DEPARTMENT_CREATIVE_WRITE_NAMES, type DepartmentCreativeToolName } from '../marketing/departmentCreativeSchemas'

const DESCRIPTIONS: Record<DepartmentCreativeToolName, string> = {
  marketing_list_banner_projects: 'List an active client\'s Banner Studio projects with status, review status, renderable formats, revision and protection. Stored data only; no canvas payloads.',
  marketing_get_banner_project: 'Read one client Banner Studio project: full canvas, revision, renderable formats, protection, recent versions, render jobs and exports. Use the revision for update, copy and export.',
  marketing_list_banner_templates: 'List agency Banner Studio templates (name, category, formats, tags, usage). Use a templateId with marketing_create_banner_project to start a client draft.',
  marketing_list_banner_assets: 'List the active client\'s uploaded Banner Studio assets (name, type, size, URL). Personal and other clients\' assets are never included.',
  marketing_preview_banner_project: 'Build one artboard with the native Banner Studio HTML builder and render linter. Returns dimensions, lint findings, renderability and (when small) the HTML. No render, upload or record is created.',
  marketing_get_banner_render_status: 'Check the status of render jobs for one client project. Unknown or foreign job IDs are reported as unknown, never as zero or done.',
  marketing_create_banner_project: 'Create a client draft from a blank 300x250 headline, an agency template or a copy of the exact revision of one of the same client\'s projects, after acknowledgement. Copies never inherit import provenance. Nothing is rendered or published.',
  marketing_update_banner_project: 'Change a client draft\'s name, canvas or tags after acknowledgement, binding the exact revision you read. The previous canvas is snapshotted as a version. Imported, in-review and approved artwork is protected and refused.',
  marketing_export_banner_render: 'Queue a native MP4 render of one artboard at the exact revision you read, after acknowledgement. An unconfirmed queue submission is held for reconciliation and must not be retried blindly.'
}

export const departmentCreativeTools: AiTool<unknown>[] = (Object.keys(departmentCreativeContracts) as DepartmentCreativeToolName[]).map((name) => {
  const mutates = (DEPARTMENT_CREATIVE_WRITE_NAMES as readonly string[]).includes(name)
  return {
    name,
    description: DESCRIPTIONS[name],
    parameters: departmentCreativeContracts[name] as AiTool<unknown>['parameters'],
    mutates,
    ...(name === 'marketing_export_banner_render' ? { riskTier: 'rich_confirm' as const } : {}),
    requiredPermission: 'MARKETING_MANAGEMENT',
    returnsUntrusted: true,
    handler: async (args: unknown, ctx: ToolContext) => mutates
      ? fail('Use the department MCP execution coordinator', 'coordinator_required')
      : executeDepartmentCreativeTool(name, args, ctx)
  }
})

export async function executeDepartmentCreativeTool(
  name: string, args: unknown, ctx: ToolContext, key?: string, digest?: string
): Promise<ToolResult> {
  if (!departmentCreativeTools.some(tool => tool.name === name)) return fail('Unknown department creative operation', 'not_found')
  // Dynamic import keeps policy/registry metadata free of executable service dependencies.
  const { runDepartmentCreativeOperation } = await import('../marketing/departmentCreativeOperations')
  return runDepartmentCreativeOperation(name, args, ctx, key, digest)
}
