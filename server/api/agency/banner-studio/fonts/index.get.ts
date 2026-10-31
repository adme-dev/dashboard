import { queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { hasAllSocialClientAccess, hasSocialClientPermission, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { withBannerFontDelivery } from '~~/server/utils/banner/fontDelivery'
import { FONT_ASSET_SELECT, fontAssetMetadata, type FontAssetRow } from '~~/server/utils/banner/fontAssets'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (!hasSocialClientPermission(user)) throw createError({ statusCode: 403, statusMessage: 'Creative client access required' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  const clientId = getQuery(event).clientId
  if (clientId !== undefined && typeof clientId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
  if (clientId !== undefined && clientId !== '__agency__') await requireSocialClientAccess(event, clientId)
  const params: unknown[] = []
  let scope = ''
  if (clientId === '__agency__') {
    scope = 'AND client_id IS NULL'
  } else if (clientId !== undefined) {
    params.push(clientId)
    scope = 'AND (client_id IS NULL OR client_id = $1::uuid)'
  } else if (!hasAllSocialClientAccess(user)) {
    if (user.permissionGroups?.includes('MARKETING_MANAGEMENT')) {
      if (!await hasFreshMarketingManagementPermission(user.id)) throw createError({ statusCode: 403, statusMessage: 'Marketing permission revoked' })
      scope = 'AND (client_id IS NULL OR EXISTS (SELECT 1 FROM agency_clients c WHERE c.id = banner_assets.client_id AND c.is_active = TRUE))'
    } else {
      params.push(user.id)
      scope = 'AND (client_id IS NULL OR EXISTS (SELECT 1 FROM client_team_assignments a WHERE a.client_id = banner_assets.client_id AND a.team_member_id = $1))'
    }
  }
  const rows = await queryRowsFresh<FontAssetRow>(`SELECT ${FONT_ASSET_SELECT} FROM banner_assets WHERE 'font' = ANY(tags) ${scope} ORDER BY (client_id IS NOT NULL) DESC, created_at DESC, id`, params)
  return (await withBannerFontDelivery(event, rows)).map(fontAssetMetadata)
})
