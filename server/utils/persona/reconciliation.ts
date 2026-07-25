import { queryOne, queryRows, transaction } from '~~/server/utils/db'

export type IdentityCaseType = 'conflict' | 'merge' | 'split' | 'link_review'
export type IdentityCaseAction = 'start_review' | 'approve' | 'reject' | 'apply' | 'rollback'

export interface IdentityResolutionMapping {
  sourceProfileId: string
  resolvedProfileId: string
  subjectType?: string
  subjectId?: string
}

interface CaseRow {
  id: string
  caseType: IdentityCaseType
  primaryProfileId: string | null
  secondaryProfileId: string | null
  status: string
  riskLevel: string
  title: string
  reason: string
  evidence: Record<string, unknown>
  proposedBy: string
  reviewedBy: string | null
  reviewedAt: string | null
  appliedAt: string | null
  createdAt: string
  updatedAt: string
}

const CASE_SELECT = `
  SELECT identity_case.id,
         identity_case.case_type AS "caseType",
         identity_case.primary_profile_id AS "primaryProfileId",
         identity_case.secondary_profile_id AS "secondaryProfileId",
         identity_case.status,
         identity_case.risk_level AS "riskLevel",
         identity_case.title,
         identity_case.reason,
         identity_case.evidence,
         identity_case.proposed_by AS "proposedBy",
         identity_case.reviewed_by AS "reviewedBy",
         identity_case.reviewed_at AS "reviewedAt",
         identity_case.applied_at AS "appliedAt",
         identity_case.created_at AS "createdAt",
         identity_case.updated_at AS "updatedAt"
    FROM crm_identity_resolution_cases identity_case`

export async function getIdentityReconciliationSnapshot(clientId: string) {
  const [summary, cases, recentConflicts] = await Promise.all([
    queryOne<{
      profiles: string
      identity_keys: string
      linked_leads: string
      leads_without_identity: string
      anonymous_signals: string
      unlinked_consent: string
      unmatched_submissions: string
      conflict_evidence: string
      open_cases: string
      applied_resolutions: string
    }>(
      `SELECT
         (SELECT COUNT(*) FROM crm_identity_profiles WHERE client_id = $1)::text AS profiles,
         (SELECT COUNT(*) FROM crm_identity_keys WHERE client_id = $1)::text AS identity_keys,
         (SELECT COUNT(*) FROM crm_lead_identity_links WHERE client_id = $1)::text AS linked_leads,
         (SELECT COUNT(*)
            FROM leads lead
           WHERE lead.client_id = $1
             AND lead.deleted_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM crm_lead_identity_links identity_link
                WHERE identity_link.client_id = lead.client_id
                  AND identity_link.lead_id = lead.id
             ))::text AS leads_without_identity,
         (SELECT COUNT(*) FROM crm_customer_signals
           WHERE client_id = $1 AND profile_id IS NULL)::text AS anonymous_signals,
         (SELECT COUNT(*) FROM crm_consent_history
           WHERE client_id = $1 AND profile_id IS NULL)::text AS unlinked_consent,
         (SELECT COUNT(*) FROM lead_submission_intents
           WHERE client_id = $1
             AND match_status IN ('pending', 'reserved')
             AND matched_lead_id IS NULL
             AND occurred_at < NOW() - INTERVAL '15 minutes')::text AS unmatched_submissions,
         (SELECT COUNT(*) FROM crm_identity_evidence
           WHERE client_id = $1 AND evidence_type = 'identity_conflict')::text AS conflict_evidence,
         (SELECT COUNT(*) FROM crm_identity_resolution_cases
           WHERE client_id = $1 AND status IN ('open', 'in_review', 'approved'))::text AS open_cases,
         (SELECT COUNT(DISTINCT case_id) FROM crm_identity_current_resolution
           WHERE client_id = $1)::text AS applied_resolutions`,
      [clientId]
    ),
    queryRows<CaseRow>(
      `${CASE_SELECT}
        WHERE identity_case.client_id = $1
        ORDER BY
          CASE identity_case.status
            WHEN 'open' THEN 1 WHEN 'in_review' THEN 2 WHEN 'approved' THEN 3
            ELSE 4
          END,
          identity_case.created_at DESC
        LIMIT 100`,
      [clientId]
    ),
    queryRows<{
      profileId: string
      source: string
      sourceId: string
      occurredAt: string
    }>(
      `SELECT profile_id AS "profileId",
              source,
              source_id AS "sourceId",
              occurred_at AS "occurredAt"
         FROM crm_identity_evidence
        WHERE client_id = $1
          AND evidence_type = 'identity_conflict'
        ORDER BY occurred_at DESC
        LIMIT 20`,
      [clientId]
    )
  ])

  const numberValue = (value: string | undefined) => Number(value) || 0
  const metrics = {
    profiles: numberValue(summary?.profiles),
    identityKeys: numberValue(summary?.identity_keys),
    linkedLeads: numberValue(summary?.linked_leads),
    leadsWithoutIdentity: numberValue(summary?.leads_without_identity),
    anonymousSignals: numberValue(summary?.anonymous_signals),
    unlinkedConsent: numberValue(summary?.unlinked_consent),
    unmatchedSubmissions: numberValue(summary?.unmatched_submissions),
    conflictEvidence: numberValue(summary?.conflict_evidence),
    openCases: numberValue(summary?.open_cases),
    appliedResolutions: numberValue(summary?.applied_resolutions)
  }

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    healthy: metrics.leadsWithoutIdentity === 0
      && metrics.unmatchedSubmissions === 0
      && metrics.openCases === 0,
    cases,
    recentConflicts
  }
}

