import { setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)
  const scopes = await queryRows(
    `SELECT id, workspace_ids, board_ids, destination_mappings, allowed_fields, purpose, exclusions,
            period_start, period_end, retention_days, status,
            approved_at, revoked_at, created_at, updated_at
     FROM hr_monday_evidence_scopes
     ORDER BY created_at DESC`,
  )
  const connection = await queryRows(
    `SELECT settings FROM integration_configs
     WHERE integration_type = 'monday' LIMIT 1`,
  )
  return { connected: connection.length > 0, scopes }
})
