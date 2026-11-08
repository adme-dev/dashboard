import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'

/** The canonical reference/revision writer already holds the project row lock. */
export async function invalidateStoryboardProductionReviewsIn(db: GodModeTransactionDb, projectId: string): Promise<void> {
  await db.query(`UPDATE video_storyboard_shot_attempts
    SET review_state = 'stale', updated_at = now()
    WHERE project_id = $1 AND review_state <> 'stale'`, [projectId])
  // Execution state, immutable request/approval receipts and liabilities are retained.
}