export async function createIdentityResolutionCase(input: {
  clientId: string
  caseType: IdentityCaseType
  primaryProfileId?: string
  secondaryProfileId?: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  title: string
  reason: string
  evidence: Record<string, unknown>
  actorId: string
}) {
  const profileIds = [...new Set([
    input.primaryProfileId,
    input.secondaryProfileId
  ].filter((value): value is string => Boolean(value)))]
  if (!profileIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one profile is required' })
  }
  const owned = await queryRows<{ id: string }>(
    `SELECT id FROM crm_identity_profiles
      WHERE client_id = $1 AND id = ANY($2::uuid[])`,
    [input.clientId, profileIds]
  )
  if (owned.length !== profileIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'Identity profile not found' })
  }
  if (
    input.primaryProfileId
    && input.primaryProfileId === input.secondaryProfileId
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Profiles must be different' })
  }

  return transaction(async db => {
    const result = await db.query(
      `INSERT INTO crm_identity_resolution_cases (
         client_id, case_type, primary_profile_id, secondary_profile_id,
         risk_level, title, reason, evidence, proposed_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING id, status, created_at`,
      [
        input.clientId,
        input.caseType,
        input.primaryProfileId ?? null,
        input.secondaryProfileId ?? null,
        input.riskLevel,
        input.title,
        input.reason,
        JSON.stringify(input.evidence),
        input.actorId
      ]
    )
    const created = result.rows?.[0] as {
      id: string
      status: string
      created_at: string
    } | undefined
    if (!created) throw new Error('Identity resolution case was not created')
    await db.query(
      `INSERT INTO crm_identity_resolution_audit (
         client_id, case_id, action, actor_id, reason
       ) VALUES ($1, $2, 'created', $3, $4)`,
      [input.clientId, created.id, input.actorId, input.reason]
    )
    return {
      id: created.id,
      status: created.status,
      createdAt: created.created_at
    }
  })
}

async function validateMappings(
  db: { query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }> },
  clientId: string,
  mappings: IdentityResolutionMapping[]
) {
  if (!mappings.length) {
    throw createError({ statusCode: 400, statusMessage: 'Resolution mappings are required' })
  }
  const ids = [...new Set(mappings.flatMap(mapping => [
    mapping.sourceProfileId,
    mapping.resolvedProfileId
  ]))]
  const result = await db.query(
    `SELECT id FROM crm_identity_profiles
      WHERE client_id = $1 AND id = ANY($2::uuid[])`,
    [clientId, ids]
  )
  if ((result.rows?.length ?? 0) !== ids.length) {
    throw createError({ statusCode: 404, statusMessage: 'Resolution profile not found' })
  }
}

