import { setHeader } from 'h3'
import { query, queryOne } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { evaluateHrLaunchReadiness, type HrLaunchGateApprovals, type HrLaunchGateKey } from '~~/server/utils/hr/launchReadiness'
import { evaluateHrPilotReadiness } from '~~/server/utils/hr/pilotReadiness'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)

  const [gateRows, counts] = await Promise.all([
    query<any>(`SELECT DISTINCT ON (gate_key) gate_key, status, approved_at, expires_at
      FROM hr_launch_gate_attestations ORDER BY gate_key, created_at DESC`),
    queryOne<any>(`SELECT
      (SELECT COUNT(*)::int FROM hr_owner_onboarding_sessions WHERE status = 'completed') AS completed_onboarding,
      (SELECT COUNT(*)::int FROM hr_role_profile_versions WHERE status = 'published') AS published_roles,
      (SELECT COUNT(*)::int FROM hr_role_assignments assignment
        JOIN hr_role_profile_versions version ON version.id = assignment.role_profile_version_id
        JOIN team_members member ON member.id = assignment.team_member_id
        JOIN hr_roster_classifications classification ON classification.team_member_id = member.id
        WHERE assignment.effective_to IS NULL AND version.status = 'published' AND member.is_active = true
          AND classification.review_eligible = TRUE) AS eligible_participants,
      (SELECT COUNT(*)::int FROM hr_role_assignments assignment
        JOIN hr_role_profile_versions version ON version.id = assignment.role_profile_version_id
        JOIN team_members member ON member.id = assignment.team_member_id
        JOIN hr_roster_classifications classification ON classification.team_member_id = member.id
        JOIN departments department ON department.id = member.department_id
        WHERE assignment.effective_to IS NULL AND version.status = 'published' AND member.is_active = true
          AND classification.review_eligible = TRUE
          AND department.is_active = true AND department.department_kind = 'organizational') AS organizationally_mapped_participants,
      (SELECT COUNT(*)::int FROM hr_review_cycles WHERE status IN ('scheduled', 'open')) AS active_cycles,
      EXISTS(SELECT 1 FROM hr_monday_evidence_scopes WHERE status = 'approved') AS approved_monday_scope`),
  ])
  const approvals: HrLaunchGateApprovals = {}
  for (const row of gateRows) approvals[row.gate_key as HrLaunchGateKey] = {
    status: row.status, approvedAt: row.approved_at, expiresAt: row.expires_at,
  }
  const governance = evaluateHrLaunchReadiness(approvals)
  const facts = {
    governanceReady: governance.ready,
    completedOnboarding: Number(counts?.completed_onboarding || 0),
    publishedRoles: Number(counts?.published_roles || 0),
    eligibleParticipants: Number(counts?.eligible_participants || 0),
    organizationallyMappedParticipants: Number(counts?.organizationally_mapped_participants || 0),
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
    activeCycles: Number(counts?.active_cycles || 0),
    approvedMondayScope: Boolean(counts?.approved_monday_scope),
  }
  return {
    readiness: evaluateHrPilotReadiness(facts),
    facts,
    governance,
    limitations: ['Read-only preflight; no participant, questionnaire, notification or calendar record is created'],
  }
})
