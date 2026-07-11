import { setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)

  const roles = await queryRows(
    `SELECT rp.id,
            rp.title,
            rp.department,
            rp.status,
            rpv.status AS version_status,
            rpv.id AS version_id,
            rpv.version,
            rpv.purpose,
            rpv.responsibilities,
            rpv.expected_outcomes,
            rpv.decision_authority,
            rpv.dependencies,
            rpv.out_of_scope,
            rpv.benchmark_refs,
            rpv.source_refs,
            rpv.published_at,
            (SELECT COUNT(*) FROM hr_role_assignments ra
              WHERE ra.role_profile_version_id = rpv.id AND ra.effective_to IS NULL) AS assigned_people,
            jsonb_array_length(questionnaire.questions) AS question_count,
            questionnaire.questions AS questionnaire_questions,
            questionnaire.quality_report AS questionnaire_quality_report,
            (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', kpi.id,
                'name', kpi.name,
                'description', kpi.description,
                'unit', kpi.unit,
                'direction', kpi.direction,
                'targetValue', kpi.target_value,
                'targetMin', kpi.target_min,
                'targetMax', kpi.target_max,
                'targetDescription', kpi.target_description,
                'cadence', kpi.cadence,
                'sourceType', kpi.source_type,
                'sourceRef', kpi.source_ref,
                'dataOwner', kpi.data_owner,
                'weight', kpi.weight,
                'departmentGoalVersionId', goal_link.department_goal_version_id,
                'goalContributionWeight', goal_link.contribution_weight,
                'goalRationale', goal_link.rationale
              ) ORDER BY kpi.name), '[]'::jsonb)
             FROM hr_role_kpi_definitions kpi
             LEFT JOIN hr_role_kpi_goal_links goal_link ON goal_link.kpi_definition_id = kpi.id
             WHERE kpi.role_profile_version_id = rpv.id) AS kpis
     FROM hr_role_profiles rp
     JOIN LATERAL (
       SELECT * FROM hr_role_profile_versions candidate
       WHERE candidate.role_profile_id = rp.id
       ORDER BY candidate.version DESC LIMIT 1
     ) rpv ON true
     LEFT JOIN LATERAL (
       SELECT questionnaire.questions, questionnaire.quality_report
       FROM hr_questionnaire_versions questionnaire
       WHERE questionnaire.template_key = 'role-' || rp.id::text
       ORDER BY questionnaire.version DESC LIMIT 1
     ) questionnaire ON true
     WHERE rp.status <> 'archived'
     ORDER BY rp.department NULLS LAST, rp.title`,
  )

  const benchmarks = await queryRows(
    `SELECT framework_key, name, publisher, version, source_url
     FROM hr_benchmark_frameworks
     WHERE status = 'active'
     ORDER BY publisher, name`,
  )

  const contractExtracts = await queryRows(
    `SELECT extract.id, document.team_member_id, member.name AS member_name,
            extract.role_title, extract.department, extract.role_purpose,
            extract.responsibilities, extract.expected_outcomes,
            extract.decision_authority, extract.role_exclusions,
            extract.approved_at
     FROM hr_contract_role_extracts extract
     JOIN hr_contract_documents document ON document.id = extract.contract_document_id
     JOIN team_members member ON member.id = document.team_member_id
     WHERE extract.status = 'approved' AND document.status = 'approved'
     ORDER BY member.name`,
  )

  const departmentGoals = await queryRows(
    `SELECT version.id AS version_id, goal.name, department.name AS department_name,
            version.metric_name, version.unit, version.period_end
     FROM hr_department_goal_versions version
     JOIN hr_department_goals goal ON goal.id = version.goal_id
     JOIN departments department ON department.id = goal.department_id
     WHERE version.status = 'published' AND goal.status = 'active'
     ORDER BY department.name, goal.name`,
  )

  const roleAssignments = await queryRows(
    `SELECT assignment.id, assignment.team_member_id, assignment.role_profile_version_id,
            assignment.acknowledgement_status, assignment.effective_from
       FROM hr_role_assignments assignment
       JOIN team_members member ON member.id = assignment.team_member_id AND member.is_active = TRUE
      WHERE assignment.effective_to IS NULL
      ORDER BY assignment.created_at DESC`,
  )

  const activeMembers = await queryRows(
    `SELECT member.id, member.name, member.email,
            COALESCE(member.role, member.user_role::text) AS current_role,
            department.name AS department,
            assignment.id AS current_assignment_id,
            assignment.role_profile_version_id AS current_role_version_id,
            profile.title AS governed_role_title,
            assignment.acknowledgement_status
       FROM team_members member
       LEFT JOIN departments department ON department.id = member.department_id
       LEFT JOIN hr_role_assignments assignment
         ON assignment.team_member_id = member.id AND assignment.effective_to IS NULL
       LEFT JOIN hr_role_profile_versions role_version
         ON role_version.id = assignment.role_profile_version_id
       LEFT JOIN hr_role_profiles profile ON profile.id = role_version.role_profile_id
      WHERE member.is_active = TRUE
      ORDER BY member.name`,
  )

  return { roles, benchmarks, contractExtracts, departmentGoals, roleAssignments, activeMembers }
})
