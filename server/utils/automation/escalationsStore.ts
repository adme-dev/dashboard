// server/utils/automation/escalationsStore.ts
// Thin DB adapter for automation_escalations. Domain logic lives in ./escalations.
import { queryOne, queryRows } from '~~/server/utils/db'
import { buildEscalationInsert, type EscalationInput, type EscalationDecision } from '~~/server/utils/automation/escalations'

export async function raiseEscalation(input: EscalationInput) {
  const r = buildEscalationInsert(input)
  return await queryOne(
    `INSERT INTO automation_escalations
       (capability, title, severity, client_id, run_id, detail, proposed_action, assigned_role)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
     RETURNING id, status, created_at`,
    [r.capability, r.title, r.severity, r.client_id, r.run_id, r.detail, r.proposed_action, r.assigned_role],
  )
}

export async function listPendingEscalations() {
  return await queryRows(
    `SELECT id, capability, title, severity, client_id, run_id, detail, proposed_action, status, created_at
       FROM automation_escalations
      WHERE status = 'pending'
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at ASC`,
  )
}

export async function getEscalation(id: string) {
  return await queryOne(`SELECT * FROM automation_escalations WHERE id = $1`, [id])
}

// Race-safe: only a still-'pending' row transitions. Returns null if already decided / not found.
export async function decideEscalation(
  id: string,
  decision: EscalationDecision,
  deciderId: string,
  note?: string,
) {
  return await queryOne(
    `UPDATE automation_escalations
        SET status = $2,
            decided_by = $3,
            decided_at = NOW(),
            audit = jsonb_build_object('note', $4::text, 'decision', $2::text)
      WHERE id = $1 AND status = 'pending'
      RETURNING id, status, decided_by, decided_at`,
    [id, decision, deciderId, note ?? null],
  )
}
