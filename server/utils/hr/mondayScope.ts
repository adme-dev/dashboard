import { queryOne } from '~~/server/utils/db'

export interface ActiveMondayEvidenceScope {
  id: string
  workspace_ids: string[]
  board_ids: string[]
  destination_mappings: Array<{ boardId: string; departmentId: string; projectId?: string }>
  allowed_fields: string[]
  purpose: string
  exclusions: string[]
  period_start: string
  period_end: string
  retention_days: number
  approved_by: string | null
}

export async function getActiveMondayEvidenceScope() {
  return queryOne<ActiveMondayEvidenceScope>(
    `SELECT id, workspace_ids, board_ids, destination_mappings, allowed_fields, purpose, exclusions,
            period_start, period_end, retention_days, approved_by
     FROM hr_monday_evidence_scopes
     WHERE status = 'approved'
     ORDER BY approved_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
  )
}
