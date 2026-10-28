import type { ToolContext } from './ai/toolContext'

/** Explicit department authority; legacy role names and other groups never imply it. */
export function hasMarketingManagementPermission(groups: readonly string[] | null | undefined): boolean {
  return Array.isArray(groups) && groups.includes('MARKETING_MANAGEMENT')
}

/** Context callers must first resolve current identity and role policy from fresh storage. */
export function isMarketingManagementContext(
  ctx: Pick<ToolContext, 'permissionGroups' | 'mcpStaffAuthority'>
): boolean {
  return ctx.mcpStaffAuthority === 'fresh' && hasMarketingManagementPermission(ctx.permissionGroups)
}
