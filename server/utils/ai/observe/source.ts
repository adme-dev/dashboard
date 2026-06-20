import type { ObservedEvent, WorkEventSource } from './sessionize'

/**
 * Observe & Learn W-2 — the real `WorkEventSource` over the existing activity tables. PURE-ish: the DB
 * surface is injected (defaults wired in the cron) so it's unit-testable without a database. Every read
 * is STRICTLY user-scoped (`WHERE actor = $userId`) — a user only ever learns from their OWN actions,
 * the core privacy invariant (spec §2). Client-portal actions (`client_activity_log`) are intentionally
 * EXCLUDED: their actor is a client portal user, not an agency team member, so they have no staff owner.
 *
 * Each source row is normalized to a stable `kind` (`<table>.<action>`). Sensitive kinds — sign-off /
 * approval / finance actions — are flagged so `detectRoutines` drops them: we never learn
 * "approve expenses every Friday" as a routine to suggest (spec §2 privacy invariants).
 */

export interface ObserveDb {
  queryRows: <T>(sql: string, params?: unknown[]) => Promise<T[]>
}

/**
 * Is this normalized action sensitive? Approvals, rejections, sign-offs, and any finance/budget/spend
 * AI action are excluded from routine inference and (later) proactive suggestion. Conservative: when in
 * doubt about a finance-shaped tool name, mark it sensitive.
 */
export function isSensitiveKind(kind: string): boolean {
  const k = kind.toLowerCase()
  // Sign-off / approval decisions on tasks and proofs.
  if (/\.(approved|rejected|approval_requested|changes_requested)$/.test(k)) return true
  // Finance/spend-shaped AI actions (tool names vary; match the money words).
  if (k.startsWith('ai.') && /(budget|invoice|expense|eom|payment|finance|spend|payout|refund)/.test(k)) return true
  return false
}

const ev = (
  userId: string,
  kind: string,
  at: string,
  entityType: string,
  entityId: string | null
): ObservedEvent => ({
  userId,
  kind,
  at: typeof at === 'string' ? at : new Date(at as unknown as number).toISOString(),
  entityType,
  ...(entityId ? { entityId } : {}),
  sensitive: isSensitiveKind(kind)
})

type Row = { kind: string, at: string, entity_type: string, entity_id: string | null }

/**
 * Build the adapter. `recentEvents` unions a user's rows from every observed stream after `sinceISO`,
 * normalizes them, and returns the most recent `limit` in ascending order. Each per-table query fetches
 * its own NEWEST `limit` rows (DESC) so one busy stream can't crowd the others out before the merge; we
 * then sort ascending and keep the newest `limit` overall (recent activity is what routine detection
 * cares about).
 */
export function createWorkEventSource(db: ObserveDb): WorkEventSource {
  return {
    async recentEvents(userId: string, sinceISO: string, limit: number): Promise<ObservedEvent[]> {
      if (!userId) return []
      const per = Math.max(1, limit)

      const [tasks, crm, proofs, ai] = await Promise.all([
        db.queryRows<Row>(
          `SELECT ('task.' || activity_type) AS kind, created_at AS at, 'task' AS entity_type, task_id::text AS entity_id
             FROM task_activities
            WHERE user_id = $1 AND created_at > $2
            ORDER BY created_at DESC
            LIMIT $3`,
          [userId, sinceISO, per]
        ),
        db.queryRows<Row>(
          `SELECT ('crm.' || type) AS kind, created_at AS at, target_type AS entity_type, target_id::text AS entity_id
             FROM crm_activities
            WHERE created_by = $1 AND deleted_at IS NULL AND created_at > $2
            ORDER BY created_at DESC
            LIMIT $3`,
          [userId, sinceISO, per]
        ),
        db.queryRows<Row>(
          `SELECT ('proof.' || activity_type) AS kind, created_at AS at, 'proof' AS entity_type, proof_id::text AS entity_id
             FROM proof_activities
            WHERE team_member_id = $1 AND actor_type = 'team_member' AND created_at > $2
            ORDER BY created_at DESC
            LIMIT $3`,
          [userId, sinceISO, per]
        ),
        db.queryRows<Row>(
          `SELECT ('ai.' || tool_name) AS kind, created_at AS at, 'ai_action' AS entity_type, id::text AS entity_id
             FROM ai_action_audit
            WHERE user_id = $1 AND created_at > $2
            ORDER BY created_at DESC
            LIMIT $3`,
          [userId, sinceISO, per]
        )
      ])

      const all: ObservedEvent[] = []
      for (const r of [...tasks, ...crm, ...proofs, ...ai]) {
        if (!r?.kind || !r?.at) continue
        all.push(ev(userId, r.kind, r.at, r.entity_type, r.entity_id))
      }
      all.sort((a, b) => +new Date(a.at) - +new Date(b.at))
      // Keep the newest `limit` (ascending order preserved) — recent activity drives routine detection.
      return all.slice(Math.max(0, all.length - limit))
    }
  }
}
