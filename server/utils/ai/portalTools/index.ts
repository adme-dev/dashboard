import type { PortalAiTool, PortalToolContext } from './portalContext'
import { assertPortalScope, toPortalSdkTools } from './portalContext'
import { getMyApprovalsTool } from './approvals'
import { getMyInvoicesTool } from './invoices'
import { getMyProjectsTool } from './projects'
import { getMyBriefsTool } from './briefs'
import { getMyLeadsTool } from './leads'
import { getMySocialReportTool } from './socialReport'
import { respondToApprovalTool } from './respondApproval'
import { narrowPortalRegistryByApps } from './appAssignment'

export type { PortalAiTool, PortalToolContext }
export { assertPortalScope } from './portalContext'
export { PORTAL_APP_TOOLS, narrowPortalRegistryByApps, getEnabledPortalApps } from './appAssignment'

/**
 * The portal registry (portal-agent spec §3, layer 1: SEPARATE registry). ONLY portal-safe, read-only,
 * client-scoped tools live here — agency tools are physically absent, so a portal agent can never call
 * one. Tier 1 = read-only "understand my portal". Tier 2 own-data actions (e.g. respond_to_approval)
 * append here later, each `mutates` + propose→confirm.
 */
export const portalRegistry: PortalAiTool<any>[] = [
  // Tier 1 — read-only.
  getMyApprovalsTool,
  getMyInvoicesTool,
  getMyProjectsTool,
  getMyBriefsTool,
  getMyLeadsTool,
  getMySocialReportTool,
  // Tier 2 — own-data writes (mutates). Only exposed when allowWrites (AI_PORTAL_WRITES_ENABLED).
  respondToApprovalTool,
]

/**
 * Build the SDK toolset for a portal turn. Refuses to run without a clientScope (spec §12 #1) BEFORE
 * any tool is constructed, then converts ONLY the portal registry — optionally narrowed to the client's
 * assigned apps (config narrows, never grants). This is the single entry point a portal loop uses;
 * there is no path here that admits an agency tool or an unscoped context.
 */
export function buildPortalTools(
  ctx: PortalToolContext,
  seed: string,
  opts: { enabledApps?: string[] | null, allowWrites?: boolean } = {},
) {
  assertPortalScope(ctx)
  let tools = narrowPortalRegistryByApps(portalRegistry, opts.enabledApps ?? null)
  // Tier 2 writes are doubly dormant: absent unless allowWrites (AI_PORTAL_WRITES_ENABLED) is set.
  if (!opts.allowWrites) tools = tools.filter(t => !t.mutates)
  // Per-user RBAC: drop tools the portal user isn't permitted to use (mirrors the REST endpoints'
  // canViewInvoices/canViewAnalytics/canApproveWork checks). Only applied when permissions are supplied.
  if (ctx.permissions) {
    const perms = ctx.permissions
    tools = tools.filter(t => !t.requiredPermission || perms[t.requiredPermission] === true)
  }
  return toPortalSdkTools(tools, ctx, seed)
}
