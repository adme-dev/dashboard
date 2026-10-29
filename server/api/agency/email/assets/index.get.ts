import { requireAuth } from '~~/server/utils/auth'
import { queryRowsFresh } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import { addEmailClientScopeCondition, resolveEmailClientScope } from '~~/server/utils/email-marketing/access'
import { EMAIL_IMAGE_ASSET_MIME_TYPES } from '~~/app/utils/edmImageAssets'
import { bannerAssetDeliveryUrl, isBannerAssetDeliveryKey } from '~~/server/utils/bannerStorage'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'

interface EmailImageAssetRow {
  id: string
  r2Key: string
  url: string
  uploadedBy: string
}

function canUseBannerAssetDelivery(asset: EmailImageAssetRow): boolean {
  return typeof asset.id === 'string'
    && typeof asset.r2Key === 'string'
    && typeof asset.uploadedBy === 'string'
    && isBannerAssetDeliveryKey(asset.r2Key, asset.uploadedBy)
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const clientIds = await resolveEmailClientScope(event, user)

  const params: unknown[] = [EMAIL_IMAGE_ASSET_MIME_TYPES]
  const conditions = ['mime_type = ANY($1::text[])']
  addEmailClientScopeCondition(conditions, params, 'client_id', clientIds)
  let sql = `
    SELECT
      id,
      name,
      mime_type AS "mimeType",
      file_size AS "fileSize",
      r2_key AS "r2Key",
      url,
      thumbnail_url AS "thumbnailUrl",
      tags,
      uploaded_by AS "uploadedBy",
      client_id AS "clientId",
      created_at AS "createdAt"
    FROM banner_assets
    WHERE ${conditions.join(' AND ')}
  `

  if (search) {
    params.push(`%${search}%`)
    sql += ` AND name ILIKE $${params.length}`
  }

  sql += ' ORDER BY created_at DESC LIMIT 120'
  const assets = await queryRowsFresh<EmailImageAssetRow>(sql, params)
  const projectable = assets.filter(canUseBannerAssetDelivery)
  if (projectable.length === 0) return { assets }

  const { signingSecret } = resolveBannerAssetDelivery(event)
  if (!signingSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
  }

  const origin = getAppUrl(event)
  const signedUrls = new Map<string, string>()
  for (const asset of projectable) {
    signedUrls.set(asset.id, await bannerAssetDeliveryUrl(asset.id, origin, signingSecret))
  }

  return {
    assets: assets.map(asset => {
      const url = signedUrls.get(asset.id)
      return url ? { ...asset, url } : asset
    })
  }
})
