import { queryOne } from '~~/server/utils/db'
import { FORMATS } from '~~/app/utils/banner-constants'

/** Default banner format key for a video canvas aspect. Overlay clips may override via gsap_format_key. */
export function resolveOverlayFormatKey(width: number, height: number): string {
  const r = width / height
  if (r < 0.85) return 'fb_story'      // ~9:16 portrait
  if (r > 1.2) return 'tt_land'        // ~16:9 landscape
  return 'ig_sq'                       // ~1:1
}

export async function loadBannerLayers(projectId: string, formatKey: string): Promise<{ layers: any[]; width: number; height: number }> {
  const row = await queryOne(`SELECT canvas_data AS "canvasData" FROM banner_projects WHERE id = $1`, [projectId])
  if (!row) throw new Error(`banner project not found: ${projectId}`)
  const artboard = (row as any).canvasData?.[formatKey]
  if (!artboard?.layers) throw new Error(`banner project ${projectId} has no format "${formatKey}"`)
  const fmt = (FORMATS as any)[formatKey]
  if (!fmt) throw new Error(`unknown banner format: ${formatKey}`)
  return { layers: artboard.layers, width: fmt.w, height: fmt.h }
}
