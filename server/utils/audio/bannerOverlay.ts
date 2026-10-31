import type { H3Event } from 'h3'
import type { ExportCustomFont } from '~~/server/utils/banner/htmlBuilder'
import { resolveCanvasExportFonts } from '~~/server/utils/banner/fontAssets'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { queryOne } from '~~/server/utils/db'
import type { BannerPlayback, Layer } from '~~/app/types/banner-studio'
import { resolveBannerFormat } from '~~/app/utils/banner-constants'

/** Default banner format key for a video canvas aspect. Overlay clips may override via gsap_format_key. */
export function resolveOverlayFormatKey(width: number, height: number): string {
  const r = width / height
  if (r < 0.85) return 'fb_story' // ~9:16 portrait
  if (r > 1.2) return 'tt_land' // ~16:9 landscape
  return 'ig_sq' // ~1:1
}

export async function loadBannerLayers(projectId: string, formatKey: string, event?: H3Event): Promise<{ layers: Layer[], width: number, height: number, playback?: BannerPlayback, customFonts?: ExportCustomFont[] }> {
  const row = await queryOne<{ clientId: string | null, canvasData: Record<string, { layers: Layer[], playback?: BannerPlayback }> }>(`SELECT canvas_data AS "canvasData", client_id AS "clientId" FROM banner_projects WHERE id = $1`, [projectId])
  if (!row) throw new Error(`banner project not found: ${projectId}`)
  const artboard = row.canvasData?.[formatKey]
  if (!artboard?.layers) throw new Error(`banner project ${projectId} has no format "${formatKey}"`)
  const fmt = resolveBannerFormat(formatKey)
  if (!fmt) throw new Error(`unknown banner format: ${formatKey}`)
  if (event && row.clientId) await requireSocialClientAccess(event, row.clientId)
  const customFonts = event ? await resolveCanvasExportFonts(event, { [formatKey]: artboard }, row.clientId ?? null) : []
  if (!event && artboard.layers.some((layer: { fontAssetId?: string }) => layer.fontAssetId)) throw new Error('Font export requires authenticated request context')
  return { ...(customFonts.length ? { customFonts } : {}), layers: artboard.layers, width: fmt.w, height: fmt.h, ...(artboard.playback ? { playback: artboard.playback } : {}) }
}
