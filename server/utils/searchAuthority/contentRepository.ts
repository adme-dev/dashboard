import type { ContentAssetInput, ContentVersionInput } from '~~/server/utils/searchAuthority/contentContracts'
import { contentAssetInputSchema, contentVersionInputSchema } from '~~/server/utils/searchAuthority/contentContracts'

interface Db {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}

interface CreateVersionInput extends ContentVersionInput {
  clientId: string
  assetId: string
  actorId: string
}

interface DecisionInput {
  clientId: string
  assetId: string
  versionId: string
  actorId: string
  rationale: string
}

export async function createContentAsset(db: Db, input: ContentAssetInput & {
  clientId: string
  siteId: string
  actorId: string
}) {
  const parsed = contentAssetInputSchema.parse(input)
  const asset = (await db.query(`INSERT INTO search_authority_content_assets (
    client_id, site_id, opportunity_id, task_id, slug, title, topic, created_by
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status`, [
    input.clientId, input.siteId, parsed.opportunityId ?? null, parsed.taskId ?? null,
    parsed.slug, parsed.title, parsed.topic, input.actorId
  ])).rows[0]
  if (!asset) throw new Error('Content asset insert returned no row')
  const interview = (await db.query(`INSERT INTO search_authority_source_interviews (
    client_id, asset_id, interviewee_name, interviewee_role, occurred_at,
    source_summary, consent_confirmed, recorded_by
  ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7) RETURNING id`, [
    input.clientId, asset.id, parsed.interview.intervieweeName, parsed.interview.intervieweeRole,
    parsed.interview.occurredAt, parsed.interview.sourceSummary, input.actorId
  ])).rows[0]
  if (!interview) throw new Error('Source interview insert returned no row')
  await audit(db, { ...input, assetId: String(asset.id) }, '', 'asset.created', { interviewId: interview.id })
  return { id: String(asset.id), status: String(asset.status), interviewId: String(interview.id) }
}

export async function createContentVersion(db: Db, input: CreateVersionInput) {
  const parsed = contentVersionInputSchema.parse(input)
  const asset = (await db.query(`
    SELECT id, status FROM search_authority_content_assets
    WHERE id = $1 AND client_id = $2 FOR UPDATE
  `, [input.assetId, input.clientId])).rows[0]
  if (!asset) throw new Error('Content asset not found')
  if (asset.status === 'archived') throw new Error('Archived content cannot be edited')

  const sourceCount = (await db.query(`
    SELECT COUNT(*) AS source_count
    FROM search_authority_source_interviews
    WHERE client_id = $1 AND asset_id = $2 AND id = ANY($3::uuid[])
  `, [input.clientId, input.assetId, parsed.sourceInterviewIds])).rows[0]
  if (Number(sourceCount?.source_count ?? 0) !== parsed.sourceInterviewIds.length) {
    throw new Error('Every source interview must belong to this client and content asset')
  }
  if (parsed.sourceVersionId) {
    const sourceVersion = (await db.query(`SELECT id FROM search_authority_content_versions
      WHERE id = $1 AND client_id = $2 AND asset_id = $3`, [
      parsed.sourceVersionId, input.clientId, input.assetId
    ])).rows[0]
    if (!sourceVersion) throw new Error('Source version must belong to this client and content asset')
  }

  const next = (await db.query(`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
    FROM search_authority_content_versions
    WHERE asset_id = $1 AND client_id = $2
  `, [input.assetId, input.clientId])).rows[0]
  const versionNumber = Number(next?.next_version ?? 1)
  const version = (await db.query(`
    INSERT INTO search_authority_content_versions (
      client_id, asset_id, version_number, body_markdown, excerpt, schema_type,
      source_interview_ids, source_version_id, ai_metadata, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8, $9::jsonb, $10)
    RETURNING id, version_number
  `, [input.clientId, input.assetId, versionNumber, parsed.bodyMarkdown, parsed.excerpt,
    parsed.schemaType, parsed.sourceInterviewIds, parsed.sourceVersionId ?? null,
    JSON.stringify(parsed.aiMetadata ?? {}), input.actorId])).rows[0]
  if (!version) throw new Error('Content version insert returned no row')
  const versionId = String(version.id)

  for (const claim of parsed.claims) {
    await db.query(`INSERT INTO search_authority_version_claims (
      client_id, version_id, claim, source_type, source_reference, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6)`, [input.clientId, versionId, claim.claim,
      claim.sourceType, claim.sourceReference, claim.expiresAt])
  }
  await db.query(`UPDATE search_authority_content_assets
    SET current_version_id = $3, status = 'draft', updated_at = NOW()
    WHERE id = $1 AND client_id = $2`, [input.assetId, input.clientId, versionId])
  await audit(db, input, versionId, 'version.created', { versionNumber })
  return { id: versionId, versionNumber: Number(version.version_number) }
}