export async function transitionIdentityResolutionCase(input: {
  clientId: string
  caseId: string
  action: IdentityCaseAction
  reason: string
  actorId: string
  mappings?: IdentityResolutionMapping[]
}) {
  return transaction(async db => {
    const result = await db.query(
      `SELECT id, case_type, status, proposed_by, reviewed_by
         FROM crm_identity_resolution_cases
        WHERE client_id = $1 AND id = $2
        FOR UPDATE`,
      [input.clientId, input.caseId]
    )
    const identityCase = result.rows?.[0] as {
      id: string
      case_type: IdentityCaseType
      status: string
      proposed_by: string
      reviewed_by: string | null
    } | undefined
    if (!identityCase) {
      throw createError({ statusCode: 404, statusMessage: 'Identity resolution case not found' })
    }

    let status = identityCase.status
    let auditAction: string
    if (input.action === 'start_review') {
      if (status !== 'open') throw createError({ statusCode: 409, statusMessage: 'Case is not open' })
      status = 'in_review'
      auditAction = 'review_started'
    } else if (input.action === 'approve') {
      if (!['open', 'in_review'].includes(status)) {
        throw createError({ statusCode: 409, statusMessage: 'Case cannot be approved' })
      }
      if (identityCase.proposed_by === input.actorId) {
        throw createError({ statusCode: 409, statusMessage: 'A different owner or admin must approve this case' })
      }
      status = 'approved'
      auditAction = 'approved'
    } else if (input.action === 'reject') {
      if (!['open', 'in_review', 'approved'].includes(status)) {
        throw createError({ statusCode: 409, statusMessage: 'Case cannot be rejected' })
      }
      status = 'rejected'
      auditAction = 'rejected'
    } else if (input.action === 'apply') {
      if (status !== 'approved') {
        throw createError({ statusCode: 409, statusMessage: 'Approval is required before applying a resolution' })
      }
      if (!['merge', 'split'].includes(identityCase.case_type)) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Only merge and split identity cases can be applied'
        })
      }
      const mappings = input.mappings ?? []
      await validateMappings(db, input.clientId, mappings)
      const versionResult = await db.query(
        `INSERT INTO crm_identity_resolution_versions (
           client_id, case_id, version, operation, reason, created_by
         )
         SELECT $1, $2, COALESCE(MAX(version), 0) + 1, $3, $4, $5
           FROM crm_identity_resolution_versions
          WHERE client_id = $1 AND case_id = $2
         RETURNING id, version`,
        [
          input.clientId,
          input.caseId,
          identityCase.case_type === 'split' ? 'split' : 'merge',
          input.reason,
          input.actorId
        ]
      )
      const version = versionResult.rows?.[0] as { id: string, version: number } | undefined
      if (!version) throw new Error('Identity resolution version was not created')
      for (const mapping of mappings) {
        await db.query(
          `INSERT INTO crm_identity_resolution_members (
             client_id, resolution_version_id, source_profile_id,
             resolved_profile_id, subject_type, subject_id, relationship
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            input.clientId,
            version.id,
            mapping.sourceProfileId,
            mapping.resolvedProfileId,
            mapping.subjectType ?? null,
            mapping.subjectId ?? null,
            identityCase.case_type === 'split'
              ? 'split'
              : mapping.sourceProfileId === mapping.resolvedProfileId
                ? 'canonical'
                : 'merged'
          ]
        )
      }
      status = 'applied'
      auditAction = 'applied'
    } else {
      if (status !== 'applied') {
        throw createError({ statusCode: 409, statusMessage: 'Only an applied case can be rolled back' })
      }
      const membersResult = await db.query(
        `SELECT DISTINCT member.source_profile_id, member.subject_type, member.subject_id
           FROM crm_identity_resolution_members member
           JOIN crm_identity_resolution_versions version
             ON version.client_id = member.client_id
            AND version.id = member.resolution_version_id
          WHERE version.client_id = $1 AND version.case_id = $2`,
        [input.clientId, input.caseId]
      )
      const sourceIds = (membersResult.rows ?? []) as Array<{
        source_profile_id: string
        subject_type: string | null
        subject_id: string | null
      }>
      const versionResult = await db.query(
        `INSERT INTO crm_identity_resolution_versions (
           client_id, case_id, version, operation, reason, created_by
         )
         SELECT $1, $2, COALESCE(MAX(version), 0) + 1, 'rollback', $3, $4
           FROM crm_identity_resolution_versions
          WHERE client_id = $1 AND case_id = $2
         RETURNING id`,
        [input.clientId, input.caseId, input.reason, input.actorId]
      )
      const versionId = (versionResult.rows?.[0] as { id: string } | undefined)?.id
      if (!versionId) throw new Error('Identity rollback version was not created')
      for (const source of sourceIds) {
        await db.query(
          `INSERT INTO crm_identity_resolution_members (
             client_id, resolution_version_id, source_profile_id,
             resolved_profile_id, subject_type, subject_id, relationship
           ) VALUES ($1, $2, $3, $3, $4, $5, 'restored')`,
          [
            input.clientId,
            versionId,
            source.source_profile_id,
            source.subject_type,
            source.subject_id
          ]
        )
      }
      status = 'rolled_back'
      auditAction = 'rolled_back'
    }

    await db.query(
      `UPDATE crm_identity_resolution_cases
          SET status = $3,
              reviewed_by = CASE
                WHEN $3 IN ('approved', 'rejected') THEN $4
                ELSE reviewed_by
              END,
              reviewed_at = CASE
                WHEN $3 IN ('approved', 'rejected') THEN NOW()
                ELSE reviewed_at
              END,
              applied_at = CASE WHEN $3 = 'applied' THEN NOW() ELSE applied_at END,
              updated_at = NOW()
        WHERE client_id = $1 AND id = $2`,
      [input.clientId, input.caseId, status, input.actorId]
    )
    await db.query(
      `INSERT INTO crm_identity_resolution_audit (
         client_id, case_id, action, actor_id, reason,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.clientId,
        input.caseId,
        auditAction,
        input.actorId,
        input.reason,
        JSON.stringify({ mappingCount: input.mappings?.length ?? 0 })
      ]
    )
    return { id: input.caseId, status }
  })
}
