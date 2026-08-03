import { getRouterParam } from 'h3'
import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requirePortalSearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

interface PortalContentRow {
  id: string
  title: string
  topic: string
  slug: string
  status: string
  version_id: string
  version_number: number
  body_markdown: string
  excerpt: string
  disclaimer: string
  schema_type: 'Article' | 'FAQPage'
  created_at: string
}

export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!assetId.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid content asset ID' })
  }
  const user = await requirePortalSearchAuthorityAccess(event)
  const content = await queryOne<PortalContentRow>(`
    SELECT asset.id, asset.title, asset.topic, asset.slug, asset.status,
      version.id AS version_id, version.version_number, version.body_markdown,
      version.excerpt, version.disclaimer, version.schema_type, version.created_at
    FROM search_authority_content_assets asset
    JOIN search_authority_content_versions version
      ON version.client_id = asset.client_id AND version.id = asset.current_version_id
    WHERE asset.id = $1 AND asset.client_id = $2
      AND asset.status IN ('in_review', 'approved', 'published')
  `, [assetId.data, user.clientId])
  if (!content) {
    throw createError({ statusCode: 404, statusMessage: 'Content review not found' })
  }

  const [sources, claims] = await Promise.all([
    queryRows<{ name: string, role: string, occurred_at: string }>(`
      SELECT interview.interviewee_name AS name, interview.interviewee_role AS role,
        interview.occurred_at
      FROM search_authority_source_interviews interview
      JOIN search_authority_content_versions version
        ON version.client_id = interview.client_id AND version.id = $3
      WHERE interview.client_id = $1
        AND interview.asset_id = $2
        AND interview.id = ANY(version.source_interview_ids)
      ORDER BY interview.occurred_at DESC
    `, [user.clientId, assetId.data, content.version_id]),
    queryRows<{ claim: string, source_type: string, source_reference: string, expires_at: string | null }>(`
      SELECT claim, source_type, source_reference, expires_at
      FROM search_authority_version_claims
      WHERE client_id = $1 AND version_id = $2
      ORDER BY created_at
    `, [user.clientId, content.version_id])
  ])

  return {
    asset: {
      id: content.id,
      title: content.title,
      topic: content.topic,
      slug: content.slug,
      status: content.status
    },
    version: {
      id: content.version_id,
      versionNumber: content.version_number,
      bodyMarkdown: content.body_markdown,
      excerpt: content.excerpt,
      disclaimer: content.disclaimer,
      schemaType: content.schema_type,
      createdAt: content.created_at
    },
    sourceLabels: sources.map(source => ({
      name: source.name,
      role: source.role,
      occurredAt: source.occurred_at
    })),
    claims: claims.map(claim => ({
      claim: claim.claim,
      sourceType: claim.source_type,
      sourceReference: claim.source_reference,
      expiresAt: claim.expires_at
    })),
    canApprove: user.permissions.canApproveWork && content.status === 'in_review'
  }
})
