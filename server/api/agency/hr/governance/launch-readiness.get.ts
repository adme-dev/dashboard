import { setHeader } from 'h3'
import { query } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { evaluateHrLaunchReadiness, type HrLaunchGateApprovals, type HrLaunchGateKey } from '~~/server/utils/hr/launchReadiness'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)

  const rows = await query<any>(
    `SELECT DISTINCT ON (gate_key)
       id, gate_key, status, evidence_reference, limitations,
       approved_by, approved_at, expires_at, created_at
     FROM hr_launch_gate_attestations
     ORDER BY gate_key, created_at DESC`,
  )
  const approvals: HrLaunchGateApprovals = {}
  for (const row of rows) {
    approvals[row.gate_key as HrLaunchGateKey] = {
      status: row.status,
      approvedAt: row.approved_at,
      expiresAt: row.expires_at,
    }
  }

  return { readiness: evaluateHrLaunchReadiness(approvals), attestations: rows }
})
