// G6 — AI-proposed brief-completion alert (Q4: human-in-the-loop, never auto-complete).
// When every task of a brief-derived project reaches a final status, propose to the brief
// owner that the brief be marked complete. We notify + record a durable proposal note; the
// owner confirms with one click. We deliberately do NOT move briefs.status here.

import { queryOne, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'

// Stable prefix on the proposal note — also the dedup key so we propose at most once.
const PROPOSAL_PREFIX = 'Completion check:'

/**
 * If all of the project's tasks are final and the linked brief is still open, propose
 * completing it. Fully guarded + idempotent; safe to fire-and-forget from the hot task path.
 */
export async function maybeProposeBriefCompletion(params: {
  projectId: string | null | undefined
  actorId: string | null
}): Promise<void> {
  try {
    if (!params.projectId) return

    // The brief this project came from; bail if none or already closed.
    const brief = await queryOne(`
      SELECT id, title, reference_number, assigned_to, status
      FROM briefs
      WHERE converted_to_project_id = $1
    `, [params.projectId])
    if (!brief) return
    if (['completed', 'cancelled'].includes(brief.status)) return

    // Are ALL the project's tasks in a final status?
    const counts = await queryOne(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ts.is_final)::int AS final
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.project_id = $1
    `, [params.projectId])
    if (!counts || counts.total === 0 || counts.final < counts.total) return

    // Dedup: a prior proposal note means we've already alerted — don't nag.
    const already = await queryOne(`
      SELECT 1 FROM brief_activities
      WHERE brief_id = $1 AND activity_type = 'commented' AND content LIKE $2
      LIMIT 1
    `, [brief.id, `${PROPOSAL_PREFIX}%`])
    if (already) return

    await execute(`
      INSERT INTO brief_activities (brief_id, user_id, activity_type, content)
      VALUES ($1, $2, 'commented', $3)
    `, [
      brief.id,
      params.actorId,
      `${PROPOSAL_PREFIX} all ${counts.total} task${counts.total === 1 ? '' : 's'} of the linked project are done — ready to mark this brief complete?`,
    ])

    if (brief.assigned_to) {
      await createNotification({
        userId: brief.assigned_to,
        type: 'brief_completion_proposed',
        title: 'Brief ready to complete?',
        message: `All tasks for "${brief.title}" are done. Mark the brief complete?`,
        link: `/agency/briefs/${brief.id}`,
        actorId: params.actorId || undefined,
        metadata: {
          briefId: brief.id,
          projectId: params.projectId,
          referenceNumber: brief.reference_number,
        },
      })
    }
  } catch (err) {
    console.error('[Brief] completion proposal failed (non-fatal):', err)
  }
}
