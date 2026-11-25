import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { canvasFontLayers, validateCanvasFontAssets, FONT_ASSET_SELECT, type FontDb } from '~~/server/utils/banner/fontAssets'

/** Preserve exact managed faces when correcting a project's client assignment.
 * The caller locks the stored project, authorizes both clients and supplies its
 * stored canvas, never a replacement canvas from the request. Scoped metadata is
 * copied; immutable font bytes remain reference counted by their storage key.
 */
export async function reassignProjectFonts(canvas: unknown, sourceClient: string | null, targetClient: string | null, db: FontDb) {
  const fonts = await validateCanvasFontAssets(canvas, sourceClient, db)
  if (targetClient === null && fonts.some(font => font.clientId !== null)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a client, including Archive, to retain this project’s client fonts' })
  }
  const next = typeof canvas === 'string' ? JSON.parse(canvas) : structuredClone(canvas)
  const ids = new Map<string, string>()
  for (const font of [...fonts].sort((a, b) => a.id.localeCompare(b.id))) {
    if (font.clientId === null || font.clientId === targetClient) continue
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`banner-project-font:${font.id}:${targetClient ?? 'shared'}`])
    const sourceTag = `source-font:${font.id}`
    const existing = await db.query(`SELECT ${FONT_ASSET_SELECT} FROM banner_assets
      WHERE client_id IS NOT DISTINCT FROM $1::uuid AND r2_key = $2 AND name = $3
        AND 'font' = ANY(tags) AND $4 = ANY(tags) ORDER BY id LIMIT 1 FOR SHARE`,
    [targetClient, font.r2Key, font.name, sourceTag])
    let id = existing.rows[0]?.id as string | undefined
    if (!id) {
      id = randomUUID()
      await db.query(`INSERT INTO banner_assets
        (id, name, mime_type, file_size, r2_key, url, tags, uploaded_by, client_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, font.name, font.mimeType, font.fileSize, font.r2Key, font.url,
        [...font.tags.filter(tag => !tag.startsWith('source-font:')), sourceTag], font.uploadedBy, targetClient])
    }
    ids.set(font.id.toLowerCase(), id)
  }
  for (const layer of canvasFontLayers(next)) {
    const id = layer.fontAssetId && ids.get(layer.fontAssetId.toLowerCase())
    if (id) layer.fontAssetId = id
  }
  await validateCanvasFontAssets(next, targetClient, db)
  return next
}
