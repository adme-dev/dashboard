import { ANIM_IN } from '~/utils/banner-constants'
import { keyframeDefault } from '~/utils/banner-timeline-edit'
import type { AnimInType, KeyframeProperty, Layer } from '~/types/banner-studio'

/** Apply an entrance without throwing away later authored keyframes or paths. */
export function applyTimelineEntrance(layer: Layer, id: AnimInType, sample: (property: KeyframeProperty) => number = property => keyframeDefault(layer, property), range?: { start: number, end: number }): Partial<Layer> {
  const preset = ANIM_IN.find(preset => preset.id === id)
  if (!preset) return {}
  const ease = preset.ease || 'power2.out'
  const common = { animIn: id, ease, wordPop: undefined }
  if (!Object.values(layer.keyframes || {}).some(track => track && track.length >= 2)) return common
  if (preset.special || id === 'none') return {}
  const start = range?.start ?? layer.startTime ?? 0
  const end = range?.end ?? Math.min(layer.endTime ?? start + 3, start + (layer.animInDur || 0.6))
  if (end <= start) return {}
  const keyframes = { ...layer.keyframes }
  for (const [key, value] of Object.entries({ ...preset.from, opacity: preset.from.opacity ?? 0 })) {
    if ((key === 'x' || key === 'y') && (layer.motionPath?.length ?? 0) >= 2) continue
    const properties: KeyframeProperty[] = key === 'scale' ? ['scaleX', 'scaleY'] : [key as KeyframeProperty]
    for (const property of properties) {
      keyframes[property] = [
        ...(keyframes[property] || []).filter(frame => frame.time < start || frame.time > end).map(frame => ({ ...frame })),
        { time: start, value, easing: ease },
        { time: end, value: sample(property), easing: 'none' }
      ].sort((a, b) => a.time - b.time)
    }
  }
  return { ...common, keyframes, animationClips: [...(layer.animationClips || []).filter(clip => clip.end <= start || clip.start >= end), { start, end, label: `Entry · ${preset.label}` }] }
}
