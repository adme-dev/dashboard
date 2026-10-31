import { createError } from 'h3'
import { queryRowsFresh } from '~~/server/utils/db'

export interface FontDb { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
export interface FontAssetRow extends Record<string, unknown> {
  id: string
  name: string
  clientId: string | null
  tags: string[]
  url: string
  r2Key: string
  uploadedBy: string
}
export const FONT_ASSET_SELECT = `id, name, mime_type AS "mimeType", file_size AS "fileSize", r2_key AS "r2Key",
  url, tags, uploaded_by AS "uploadedBy", client_id AS "clientId", created_at AS "createdAt"`
export const FONT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function fontAssetMetadata<T extends { tags?: string[], clientId?: string | null }>(row: T) {
  const checksum = row.tags?.find(tag => /^sha256:[a-f0-9]{64}$/.test(tag))
  return { ...row, clientId: row.clientId ?? null, sha256: checksum?.slice(7) ?? null }
}
export function fontAssetWeight(row: { tags?: string[] }) {
  const tag = row.tags?.find(value => /^weight:\d+$/.test(value))
  return tag ? Number(tag.slice(7)) : 400
}
async function readFonts(ids: string[], db?: FontDb) {
  if (!ids.length) return []
  const sql = `SELECT ${FONT_ASSET_SELECT} FROM banner_assets WHERE 'font' = ANY(tags) AND id = ANY($1::uuid[])${db ? ' FOR SHARE' : ''}`
  return (db ? (await db.query(sql, [ids])).rows : await queryRowsFresh(sql, [ids])) as FontAssetRow[]
}
/** Legacy family-only artwork still uses uploaded faces. Lock existing scoped rows,
 * but do not require a managed row for system or Google font families. */
async function lockLegacyFontFamilies(names: string[], clientId: string | null, db: FontDb) {
  if (!names.length) return
  await db.query(`SELECT id FROM banner_assets WHERE 'font' = ANY(tags)
    AND name = ANY($1::text[]) AND (client_id IS NULL OR client_id = $2::uuid)
    ORDER BY id FOR SHARE`, [[...new Set(names)], clientId])
}
interface KitFont { family: string, weights: number[], defaultWeight?: number, assets?: Array<{ id: string, weight: number }> }
export async function validateBrandKitFontAssets(fonts: KitFont[], clientId: string | null, db: FontDb) {
  for (const font of fonts) {
    const weights = Array.isArray(font.weights) ? font.weights : [400, 700]
    if (new Set(weights).size !== weights.length || new Set(font.assets?.map(asset => asset.id.toLowerCase())).size !== (font.assets?.length ?? 0) || new Set(font.assets?.map(asset => asset.weight)).size !== (font.assets?.length ?? 0)) throw createError({ statusCode: 400, statusMessage: 'Font role weights and asset references must be unique' })
  }
  const ids = [...new Set(fonts.flatMap(font => font.assets?.map(asset => asset.id.toLowerCase()) ?? []))]
  const rows = await readFonts(ids, db)
  await lockLegacyFontFamilies(fonts.filter(font => !font.assets?.length).map(font => font.family), clientId, db)
  for (const font of fonts) {
    const weights = Array.isArray(font.weights) ? font.weights : [400, 700]
    if (font.defaultWeight !== undefined && !weights.includes(font.defaultWeight)) throw createError({ statusCode: 400, statusMessage: 'Default font weight must be available in this role' })
    for (const ref of font.assets ?? []) {
      const row = rows.find(asset => asset.id.toLowerCase() === ref.id.toLowerCase())
      if (!row || (row.clientId !== null && row.clientId !== clientId) || row.name !== font.family || fontAssetWeight(row) !== ref.weight || !weights.includes(ref.weight)) {
        throw createError({ statusCode: 400, statusMessage: 'Brand font asset does not match the client, family or available weight' })
      }
    }
    if (font.assets?.length && weights.some(weight => !font.assets!.some(asset => asset.weight === weight))) throw createError({ statusCode: 400, statusMessage: 'Every custom font weight requires an uploaded face' })
  }
}
export interface FontLayer { fontAssetId?: string, fontFamily?: string, fontWeight?: number }
export function canvasFontLayers(canvas: unknown): FontLayer[] {
  if (typeof canvas === 'string') {
    try {
      canvas = JSON.parse(canvas)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid canvas data' })
    }
  }
  if (canvas === undefined || canvas === null) return []
  if (typeof canvas !== 'object' || Array.isArray(canvas)) throw createError({ statusCode: 400, statusMessage: 'Invalid canvas data' })
  const layers = Object.values(canvas).flatMap(board => board && typeof board === 'object' && Array.isArray(board.layers) ? board.layers : [])
  if (layers.some(layer => !layer || typeof layer !== 'object' || Array.isArray(layer))) throw createError({ statusCode: 400, statusMessage: 'Invalid canvas layer' })
  return layers
}
export async function validateCanvasFontAssets(canvas: unknown, clientId: string | null, db?: FontDb) {
  const allLayers = canvasFontLayers(canvas)
  const layers = allLayers.filter(layer => layer.fontAssetId !== undefined)
  if (layers.some(layer => typeof layer.fontAssetId !== 'string' || !FONT_UUID.test(layer.fontAssetId))) throw createError({ statusCode: 400, statusMessage: 'Invalid font asset reference' })
  const rows = await readFonts([...new Set(layers.map(layer => layer.fontAssetId!.toLowerCase()))], db)
  if (db) await lockLegacyFontFamilies(allLayers.filter(layer => !layer.fontAssetId && typeof layer.fontFamily === 'string').map(layer => layer.fontFamily!), clientId, db)
  for (const layer of layers) {
    const row = rows.find(asset => asset.id.toLowerCase() === layer.fontAssetId!.toLowerCase())
    if (!row || (row.clientId !== null && row.clientId !== clientId) || row.name !== layer.fontFamily || fontAssetWeight(row) !== (layer.fontWeight ?? 400)) {
      throw createError({ statusCode: 400, statusMessage: 'Font asset does not match the project client, family or weight' })
    }
  }
  return rows
}

/** Exact identities first; legacy names resolve only inside the project/shared scope. */
export async function resolveCanvasFonts(canvas: unknown, clientId: string | null) {
  const layers = canvasFontLayers(canvas)
  const explicit = await validateCanvasFontAssets(canvas, clientId)
  const names = [...new Set(layers.filter(layer => !layer.fontAssetId && typeof layer.fontFamily === 'string').map(layer => layer.fontFamily!))]
  if (!names.length) return explicit
  const legacy = await queryRowsFresh<FontAssetRow>(`SELECT ${FONT_ASSET_SELECT} FROM banner_assets
    WHERE 'font' = ANY(tags) AND name = ANY($1::text[]) AND (client_id IS NULL OR client_id = $2::uuid)
    ORDER BY (client_id IS NOT NULL) DESC, created_at DESC, id`, [names, clientId])
  const chosen = new Map<string, FontAssetRow>()
  for (const row of legacy) {
    const key = `${row.name}:${fontAssetWeight(row)}`
    if (!chosen.has(key)) chosen.set(key, row)
  }
  const legacyRows = [...chosen.values()]
  return [...legacyRows, ...explicit.filter(row => !legacyRows.some(face => face.id === row.id))]
}

/** Same scoped faces and stable URLs for native server renderers and public previews. */
export async function resolveCanvasExportFonts(event: import('h3').H3Event, canvas: unknown, clientId: string | null) {
  const { withBannerFontDelivery } = await import('~~/server/utils/banner/fontDelivery')
  const faces = await withBannerFontDelivery(event, await resolveCanvasFonts(canvas, clientId))
  return faces.map(face => ({
    id: face.id, family: face.name, url: face.url, weight: fontAssetWeight(face),
    format: face.tags.find(tag => tag.startsWith('format:'))?.slice(7) || 'truetype'
  }))
}
