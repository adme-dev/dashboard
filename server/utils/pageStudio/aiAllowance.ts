import type { PageStudioControlQueryClient } from './controlStore'

export class PageStudioAiUsageError extends Error {
  readonly data: { error: { code: string, message: string } }
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message)
    this.name = 'PageStudioAiUsageError'
    this.data = { error: { code, message } }
  }
}

/** SQL-only shared allowance check. The caller must first lock its site and the
 * client-wide page-studio-ai-usage advisory key, then check current authority.
 * Keep the charge/claim insertion in that same transaction. A successful check
 * alone grants neither execution nor permission to act as a customer. */
export async function assertPageStudioAiAllowanceAvailable(
  db: PageStudioControlQueryClient,
  scope: { tenantId: string, clientId: string, entitlementId: string }
) {
  const budget = (await db.query<{ monthly_ai_operation_limit: number, period: string }>(`SELECT monthly_ai_operation_limit,
    date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC')::date::text AS period
    FROM page_studio_entitlements WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR SHARE`,
  [scope.tenantId, scope.clientId, scope.entitlementId])).rows[0]
  if (!budget || !Number.isSafeInteger(budget.monthly_ai_operation_limit) || budget.monthly_ai_operation_limit <= 0) {
    throw new PageStudioAiUsageError('AI_USAGE_DENIED', 403, 'AI usage access denied')
  }
  // Unknown and failed executions remain charged. Sum across all sites and both
  // environments; neither a delivery environment nor an authoring scope gets a
  // separate allowance. The public row is its own atomic reservation.
  const used = (await db.query<{ used: string }>(`SELECT (
    (SELECT count(*) FROM page_studio_ai_usage WHERE tenant_id=$1 AND client_id=$2 AND period_start=$3::date)
    + (SELECT count(*) FROM page_studio_public_action_invocations WHERE tenant_id=$1 AND client_id=$2 AND period_start=$3::date)
    )::text AS used`, [scope.tenantId, scope.clientId, budget.period])).rows[0]
  if (!used || !/^\d+$/.test(used.used) || BigInt(used.used) >= BigInt(budget.monthly_ai_operation_limit)) {
    throw new PageStudioAiUsageError('AI_USAGE_EXHAUSTED', 429, 'The monthly AI allowance has been reached')
  }
  return { period: budget.period }
}
