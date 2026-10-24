import { assertManagedTransferSource } from './managedTransferIntent'
import {
  recoveryCurrentContext,
  reviewDenied,
  type ReviewRoute,
  type ReviewActor
} from './customerTransferRecoveryCurrentAuthority'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
export {
  reviewDenied,
  reviewSame,
  type ReviewRoute,
  type ReviewActor
} from './customerTransferRecoveryCurrentAuthority'

export const laterTables = [
  'executions',
  'source_drafts',
  'destination_executions',
  'destination_execution_verifications',
  'copy_graph_requests',
  'copy_graph_verifications',
  'forms_history_requests',
  'forms_history_verifications',
  'completions'
] as const

/** Inventory admission stays closed after ANY later phase row exists. */
export async function recoveryReviewContext(
  db: PageStudioQueryClient,
  route: ReviewRoute,
  actor: ReviewActor,
  renewalRequestId: string,
  stage: boolean | 'pending' | 'applied' = false
) {
  const context = await recoveryCurrentContext(db, route, actor, renewalRequestId, stage)
  await assertManagedTransferSource(db, context.intent)
  for (const table of laterTables)
    if (
      (
        await db.query(`SELECT 1 FROM page_studio_managed_transfer_${table} WHERE operation_id=$1`, [
          context.intent.operationId
        ])
      ).rows.length
    )
      throw reviewDenied()
  return context
}
/** Last query after writes/hashes/source reads. All identity rows were locked. */
export async function recoveryReviewClock(
  db: PageStudioQueryClient,
  context: Awaited<ReturnType<typeof recoveryReviewContext>>,
  maximum: string,
  hashes: { operator?: string; owner?: string },
  expectedMode = 'reconciling'
) {
  const a = context.intent.authority
  const row = (
    await db.query<{ deadline: string }>(
      `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
    SELECT to_char(LEAST($1::timestamptz,h.deadline,e.effective_until,m.expires_at,
      op.expires_at,own.expires_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deadline
    FROM page_studio_transfer_recovery_heads h CROSS JOIN page_studio_entitlements e
    CROSS JOIN page_studio_workspace_memberships m CROSS JOIN instant
    LEFT JOIN page_studio_login_sessions op ON op.token_hash=$2 AND op.role='agency'
    LEFT JOIN page_studio_customer_sessions own ON own.token_hash=$3
    WHERE h.operation_id=$4 AND h.mode=$5 AND h.deadline>instant.now
      AND e.id=$6 AND e.status='active' AND e.effective_until>instant.now
      AND m.identity_id=$7 AND m.workspace_id=$8 AND m.role='owner' AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at>instant.now) AND $1::timestamptz>instant.now
      AND ($2::text IS NULL OR (op.expires_at>instant.now AND op.revoked_at IS NULL))
      AND ($3::text IS NULL OR (own.expires_at>instant.now AND own.revoked_at IS NULL))`,
      [
        maximum,
        hashes.operator ?? null,
        hashes.owner ?? null,
        context.intent.operationId,
        expectedMode,
        context.renewal.entitlementId,
        a.owner.identityId,
        a.owner.workspaceId
      ]
    )
  ).rows[0]
  if (!row) throw reviewDenied()
  return row.deadline
}
