import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { queryOne, transaction } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { executeSearchAuthorityExternalMutation } from '~~/server/utils/searchAuthority/godModeMutations'
import {
  getCurrentSearchAuthorityManifest,
  resolveSearchAuthorityPublicationBucket,
  rollbackSearchAuthorityPublication
} from '~~/server/utils/searchAuthority/publicationStore'

const Body = z.object({
  clientId: z.string().uuid(),
  targetPublicationId: z.string().uuid(),
  rationale: z.string().trim().min(5).max(2000)
})

interface RollbackRow {
  client_id: string
  content_hostname: string | null
  version_id: string
  manifest_version: string | null
  public_url: string | null
  measurement_enabled: boolean
}

export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const body = Body.safeParse(await readBody(event))
  if (!assetId.success || !body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid rollback request' })
  }
  const user = await requireAgencySearchAuthorityAccess(event, body.data.clientId)
  const target = await queryOne<RollbackRow>(`
    SELECT publication.client_id, site.content_hostname, publication.version_id,
      publication.manifest_version, publication.public_url, publication.measurement_enabled
    FROM search_authority_publications publication
    JOIN search_authority_content_assets asset
      ON asset.client_id = publication.client_id AND asset.id = publication.asset_id
    JOIN search_authority_sites site
      ON site.client_id = asset.client_id AND site.id = asset.site_id
    WHERE publication.id = $1 AND publication.asset_id = $2
      AND publication.client_id = $3 AND publication.status IN ('published', 'rolled_back')
  `, [body.data.targetPublicationId, assetId.data, body.data.clientId])
  if (!target?.content_hostname || !target.manifest_version) {
    throw createError({ statusCode: 404, statusMessage: 'Rollback publication not found' })
  }
  const bucket = resolveSearchAuthorityPublicationBucket(event)
  if (!bucket) throw createError({ statusCode: 503, statusMessage: 'Publication storage is unavailable' })
  const hostname = target.content_hostname
  const manifestVersion = target.manifest_version

  type RollbackResult = { ok: true, publicationId: string, targetPublicationId: string, versionId: string, manifestVersion: string, publicUrl: string | null }
  return executeSearchAuthorityExternalMutation<RollbackResult>(event, 'rollback', async (run) => {
    if (run.replay && run.replayResult) return run.replayResult
    const previous = await getCurrentSearchAuthorityManifest(bucket, hostname)
    const rolledBackAt = new Date().toISOString()
    await rollbackSearchAuthorityPublication(bucket, {
      hostname,
      targetManifestVersion: manifestVersion,
      rolledBackAt
    })
    await run.markDispatched()
    let activationPublicationId: string
    try {
      activationPublicationId = await transaction(async (db) => {
        await db.query(`UPDATE search_authority_publications SET status = 'rolled_back'
        WHERE client_id = $1 AND asset_id = $2 AND status = 'published'`, [target.client_id, assetId.data])
        const activation = await db.query<{ id: string }>(`INSERT INTO search_authority_publications (
        id, client_id, asset_id, version_id, status, public_url, manifest_version,
        measurement_enabled, published_by, published_at
      ) VALUES ($1, $2, $3, $4, 'published', $5, $6, $7, $8, $9)
      RETURNING id`, [run.ids[0], target.client_id, assetId.data, target.version_id,
          target.public_url, manifestVersion, target.measurement_enabled, user.id, rolledBackAt])
        const active = activation.rows[0]
        if (!active) throw new Error('Rollback activation could not be recorded')
        await db.query(`UPDATE search_authority_content_assets SET
        status = 'published', current_version_id = $3, updated_at = NOW()
        WHERE id = $1 AND client_id = $2`, [assetId.data, target.client_id, target.version_id])
        await db.query(`INSERT INTO search_authority_content_audit_events (
        client_id, asset_id, version_id, actor_id, actor_type, event_type, details
      ) VALUES ($1, $2, $3, $4, 'agency', 'publication.rolled_back', $5::jsonb)`, [
          target.client_id, assetId.data, target.version_id, user.id,
          JSON.stringify({ targetPublicationId: body.data.targetPublicationId, activationPublicationId: active.id, manifestVersion, rationale: body.data.rationale })
        ])
        return active.id
      })
    } catch (error: unknown) {
      if (previous) {
        await rollbackSearchAuthorityPublication(bucket, {
          hostname,
          targetManifestVersion: previous.manifestVersion,
          rolledBackAt: new Date().toISOString()
        })
      }
      throw error
    }
    return {
      ok: true,
      publicationId: activationPublicationId,
      targetPublicationId: body.data.targetPublicationId,
      versionId: target.version_id,
      manifestVersion,
      publicUrl: target.public_url
    }
  })
})
