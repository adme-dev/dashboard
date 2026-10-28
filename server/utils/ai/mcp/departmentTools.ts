import { departmentLeadTools, executeDepartmentLeadTool } from './departmentLeadTools'
import { departmentCreativeTools, executeDepartmentCreativeTool } from './departmentCreativeTools'
import { departmentWebsiteTools, executeDepartmentWebsiteTool } from './departmentWebsiteTools'
import { departmentEmailTools, executeDepartmentEmailTool } from './departmentEmailTools'
import { departmentInboxTools, executeDepartmentInboxTool } from './departmentInboxTools'
import { DEPARTMENT_LEAD_READ_NAMES, DEPARTMENT_LEAD_WRITE_NAMES, DEPARTMENT_CREATIVE_READ_NAMES, DEPARTMENT_CREATIVE_WRITE_NAMES, DEPARTMENT_WEBSITE_READ_NAMES, DEPARTMENT_WEBSITE_WRITE_NAMES, DEPARTMENT_EMAIL_READ_NAMES, DEPARTMENT_EMAIL_WRITE_NAMES, DEPARTMENT_INBOX_READ_NAMES, DEPARTMENT_INBOX_WRITE_NAMES, DEPARTMENT_CONTENT_READ_NAMES, DEPARTMENT_CONTENT_WRITE_NAMES, DEPARTMENT_WORK_READ_NAMES, DEPARTMENT_WORK_WRITE_NAMES, DEPARTMENT_UTILITY_READ_NAMES, DEPARTMENT_UTILITY_WRITE_NAMES, DEPARTMENT_CATALOG_READ_NAMES, DEPARTMENT_CATALOG_WRITE_NAMES, DEPARTMENT_CAMPAIGN_READ_NAMES, DEPARTMENT_CAMPAIGN_WRITE_NAMES, DEPARTMENT_BUDGET_READ_NAMES, DEPARTMENT_BUDGET_WRITE_NAMES, DEPARTMENT_FEED_READ_NAMES, DEPARTMENT_FEED_WRITE_NAMES, DEPARTMENT_REVIEW_READ_NAMES, DEPARTMENT_REVIEW_WRITE_NAMES, isDepartmentTool, isDepartmentWriteTool } from './departmentToolNames'
import { departmentContentTools, executeDepartmentContentTool } from './departmentContentTools'
import { departmentWorkTools, executeDepartmentWorkTool } from './departmentWorkTools'
import { departmentUtilityTools, executeDepartmentUtilityTool } from './departmentUtilityTools'
import { departmentCatalogTools, executeDepartmentCatalogTool } from './departmentCatalogTools'
import { departmentCampaignTools, executeDepartmentCampaignTool } from './departmentCampaignTools'
import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import { departmentReadTools } from './departmentReadTools'
import { departmentBudgetTools, executeDepartmentBudgetTool } from './departmentBudgetTools'
import { departmentFeedTools, executeDepartmentFeedTool } from './departmentFeedTools'
import { departmentReviewTools, executeDepartmentReviewTool } from './departmentReviewTools'
import { toMcpToolManifest, type McpProjectionContext, type McpExecutionDescriptor, type McpSuiteFlags } from './project'

export const departmentTools: AiTool<unknown>[] = [...departmentLeadTools, ...departmentCreativeTools, ...departmentWebsiteTools, ...departmentEmailTools, ...departmentInboxTools, ...departmentContentTools, ...departmentWorkTools, ...departmentUtilityTools, ...departmentCatalogTools, ...departmentCampaignTools, ...departmentReadTools, ...departmentBudgetTools, ...departmentFeedTools, ...departmentReviewTools]

function enabled(name: string, flags: McpSuiteFlags): boolean {
  if ([...DEPARTMENT_CREATIVE_READ_NAMES, ...DEPARTMENT_CREATIVE_WRITE_NAMES].some(n => n === name) && !flags.banners) return false
  if (isDepartmentWriteTool(name) && !flags.writes) return false
  if ([...DEPARTMENT_FEED_READ_NAMES, ...DEPARTMENT_FEED_WRITE_NAMES].some(n => n === name) && !flags.feeds) return false
  if ((name.includes('google_ads') || name.includes('pmax')) && !(isDepartmentWriteTool(name) ? flags.googleAdsWrite : flags.googleAdsRead)) return false
  if ([...DEPARTMENT_CATALOG_READ_NAMES, ...DEPARTMENT_CATALOG_WRITE_NAMES].includes(name) && !flags.feeds) return false
  if (name.includes('_meta_ad_launch') && !flags.banners) return false
  return true
}
const toolsFor = (flags: McpSuiteFlags, tools = departmentTools) => tools.filter(tool => isDepartmentTool(tool.name) && enabled(tool.name, flags))

