import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
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
  const project = await queryOneFresh<{ id: string, name: string, canvasData: Record<string, { layers?: Array<{ fontFamily?: string }> }> | string }>(`
    SELECT id, name, canvas_data AS "canvasData" FROM banner_projects WHERE id = $1
  `, [link.projectId])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner not found' })
  const canvas = typeof project.canvasData === 'string' ? JSON.parse(project.canvasData) : project.canvasData
  const fontNames = [...new Set<string>(Object.values(canvas || {}).flatMap(board =>
    Array.isArray(board?.layers) ? board.layers.map(layer => layer.fontFamily).filter((name): name is string => typeof name === 'string') : []))]
  const fonts = fontNames.length
    ? await queryRowsFresh<{ id: string, name: string, url: string, tags: string[], r2Key: string, uploadedBy: string }>(`
    SELECT DISTINCT ON (name, tags) id, name, url, tags, r2_key AS "r2Key", uploaded_by AS "uploadedBy" FROM banner_assets
    WHERE 'font' = ANY(tags) AND name = ANY($1::text[])
    ORDER BY name, tags, created_at DESC
  `, [fontNames])
    : []
  const deliveredFonts = await withBannerFontDelivery(event, fonts)
  return { project, fonts: deliveredFonts.map(({ name, url, tags }) => ({ name, url, tags })) }
})
