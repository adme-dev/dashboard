import type { Keyframe, KeyframeProperty, Layer } from '~/types/banner-studio'
import type { TimelinePhase } from '~/utils/banner-timeline-phases'

const round = (value: number) => Math.round(value * 10000) / 10000

/** Retiming retains values, eases, equal-time resets and motion-path progress. */
export function retimeLayerPresence(layer: Layer, start: number, end: number): Partial<Layer> {
  const from = layer.startTime ?? 0, to = layer.endTime ?? from + 3
  const scale = (end - start) / Math.max(0.001, to - from)
  const time = (value: number) => value < from ? Math.min(value, start) : round(Math.max(0, start + (value - from) * scale))
  const change: Partial<Layer> = { startTime: start, endTime: end, delay: start }
  if (layer.keyframes) change.keyframes = Object.fromEntries(Object.entries(layer.keyframes).map(([property, frames]) => [property, frames?.map(frame => ({ ...frame, time: time(frame.time) }))]))
  if (layer.animationClips) change.animationClips = layer.animationClips.map(clip => ({ ...clip, start: time(clip.start), end: time(clip.end) }))
  if (layer.motionPathTweens) change.motionPathTweens = layer.motionPathTweens.map(tween => ({ ...tween, startTime: time(tween.startTime), endTime: time(tween.endTime) }))
  if (layer.animInStart !== undefined) change.animInStart = time(layer.animInStart)
  if (layer.animOutStart !== undefined) change.animOutStart = time(layer.animOutStart)
  if (layer.animInDur !== undefined) {
    change.animInDur = round(layer.animInDur * scale)
    change.dur = change.animInDur
  }
  if (layer.outDur) change.outDur = round(layer.outDur * scale)
  if (layer.wordPop) change.wordPop = { ...layer.wordPop, duration: layer.wordPop.duration * scale, stagger: layer.wordPop.stagger * scale }
  return change
}

/** Stretch only this interval; adjacent hold intervals absorb its movement. */
export function retimeAnimationPhase(layer: Layer, phase: TimelinePhase, start: number, end: number): Partial<Layer> {
  if (Object.values(layer.keyframes || {}).some(frames => frames && frames.length >= 2)) {
    const time = (value: number) => value < phase.start - 1e-6 || value > phase.end + 1e-6
      ? value
      : round(start + (value - phase.start) * (end - start) / (phase.end - phase.start))
    const keyframes = Object.fromEntries(Object.entries(layer.keyframes || {}).map(([property, frames]) => {
      if (!frames) return [property, frames]
      const sorted = [...frames].sort((a, b) => a.time - b.time)
      const changesInside = sorted.some((frame, i) => i > 0 && frame.value !== sorted[i - 1]!.value && frame.time > phase.start + 1e-6 && sorted[i - 1]!.time < phase.end - 1e-6)
      if (!changesInside) return [property, frames.map(frame => ({ ...frame }))]
      const updated = sorted.flatMap((frame, index) => {
        const mapped = { ...frame, time: time(frame.time) }
        const previous = sorted[index - 1], next = sorted[index + 1]
        const sharedStart = Math.abs(frame.time - phase.start) < 1e-6 && previous && previous.time < phase.start && previous.value !== frame.value
        const sharedEnd = Math.abs(frame.time - phase.end) < 1e-6 && next && next.time > phase.end && next.value !== frame.value
        return mapped.time !== frame.time && (sharedStart || sharedEnd) ? [{ ...frame }, mapped] : [mapped]
      }).sort((a, b) => a.time - b.time)
      return [property, updated]
    }))
    return { animationClips: layer.animationClips?.map(clip => clip.start >= phase.start - 1e-6 && clip.end <= phase.end + 1e-6 ? { ...clip, start: time(clip.start), end: time(clip.end) } : { ...clip }), keyframes }
  }
  if (phase.kind === 'entry') {
    if (layer.wordPop) {
      const scale = (end - start) / (phase.end - phase.start)
      return { animInStart: start, animInDur: end - start, wordPop: { ...layer.wordPop, duration: layer.wordPop.duration * scale, stagger: layer.wordPop.stagger * scale } }
    }
    return { animInStart: start, animInDur: end - start }
  }
  if (phase.kind === 'exit') return { animOutStart: start, outDur: end - start }
  return {}
}

export function keyframeDefault(layer: Layer, property: KeyframeProperty) {
  return property === 'opacity' ? layer.opacity : property === 'rotation' ? layer.rotation || 0 : property.startsWith('scale') ? 1 : 0
}

/** New tracks have two resting anchors so even a single added keyframe plays. */
export function insertTimelineKeyframe(layer: Layer, property: KeyframeProperty, time: number, value: number, source = layer.keyframes || {}) {
  const existing = source[property] || []
  const duplicate = existing.findIndex(frame => Math.abs(frame.time - time) < 0.0001)
  if (duplicate >= 0) return { keyframes: source, index: duplicate, changed: false }
  const frames: Keyframe[] = existing.length
    ? existing.map(frame => ({ ...frame }))
    : [
        { time: layer.startTime ?? 0, value: keyframeDefault(layer, property), easing: 'none' },
        { time: layer.endTime ?? 3, value: keyframeDefault(layer, property), easing: 'none' }
      ].filter(frame => Math.abs(frame.time - time) >= 0.0001)
  const added = { time, value, easing: 'power2.out' }
  frames.push(added)
  frames.sort((a, b) => a.time - b.time)
  return { keyframes: { ...source, [property]: frames }, index: frames.indexOf(added), changed: true }
}

export const MIDDLE_ANIMATIONS = [
  { id: 'blink', label: 'Blink', icon: 'i-lucide-eye', properties: ['opacity'] },
  { id: 'float', label: 'Float', icon: 'i-lucide-move-vertical', properties: ['y'] },
  { id: 'vibrate', label: 'Vibrate', icon: 'i-lucide-vibrate', properties: ['x'] },
  { id: 'pulse', label: 'Pulse', icon: 'i-lucide-heart-pulse', properties: ['scaleX', 'scaleY'] }
] as const

/** Add authored middle motion inside a hold without replacing entry or exit. */
export function addMiddleAnimation(layer: Layer, phase: TimelinePhase, id: string, at: number, source: NonNullable<Layer['keyframes']>, sample: (property: KeyframeProperty) => number): Partial<Layer> {
  const preset = MIDDLE_ANIMATIONS.find(preset => preset.id === id)
  if (!preset || phase.end - phase.start < 0.1) return {}
  const start = Math.max(phase.start, Math.min(phase.end - 0.1, at))
  const end = Math.min(phase.end, start + 1.2)
  const keyframes = { ...source }
  for (const property of preset.properties) {
    const resting = sample(property)
    const offsets = id === 'vibrate' ? [0, -4, 4, -4, 4, -4, 4, 0] : [0, id === 'blink' ? -resting * 0.85 : id === 'float' ? -12 : resting * 0.08, 0]
    const frames = offsets.map((offset, i) => ({ time: round(start + (end - start) * i / (offsets.length - 1)), value: resting + offset, easing: id === 'vibrate' ? 'none' : 'power1.inOut' }))
    keyframes[property] = [...(source[property] || []).filter(frame => frame.time < start - 1e-6 || frame.time > end + 1e-6), ...frames].sort((a, b) => a.time - b.time)
  }
  const animationClips = [...(layer.animationClips || []).filter(clip => clip.end <= start || clip.start >= end), { start, end, label: preset.label }]
  return { keyframes, animationClips }
}