export async function approveContentVersion(db: Db, input: DecisionInput): Promise<void> {
  const version = (await db.query(`
    SELECT version.id, version.client_id, version.asset_id, version.created_by, asset.status
    FROM search_authority_content_versions version
    JOIN search_authority_content_assets asset
      ON asset.client_id = version.client_id AND asset.id = version.asset_id
    WHERE version.id = $1 AND version.asset_id = $2 AND version.client_id = $3
      AND asset.current_version_id = version.id
    FOR UPDATE OF asset
  `, [input.versionId, input.assetId, input.clientId])).rows[0]
  if (!version) throw new Error('Content version not found')
  if (version.status !== 'in_review') throw new Error('Only a submitted version can be approved')
  if (version.created_by === input.actorId) throw new Error('Authors cannot approve their own content version')
  if (input.rationale.trim().length < 5) throw new Error('Approval rationale is required')

  await db.query(`INSERT INTO search_authority_approval_decisions (
    client_id, asset_id, version_id, decision, rationale, decided_by
  ) VALUES ($1, $2, $3, 'approved', $4, $5)`, [input.clientId, input.assetId,
    input.versionId, input.rationale.trim(), input.actorId])
  await db.query(`UPDATE search_authority_content_assets SET
    status = 'approved', current_version_id = $3, updated_at = NOW()
    WHERE id = $1 AND client_id = $2`, [input.assetId, input.clientId, input.versionId])
  await audit(db, input, input.versionId, 'version.approved', {})
}

export async function submitContentVersion(db: Db, input: Omit<DecisionInput, 'rationale'>): Promise<void> {
  const updated = await db.query(`UPDATE search_authority_content_assets asset SET
    status = 'in_review', current_version_id = $3, updated_at = NOW()
    WHERE asset.id = $1 AND asset.client_id = $2 AND asset.status IN ('draft', 'rejected')
      AND EXISTS (SELECT 1 FROM search_authority_content_versions version
        WHERE version.id = $3 AND version.asset_id = asset.id AND version.client_id = asset.client_id)
    RETURNING asset.id`, [input.assetId, input.clientId, input.versionId])
  if (!updated.rows[0]) throw new Error('Only a current draft version can be submitted')
  await audit(db, input, input.versionId, 'version.submitted', {})
}

export async function rejectContentVersion(db: Db, input: DecisionInput): Promise<void> {
  if (input.rationale.trim().length < 5) throw new Error('Rejection rationale is required')
  const updated = await db.query(`UPDATE search_authority_content_assets asset SET
    status = 'rejected', updated_at = NOW()
    WHERE asset.id = $1 AND asset.client_id = $2 AND asset.status = 'in_review'
      AND asset.current_version_id = $3 RETURNING asset.id`, [input.assetId, input.clientId, input.versionId])
  if (!updated.rows[0]) throw new Error('Only a submitted current version can be rejected')
  await db.query(`INSERT INTO search_authority_approval_decisions (
    client_id, asset_id, version_id, decision, rationale, decided_by
  ) VALUES ($1, $2, $3, 'rejected', $4, $5)`, [input.clientId, input.assetId,
    input.versionId, input.rationale.trim(), input.actorId])
  await audit(db, input, input.versionId, 'version.rejected', {})
}

async function audit(db: Db, input: { clientId: string, assetId: string, actorId: string }, versionId: string, eventType: string, details: object) {
  await db.query(`INSERT INTO search_authority_content_audit_events (
    client_id, asset_id, version_id, actor_id, event_type, details
  ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [input.clientId, input.assetId,
    versionId || null, input.actorId, eventType, JSON.stringify(details)])
}
