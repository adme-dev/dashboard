import { FORMATS } from '~/utils/banner-constants'
import type { Layer } from '~/types/banner-studio'

/**
 * Get layers for a given format key, either from the stored set
 * or by scaling the active artboard's layers to fit.
 */
export function getScaledLayers(
  fmtKey: string,
  sets: Record<string, { layers?: Layer[]; bgColor?: string }>,
  activeKey: string,
  activeLayers: Layer[],
): Layer[] {
  if (sets[fmtKey]?.layers) return sets[fmtKey].layers!

  const srcFmt = FORMATS[activeKey]
  const tgtFmt = FORMATS[fmtKey]
  if (!srcFmt || !tgtFmt) return []

  const sx = tgtFmt.w / srcFmt.w
  const sy = tgtFmt.h / srcFmt.h

  return activeLayers.map((l) => {
    const n = { ...JSON.parse(JSON.stringify(l)) }
    n.x = Math.round(l.x * sx)
    n.y = Math.round(l.y * sy)
    n.w = Math.round(l.w * sx)
    n.h = Math.round(l.h * sy)
    if (n.type === 'bg') { n.w = tgtFmt.w; n.h = tgtFmt.h }
    if (n.fontSize) n.fontSize = Math.max(7, Math.round(n.fontSize * Math.min(sx, sy)))
    return n
  })
}
