import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { execute, queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { renderSearchAuthorityPublication } from '~~/server/utils/searchAuthority/publicationRenderer'
import {
  activateSearchAuthorityPublication,
  resolveSearchAuthorityPublicationBucket,
  restoreSearchAuthorityPublicationPointer
} from '~~/server/utils/searchAuthority/publicationStore'

const Body = z.object({ clientId: z.string().uuid() })

interface PublishRow {
  id: string
  client_id: string
  title: string
  slug: string
  status: string
  current_version_id: string
  content_hostname: string | null
  canonical_hostname: string
  body_markdown: string
  excerpt: string
  disclaimer: string
  schema_type: 'Article' | 'FAQPage'
  created_at: string
}

export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const body = Body.safeParse(await readBody(event))
  if (!assetId.success || !body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid publication request' })
  }
  const asset = await queryOne<PublishRow>(`
    SELECT asset.id, asset.client_id, asset.title, asset.slug, asset.status,
      asset.current_version_id, site.content_hostname, site.canonical_hostname,
      version.body_markdown, version.excerpt, version.disclaimer,
      version.schema_type, version.created_at
    FROM search_authority_content_assets asset
    JOIN search_authority_sites site
      ON site.client_id = asset.client_id AND site.id = asset.site_id
    JOIN search_authority_content_versions version
      ON version.client_id = asset.client_id AND version.id = asset.current_version_id
    WHERE asset.id = $1 AND asset.client_id = $2
  `, [assetId.data, body.data.clientId])
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Content asset not found' })
  const user = await requireAgencySearchAuthorityAccess(event, asset.client_id)
  if (asset.status !== 'approved') {
    throw createError({ statusCode: 409, statusMessage: 'Only the current approved version can be published' })
  }
  if (!asset.content_hostname) {
    throw createError({ statusCode: 409, statusMessage: 'A verified content hostname is required before publishing' })
  }
  const bucket = resolveSearchAuthorityPublicationBucket(event)
  if (!bucket) throw createError({ statusCode: 503, statusMessage: 'Publication storage is unavailable' })

  const [sources, claims, tracking] = await Promise.all([
    queryRows<{ name: string, role: string }>(`
      SELECT interviewee_name AS name, interviewee_role AS role
      FROM search_authority_source_interviews interview
      JOIN search_authority_content_versions version
        ON version.client_id = interview.client_id AND version.id = $3
      WHERE interview.client_id = $1 AND interview.asset_id = $2
        AND interview.id = ANY(version.source_interview_ids)
      ORDER BY occurred_at DESC
    `, [asset.client_id, asset.id, asset.current_version_id]),
    queryRows<{ claim: string, source_type: string, source_reference: string }>(`
      SELECT claim, source_type, source_reference
      FROM search_authority_version_claims
      WHERE client_id = $1 AND version_id = $2
      ORDER BY created_at
    `, [asset.client_id, asset.current_version_id]),
    queryOne<{ write_key: string }>(`
      SELECT write_key FROM tracking_sites
      WHERE client_id = $1 AND is_active = TRUE
        AND (cardinality(allowed_origins) = 0 OR $2 = ANY(allowed_origins))
      ORDER BY updated_at DESC
      LIMIT 1
    `, [asset.client_id, `https://${asset.content_hostname}`])
  ])
  const activatedAt = new Date().toISOString()
  const publication = await transaction(async (db) => {
    const result = await db.query(`INSERT INTO search_authority_publications (
      client_id, asset_id, version_id, status, measurement_enabled
    ) VALUES ($1, $2, $3, 'pending', $4) RETURNING id`, [
      asset.client_id, asset.id, asset.current_version_id, Boolean(tracking)
    ])
    return result.rows[0] as { id: string }
  })
  const rendered = renderSearchAuthorityPublication({
    hostname: asset.content_hostname,
    slug: asset.slug,
    title: asset.title,
    excerpt: asset.excerpt,
    bodyMarkdown: asset.body_markdown,
    disclaimer: asset.disclaimer,
    schemaType: asset.schema_type,
    versionId: asset.current_version_id,
    publishedAt: activatedAt,
    sourceLabels: sources,
    claims: claims.map(claim => ({
      claim: claim.claim,
      sourceType: claim.source_type,
      sourceReference: claim.source_reference
    })),
    dealershipUrl: `https://${asset.canonical_hostname}/`,
    publicationId: publication.id,
    tracking: tracking
      ? { origin: 'https://app.xeroflow.io', writeKey: tracking.write_key }
      : null
  })

  let activation: Awaited<ReturnType<typeof activateSearchAuthorityPublication>>
  try {
    activation = await activateSearchAuthorityPublication(bucket, {
      hostname: asset.content_hostname,
      assetId: asset.id,
      versionId: asset.current_version_id,
      publicationId: publication.id,
      slug: asset.slug,
      rendered,
      activatedAt
    })
  } catch (error: unknown) {
    await execute(`UPDATE search_authority_publications SET status = 'failed' WHERE id = $1 AND client_id = $2`, [
      publication.id, asset.client_id
    ])
    throw error
  }

  try {
    await transaction(async (db) => {
      await db.query(`UPDATE search_authority_publications SET
        status = 'published', public_url = $3, manifest_version = $4,
        published_by = $5, published_at = $6
        WHERE id = $1 AND client_id = $2`, [publication.id, asset.client_id,
        rendered.canonicalUrl, activation.manifestVersion, user.id, activatedAt])
      await db.query(`UPDATE search_authority_content_assets SET
        status = 'published', updated_at = NOW()
        WHERE id = $1 AND client_id = $2 AND current_version_id = $3`, [
        asset.id, asset.client_id, asset.current_version_id
      ])
      await db.query(`INSERT INTO search_authority_content_audit_events (
        client_id, asset_id, version_id, actor_id, actor_type, event_type, details
      ) VALUES ($1, $2, $3, $4, 'agency', 'publication.published', $5::jsonb)`, [
        asset.client_id, asset.id, asset.current_version_id, user.id,
        JSON.stringify({ publicationId: publication.id, manifestVersion: activation.manifestVersion, publicUrl: rendered.canonicalUrl })
      ])
    })
  } catch (error: unknown) {
    await restoreSearchAuthorityPublicationPointer(bucket, {
      hostname: asset.content_hostname,
      targetManifestVersion: activation.previousManifestVersion,
      restoredAt: new Date().toISOString()
    })
    await execute(`UPDATE search_authority_publications SET status = 'failed' WHERE id = $1 AND client_id = $2`, [
      publication.id, asset.client_id
    ])
    throw error
  }
  return {
    ok: true,
    publicationId: publication.id,
    versionId: asset.current_version_id,
    manifestVersion: activation.manifestVersion,
    publicUrl: rendered.canonicalUrl
  }
})
