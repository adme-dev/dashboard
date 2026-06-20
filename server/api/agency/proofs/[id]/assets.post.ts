/**
 * Upload Proof Assets
 * POST /api/agency/proofs/:id/assets
 *
 * Accepts multipart form data with files, or JSON body with pre-uploaded file URLs.
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { maybeCaptionProofAssets } from '~~/server/utils/ai/visuals/trigger'

interface AssetBody {
  fileName: string
  fileType: string
  fileSize: number
  fileUrl: string
  thumbnailUrl?: string
  dimensions?: { width: number, height: number }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const proofId = getRouterParam(event, 'id')

  if (!proofId) {
    throw createError({ statusCode: 400, statusMessage: 'Proof ID is required' })
  }

  const body = await readBody<{ assets: AssetBody[] }>(event)

  if (!body.assets || !Array.isArray(body.assets) || body.assets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one asset is required' })
  }

  try {
    // Verify proof exists
    const proof = await queryOne(`SELECT id FROM creative_proofs WHERE id = $1`, [proofId])
    if (!proof) {
      throw createError({ statusCode: 404, statusMessage: 'Proof not found' })
    }

    // Get current max sort order
    const maxSort = await queryOne(`
      SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM proof_assets WHERE proof_id = $1
    `, [proofId])
    let sortOrder = (maxSort?.max_sort || 0) + 1

    const created: any[] = []
    for (const asset of body.assets) {
      if (!asset.fileName || !asset.fileUrl) continue

      const row = await queryOne(`
        INSERT INTO proof_assets (proof_id, file_name, file_type, file_size, file_url, thumbnail_url, dimensions, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        proofId,
        asset.fileName,
        asset.fileType || 'application/octet-stream',
        asset.fileSize || 0,
        asset.fileUrl,
        asset.thumbnailUrl || null,
        asset.dimensions ? JSON.stringify(asset.dimensions) : null,
        sortOrder++
      ])
      created.push(row)
    }

    // Log activity
    await queryOne(`
      INSERT INTO proof_activities (proof_id, actor_type, team_member_id, activity_type, description)
      VALUES ($1, 'team_member', $2, 'asset_uploaded', $3)
    `, [proofId, user.id, `${created.length} asset(s) uploaded`])

    // Visuals → Knowledge (dormant behind VISUALS_TO_KNOWLEDGE_ENABLED): caption new image assets into
    // unpublished KB drafts, fire-and-forget so it never blocks or breaks the upload. No-op off-edge.
    maybeCaptionProofAssets(event, created, user.id)

    return {
      success: true,
      assets: created.map(a => ({
        id: a.id,
        fileName: a.file_name,
        fileType: a.file_type,
        fileSize: a.file_size,
        fileUrl: a.file_url,
        thumbnailUrl: a.thumbnail_url,
        sortOrder: a.sort_order
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to upload assets:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload assets' })
  }
})
