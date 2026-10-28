import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import type { ToolContext, ToolResult } from '../toolContext'
import { departmentReviewContracts, type DepartmentReviewToolName } from '../marketing/departmentReviewSchemas'

const descriptions: Record<DepartmentReviewToolName, string> = {
  marketing_list_google_ads_reviews: 'List up to 100 stored peer Google Ads review plans in current active client scope. Returns exact request hashes and statuses without provider calls.',
  marketing_get_google_ads_review: 'Read one peer Google Ads plan and its exact request hash after fresh requester and reviewer checks. Inspect existing results before attempting execution.',
  marketing_review_google_ads_plan: 'Approve or reject one independently submitted Google Ads plan by its exact request hash. This records a decision; it does not execute the plan.',
  marketing_execute_google_ads_plan: 'Execute an exact independently approved Google Ads plan through its durable provider claim. Unknown outcomes require inspection and must not be retried blindly.',
  marketing_list_gtm_reviews: 'List up to 100 stored peer GTM proposals in current active client scope. Review projections redact scripts and keys and do not call Google.',
  marketing_get_gtm_review: 'Read one peer GTM proposal with safe exact review evidence. Native conversion ownership and current host/container evidence remain mandatory.',
  marketing_review_gtm_proposal: 'Approve or reject one GTM proposal by its exact hash after fresh independent authority and ownership checks. Approval does not publish a container.',
  marketing_execute_gtm_proposal: 'Execute an exact independently approved GTM proposal using existing connection serialization and provider verification. Preserve unknown outcome holds; installation does not prove conversion delivery.',
  marketing_list_social_reviews: 'List up to 100 stored peer social revisions with exact reviewed copy, destinations, content hashes and outcomes. Reports truncation and makes no provider calls.',
  marketing_get_social_review: 'Read one peer social post current revision and reviewed effective payload. Private storage metadata and provider credentials are excluded.',
  marketing_review_social_revision: 'Approve or reject the exact current social revision and content hash. Existing scheduled approval may start its revision-bound workflow; self-review and changed content fail closed.',
  marketing_execute_social_revision: 'Publish one exact approved unscheduled social revision through the durable publishing claim. Accepted and unknown outcomes stay distinct from published; do not replay uncertain results.'
}

export const departmentReviewTools: AiTool<unknown>[] = Object.entries(departmentReviewContracts).map(([name, contract]) => ({
  name, description: descriptions[name as DepartmentReviewToolName], parameters: contract.schema,
  requiredPermission: 'MARKETING_MANAGEMENT', mutates: contract.mutates, returnsUntrusted: true,
  handler: contract.mutates
    ? async () => ({ ok: false, error: 'Use the authenticated department review call boundary.', code: 'forbidden' })
    : async (args, ctx) => executeDepartmentReviewTool(name, args, ctx)
}))

/** Called only by the dedicated staff call branch; durable domain identities replace generic confirmation. */
export async function executeDepartmentReviewTool(
  name: string, args: unknown, ctx: ToolContext, _idempotencyKey?: string, _sessionDigest?: string
): Promise<ToolResult> {
  if (!Object.hasOwn(departmentReviewContracts, name)) return { ok: false, error: 'Unknown review tool', code: 'not_found' }
  try {
    const { runDepartmentReviewOperation } = await import('../marketing/departmentReviewOperations')
    const data = await runDepartmentReviewOperation(name as DepartmentReviewToolName, args, ctx)
    if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
      return { ok: false, code: 'execution_blocked',
        error: 'Domain execution did not succeed; inspect the stored outcome before retrying.',
        details: { status: 'status' in data ? data.status : null } }
    }
    return { ok: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: 'Invalid typed review input', code: 'bad_args' }
    const status = (error as { statusCode?: number }).statusCode
    return { ok: false,
      error: status === 403
        ? 'Current review authority or signed consent is unavailable.'
        : status === 409
          ? 'Review version or state changed; inspect the current proposal before proceeding.'
          : status === 404 ? 'Review record not found.' : 'Review service unavailable; inspect the stored outcome before retrying.',
      code: status === 403 ? 'forbidden' : status === 409 ? 'conflict' : status === 404 ? 'not_found' : 'handler_error' }
  }
}
