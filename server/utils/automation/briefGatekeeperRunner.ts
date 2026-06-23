// server/utils/automation/briefGatekeeperRunner.ts
// C5 brief-completeness gatekeeper — the WRITE-side runner (the "Elena" auto-gate).
// Domain logic is pure in ./briefGatekeeper (decideBriefGate + planGatekeeperActions);
// the completeness score is computed by aiBriefScoring.scoreBriefCompleteness.
//
// DORMANT by default: only acts when BRIEF_GATEKEEPER_ENABLED === 'true' (operator-gated,
// like AD_REPORTS_ENABLED). Hooked into the brief status-change chokepoint on submission.
// Fail-open: errors are logged, never thrown (it runs as a side-effect of a status change
// that has already succeeded — never block the submit).
//
// It MUTATES live briefs only when activated: set needs_info + comment + notify the
// submitter on an incomplete brief; auto-assign to the template target on a complete one.

import { queryOne, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { scoreBriefCompleteness } from '~~/server/utils/aiBriefScoring'
import { decideBriefGate, planGatekeeperActions } from '~~/server/utils/automation/briefGatekeeper'

export function isBriefGatekeeperEnabled(): boolean {
  return process.env.BRIEF_GATEKEEPER_ENABLED === 'true'
}

interface BriefGatekeeperRow {
  id: string
  title: string | null
  reference_number: string | null
  status: string
  submitted_by: string | null
  assigned_to: string | null
  auto_assign_to: string | null
}

export type BriefGatekeeperResult =
  | { skipped: 'disabled' | 'not_found' }
  | { error: true }
  | { gate: 'pass' | 'needs_info'; action: 'needs_info' | 'assigned' | 'none'; missingRequired: number }

/**
 * Evaluate a brief's completeness and apply the gate (set needs_info / auto-assign).
 * No-op unless BRIEF_GATEKEEPER_ENABLED (or opts.force). Fail-open.
 */
export async function runBriefGatekeeper(
  briefId: string,
  opts: { force?: boolean } = {},
): Promise<BriefGatekeeperResult> {
  try {
    if (!isBriefGatekeeperEnabled() && !opts.force) return { skipped: 'disabled' }

    const brief = await queryOne<BriefGatekeeperRow>(
      `SELECT b.id, b.title, b.reference_number, b.status, b.submitted_by, b.assigned_to,
              bt.auto_assign_to
         FROM briefs b
         JOIN brief_templates bt ON bt.id = b.template_id
        WHERE b.id = $1`,
      [briefId],
    )
    if (!brief) return { skipped: 'not_found' }

    const score = await scoreBriefCompleteness(briefId)
    const decision = decideBriefGate(score)
    const plan = planGatekeeperActions({
      decision,
      currentStatus: brief.status,
      autoAssignTo: brief.auto_assign_to,
      currentAssignee: brief.assigned_to,
      hasScorableFields: score.fieldScores.length > 0,
    })

    if (plan.setStatus) {
      await execute(`UPDATE briefs SET status = $2, updated_at = NOW() WHERE id = $1`, [briefId, plan.setStatus])
      await execute(
        `INSERT INTO brief_activities (brief_id, user_id, activity_type, old_value, new_value, content)
         VALUES ($1, NULL, 'needs_info', $2, $3, $4)`,
        [briefId, JSON.stringify({ status: brief.status }), JSON.stringify({ status: plan.setStatus }), 'Auto-gate: brief incomplete'],
      )
    }

    if (plan.comment) {
      await execute(
        `INSERT INTO brief_comments (brief_id, user_id, content, is_internal) VALUES ($1, NULL, $2, false)`,
        [briefId, plan.comment],
      )
    }

    if (plan.notifySubmitter && brief.submitted_by) {
      await createNotification({
        userId: brief.submitted_by,
        type: 'brief_status_changed',
        title: 'Brief needs more info',
        message: decision.message,
        link: `/agency/briefs/${briefId}`,
        metadata: { briefId, gate: decision.gate, missingRequired: decision.missingRequired, kind: 'brief_gatekeeper' },
      })
    }

    if (plan.assignTo) {
      await execute(`UPDATE briefs SET assigned_to = $2, assigned_at = NOW(), updated_at = NOW() WHERE id = $1`, [briefId, plan.assignTo])
      await execute(
        `INSERT INTO brief_activities (brief_id, user_id, activity_type, new_value, content)
         VALUES ($1, NULL, 'assigned', $2, $3)`,
        [briefId, JSON.stringify({ assigned_to: plan.assignTo }), 'Auto-gate: assigned on completeness pass'],
      )
      await createNotification({
        userId: plan.assignTo,
        type: 'brief_assigned',
        title: 'Brief assigned to you',
        message: `"${brief.title ?? 'Brief'}" passed the completeness gate and was assigned to you.`,
        link: `/agency/briefs/${briefId}`,
        metadata: { briefId, kind: 'brief_gatekeeper' },
      })
    }

    const action = plan.setStatus ? 'needs_info' : plan.assignTo ? 'assigned' : 'none'
    return { gate: decision.gate, action, missingRequired: decision.missingRequired.length }
  } catch (err) {
    console.error('[brief-gatekeeper] failed to evaluate brief', briefId, err)
    return { error: true }
  }
}