/** Descriptors advertise typed operations only; domain-specific coordinators own mutation durability. */
export function projectDepartmentMcpSuite(context: McpProjectionContext) {
  return toolsFor(context.suiteFlags).map(toMcpToolManifest)
}
export function resolveDepartmentMcpExecutions(context: McpProjectionContext): McpExecutionDescriptor[] {
  return toolsFor(context.suiteFlags).map(tool => ({ name: tool.name, canonicalName: tool.name, kind: 'supplemental', tool }))
}

async function run(name: string, args: unknown, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  if ([...DEPARTMENT_LEAD_READ_NAMES, ...DEPARTMENT_LEAD_WRITE_NAMES].includes(name)) return executeDepartmentLeadTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_CREATIVE_READ_NAMES, ...DEPARTMENT_CREATIVE_WRITE_NAMES].some(n => n === name)) return executeDepartmentCreativeTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_WEBSITE_READ_NAMES, ...DEPARTMENT_WEBSITE_WRITE_NAMES].some(n => n === name)) return executeDepartmentWebsiteTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_EMAIL_READ_NAMES, ...DEPARTMENT_EMAIL_WRITE_NAMES].some(n => n === name)) return executeDepartmentEmailTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_INBOX_READ_NAMES, ...DEPARTMENT_INBOX_WRITE_NAMES].some(n => n === name)) return executeDepartmentInboxTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_BUDGET_READ_NAMES, ...DEPARTMENT_BUDGET_WRITE_NAMES].some(n => n === name)) return executeDepartmentBudgetTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_FEED_READ_NAMES, ...DEPARTMENT_FEED_WRITE_NAMES].some(n => n === name)) return executeDepartmentFeedTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_REVIEW_READ_NAMES, ...DEPARTMENT_REVIEW_WRITE_NAMES].some(n => n === name)) return executeDepartmentReviewTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_CAMPAIGN_READ_NAMES, ...DEPARTMENT_CAMPAIGN_WRITE_NAMES].includes(name)) return executeDepartmentCampaignTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_CATALOG_READ_NAMES, ...DEPARTMENT_CATALOG_WRITE_NAMES].includes(name)) return executeDepartmentCatalogTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_UTILITY_READ_NAMES, ...DEPARTMENT_UTILITY_WRITE_NAMES].includes(name)) return executeDepartmentUtilityTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_WORK_READ_NAMES, ...DEPARTMENT_WORK_WRITE_NAMES].some(n => n === name)) return executeDepartmentWorkTool(name, args, ctx, key, digest)
  if ([...DEPARTMENT_CONTENT_READ_NAMES, ...DEPARTMENT_CONTENT_WRITE_NAMES].some(n => n === name)) return executeDepartmentContentTool(name, args, ctx, key, digest)
  const tool = departmentTools.find(tool => tool.name === name)
  return tool && !tool.mutates ? tool.handler(args, ctx) : fail('Unknown department operation', 'not_found')
}

export async function executeDepartmentTool(
  name: string, args: unknown, ctx: ToolContext, key: string, digest: string,
  deps: { tools?: AiTool<unknown>[], flags?: McpSuiteFlags, run?: typeof run } = {}
): Promise<ToolResult> {
  try {
    // Dynamic imports keep the policy -> registry -> suite graph free of initialization cycles.
    const { evaluateStaffToolAdmission } = await import('./marketingPolicy')
    const { requireMarketingDepartment } = await import('../marketing/departmentAuthority')
    const admission = evaluateStaffToolAdmission(name, ctx)
    if (admission.allowed === false) return fail(admission.error, admission.code)
    const fresh = await requireMarketingDepartment(ctx, isDepartmentWriteTool(name))
    const currentAdmission = evaluateStaffToolAdmission(name, fresh)
    if (currentAdmission.allowed === false) return fail(currentAdmission.error, currentAdmission.code)
    const flags = deps.flags ?? (await import('./runtimeConfig')).resolveMcpRuntimeConfig(ctx.event).suiteFlags
    const tool = toolsFor(flags, deps.tools).find(tool => tool.name === name)
    if (!tool) return fail('Department operation is disabled or unavailable', 'not_found')
    const parsed = tool.parameters.safeParse(args)
    if (!parsed.success) return fail('Invalid department arguments', 'bad_args')
    return await (deps.run ?? run)(name, parsed.data, fresh, key, digest)
  } catch {
    return fail('Department operation is unavailable or no longer permitted', 'unavailable')
  }
}
