import { resolveCanvasFonts, fontAssetMetadata } from '~~/server/utils/banner/fontAssets'
import { queryOneFresh } from '~~/server/utils/db'
import { withBannerFontDelivery } from '~~/server/utils/banner/fontDelivery'

/** Public, view-only canvas. Preview tokens cannot read or write review comments. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  const token = getRouterParam(event, 'token')
  if (!token || !/^p_[0-9a-f]{32}$/i.test(token)) throw createError({ statusCode: 404, statusMessage: 'Preview link not found' })
  const link = await queryOneFresh<{ projectId: string, revoked: boolean, expiresAt: string }>(`
    SELECT project_id AS "projectId", revoked, expires_at AS "expiresAt"
    FROM banner_review_links WHERE token = $1
  `, [token])
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Preview link not found' })
  if (link.revoked || (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now())) {
    throw createError({ statusCode: 410, statusMessage: 'Preview link has expired or was revoked' })
  }
  const project = await queryOneFresh<{ id: string, name: string, clientId: string | null, canvasData: Record<string, { layers?: Array<{ fontFamily?: string }> }> | string }>(`
    SELECT id, name, client_id AS "clientId", canvas_data AS "canvasData" FROM banner_projects WHERE id = $1
  `, [link.projectId])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner not found' })
  const canvas = typeof project.canvasData === 'string' ? JSON.parse(project.canvasData) : project.canvasData
  const fonts = await resolveCanvasFonts(canvas, project.clientId ?? null)
  const deliveredFonts = await withBannerFontDelivery(event, fonts)
  return { project, fonts: deliveredFonts.map((font) => {
    const { id, name, url, tags, clientId, sha256 } = fontAssetMetadata(font)
    return { id, name, url, tags, clientId, sha256 }
  }) }
})
