/**
 * Atomic-claim helpers for the budget-write execute flow (IM-01 concurrency
 * hardening). Two simultaneous "Apply" clicks on the same approved action could
 * otherwise both reach the platform write before either records 'applied'.
 *
 * `claimApprovedAction` flips approved → executing in a single guarded UPDATE;
 * Postgres row-locks the row so exactly one concurrent caller sees a returned
 * row (true). The loser gets false and must abort without touching the platform.
 * `releaseActionClaim` puts a still-held row back to 'approved' when execution is
 * abandoned before any platform write (e.g. a guardrail block), so the approval
 * can be retried. Requires migration 179 (the 'executing' status value).
 */

export async function claimApprovedAction(
  db: { queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null> },
  actionId: string,
): Promise<boolean> {
  const claimed = await db.queryOne<{ id: string }>(
    `UPDATE campaign_action_log
        SET action_status = 'executing'
      WHERE id = $1 AND action_status = 'approved'
      RETURNING id`,
    [actionId],
  )
  return !!claimed
}

export async function releaseActionClaim(
  db: { execute: (sql: string, params?: any[]) => Promise<number> },
  actionId: string,
): Promise<void> {
  await db.execute(
    `UPDATE campaign_action_log
        SET action_status = 'approved'
      WHERE id = $1 AND action_status = 'executing'`,
    [actionId],
  )
}
