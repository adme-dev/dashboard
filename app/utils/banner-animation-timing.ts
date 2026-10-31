import type { Layer } from '~/types/banner-studio'

/** Explicit block positions override the legacy entrance/exit anchors. */
export function bannerAnimationTiming(layer: Layer) {
  const start = layer.startTime ?? 0
  const end = layer.endTime ?? start + 3
  const entryStart = Math.min(end, Math.max(start, layer.animInStart ?? start))
  const entryDuration = layer.animInStart === undefined ? layer.animInDur || 0.6 : Math.min(layer.animInDur || 0.6, Math.max(0.05, end - entryStart))
  const exitDuration = layer.outDur || (layer.type === 'bg' ? 0.5 : 0.25)
  const exitStart = layer.animOutStart === undefined
    ? Math.max(entryStart + entryDuration, end - exitDuration)
    : Math.min(end - Math.min(0.05, end - start), Math.max(entryStart + entryDuration, layer.animOutStart))
  return { entryStart, entryDuration, exitStart, exitDuration: layer.animOutStart === undefined ? exitDuration : Math.min(exitDuration, Math.max(0, end - exitStart)) }
}
