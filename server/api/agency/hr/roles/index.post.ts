import { createError, readBody, setHeader } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { buildBenchmarkScorecard } from '~~/server/utils/hr/benchmark'
import { buildRoleQuestionnaire } from '~~/server/utils/hr/questionnaire'
import { hrRoleProfileSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = hrRoleProfileSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role profile', data: { issues: parsed.error.issues } })
  }

  const input = parsed.data
  const questions = buildRoleQuestionnaire(input.responsibilities)
  const scorecard = buildBenchmarkScorecard(input)
  const status = input.publish ? 'published' : 'draft'

  const result = await transaction(async (db) => {
    const benchmark = await db.query(
      `SELECT id, framework_key, name, publisher, version, source_url
       FROM hr_benchmark_frameworks
       WHERE framework_key = $1 AND status = 'active'
       ORDER BY reviewed_at DESC NULLS LAST LIMIT 1`,
      [input.benchmarkKey],
    )
    if (!benchmark.rows[0]) throw new Error('Selected benchmark framework is unavailable')

    let contractSource: Record<string, unknown> | null = null
    if (input.contractExtractId) {
      const extract = await db.query(
        `SELECT extract.id, document.id AS contract_document_id,
                document.team_member_id, document.version
         FROM hr_contract_role_extracts extract
         JOIN hr_contract_documents document ON document.id = extract.contract_document_id
         WHERE extract.id = $1 AND extract.status = 'approved' AND document.status = 'approved'`,
        [input.contractExtractId],
      )
      if (!extract.rows[0]) throw new Error('Selected contract role extract is not approved')
      contractSource = {
        type: 'approved_contract_role_extract',
        extractId: extract.rows[0].id,
        contractDocumentId: extract.rows[0].contract_document_id,
        contractVersion: extract.rows[0].version,
        teamMemberId: extract.rows[0].team_member_id,
      }
    }

    const profile = await db.query(
      `INSERT INTO hr_role_profiles (title, department, status, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, department, status`,
      [input.title, input.department || null, input.publish ? 'active' : 'draft', user.id],
    )

    const benchmarkRef = benchmark.rows[0]
    const version = await db.query(
      `INSERT INTO hr_role_profile_versions
        (role_profile_id, version, purpose, responsibilities, expected_outcomes,
         decision_authority, dependencies, out_of_scope, benchmark_refs, source_refs, status,
         published_by, published_at)
       VALUES ($1, 1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb,
               $8::jsonb, $9::jsonb, $10, $11, CASE WHEN $10 = 'published' THEN NOW() ELSE NULL END)
       RETURNING id, version, status, published_at`,
      [
        profile.rows[0].id,
        input.purpose,
        JSON.stringify(input.responsibilities),
        JSON.stringify(input.expectedOutcomes),
        JSON.stringify(input.decisionAuthority),
        JSON.stringify(input.dependencies),
        JSON.stringify(input.outOfScope),
        JSON.stringify([benchmarkRef]),
        JSON.stringify(contractSource ? [contractSource] : []),
        status,
        input.publish ? user.id : null,
      ],
    )

    for (const [index, kpi] of input.kpis.entries()) {
      const slug = kpi.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'kpi'
      const kpiResult = await db.query(
        `INSERT INTO hr_role_kpi_definitions
          (role_profile_version_id, kpi_key, name, description, unit, direction,
           target_value, target_min, target_max, target_description, cadence,
           source_type, source_ref, data_owner, weight, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id`,
        [
          version.rows[0].id, `${index + 1}-${slug}`, kpi.name, kpi.description || null,
          kpi.unit, kpi.direction, kpi.targetValue ?? null, kpi.targetMin ?? null,
          kpi.targetMax ?? null, kpi.targetDescription || null, kpi.cadence,
          kpi.sourceType, kpi.sourceRef, kpi.dataOwner || null, kpi.weight,
          input.publish ? 'active' : 'draft',
        ],
      )
      if (kpi.departmentGoalVersionId) {
        const goal = await db.query(
          `SELECT version.id
           FROM hr_department_goal_versions version
           JOIN hr_department_goals goal ON goal.id = version.goal_id
           WHERE version.id = $1 AND version.status = 'published' AND goal.status = 'active'`,
          [kpi.departmentGoalVersionId],
        )
        if (!goal.rows[0]) throw new Error(`Department goal for KPI “${kpi.name}” is not published`)
        await db.query(
          `INSERT INTO hr_role_kpi_goal_links
            (kpi_definition_id, department_goal_version_id, contribution_weight, rationale, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [kpiResult.rows[0].id, kpi.departmentGoalVersionId, kpi.goalContributionWeight, kpi.goalRationale || null, user.id],
        )
      }
    }

    await db.query(
      `INSERT INTO hr_role_scorecard_versions
        (role_profile_version_id, version, criteria, evidence_threshold, status, published_by, published_at)
       VALUES ($1, 1, $2::jsonb, 70, $3, $4,
               CASE WHEN $3 = 'published' THEN NOW() ELSE NULL END)`,
      [version.rows[0].id, JSON.stringify(scorecard), status, input.publish ? user.id : null],
    )

    await db.query(
      `INSERT INTO hr_questionnaire_versions
        (template_key, name, version, purpose, questions, quality_report, source_refs,
         status, published_by, published_at)
       VALUES ($1, $2, 1, 'role_business_review', $3::jsonb,
               $4::jsonb, $5::jsonb, $6, $7,
               CASE WHEN $6 = 'published' THEN NOW() ELSE NULL END)`,
      [
        `role-${profile.rows[0].id}`,
        `${input.title} business review`,
        JSON.stringify(questions),
        JSON.stringify({ publishable: true, issueCount: 0 }),
        JSON.stringify([benchmarkRef]),
        status,
        input.publish ? user.id : null,
      ],
    )

    const result = { profile: profile.rows[0], version: version.rows[0], questionCount: questions.length, kpiCount: input.kpis.length, scorecard }
    await recordHrAuditEvent({
      actorId: user.id,
      action: input.publish ? 'role_profile.published' : 'role_profile.created',
      targetType: 'role_profile',
      targetId: result.profile.id,
      metadata: { benchmarkKey: input.benchmarkKey, questionCount: result.questionCount, kpiCount: result.kpiCount },
    }, db)
    return result
  })

  return { ok: true, ...result }
})
