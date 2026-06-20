import type { PortalAiTool, PortalToolContext } from './portalContext'
import { assertPortalScope, toPortalSdkTools } from './portalContext'
import { getMyApprovalsTool } from './approvals'
import { getMyInvoicesTool } from './invoices'
import { getMyProjectsTool } from './projects'
import { getMyBriefsTool } from './briefs'
import { getMyLeadsTool } from './leads'

export type { PortalAiTool, PortalToolContext }
export { assertPortalScope } from './portalContext'

/**
 * The portal registry (portal-agent spec §3, layer 1: SEPARATE registry). ONLY portal-safe, read-only,
 * client-scoped tools live here — agency tools are physically absent, so a portal agent can never call
 * one. Tier 1 = read-only "understand my portal". Tier 2 own-data actions (e.g. respond_to_approval)
 * append here later, each `mutates` + propose→confirm.
 */
export const portalRegistry: PortalAiTool<any>[] = [
  getMyApprovalsTool,
  getMyInvoicesTool,
  getMyProjectsTool,
  getMyBriefsTool,
  getMyLeadsTool,
]

/**
 * Build the SDK toolset for a portal turn. Refuses to run without a clientScope (spec §12 #1) BEFORE
 * any tool is constructed, then converts ONLY the portal registry. This is the single entry point a
 * portal loop uses — there is no path here that admits an agency tool or an unscoped context.
 */
export function buildPortalTools(ctx: PortalToolContext, seed: string) {
  assertPortalScope(ctx)
  return toPortalSdkTools(portalRegistry, ctx, seed)
}
