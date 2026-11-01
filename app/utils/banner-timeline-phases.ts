import { bannerAnimationTiming } from '~/utils/banner-animation-timing'
import type { KeyframeProperty, Layer } from '~/types/banner-studio'
import { ANIM_IN, ANIM_OUT } from '~/utils/banner-constants'

export interface TimelinePhase {
  kind: 'entry' | 'motion' | 'hold' | 'exit' | 'audio'
  start: number
  end: number
  label: string
  direction: 'in' | 'out'
}

/** Describe changing properties, without guessing a preset from imported samples. */
export function describeKeyframeMotion(layer: Layer, start = layer.startTime ?? 0, end = layer.endTime ?? start + 3): string {
  const deltas = (property: KeyframeProperty) => {
    if ((property === 'x' || property === 'y') && (layer.motionPath?.length ?? 0) >= 2) return []
    const frames = [...(layer.keyframes?.[property] || [])].sort((a, b) => a.time - b.time)
    return frames.slice(1).flatMap((frame, index) => {
      const previous = frames[index]!
      const overlaps = frame.time === previous.time
        ? frame.time > start + 1e-6 && frame.time < end - 1e-6
        : frame.time > start + 1e-6 && previous.time < end - 1e-6
      const difference = frame.value - previous.value
      return overlaps && difference !== 0 && Number.isFinite(difference) ? [difference] : []
    })
  }
  const direction = (values: number[]) => values.every(value => value > 0) ? 1 : values.every(value => value < 0) ? -1 : 0
  const labels: string[] = []
  if (layer.imageEntrance && layer.imageEntrance.start < end && layer.imageEntrance.start + layer.imageEntrance.duration > start) labels.push(layer.imageEntrance.kind === 'splitSlam' ? 'Split Slam' : 'Soft wipe')
  const opacity = deltas('opacity')
  if (opacity.length) labels.push(direction(opacity) === 1 ? 'Fade in' : direction(opacity) === -1 ? 'Fade out' : 'Fade')
  const x = deltas('x'), y = deltas('y')
  if (x.length || y.length) {
    labels.push(x.length && y.length
      ? 'Move'
      : x.length
        ? direction(x) === 1 ? 'Move right' : direction(x) === -1 ? 'Move left' : 'Move horizontally'
        : direction(y) === 1 ? 'Move down' : direction(y) === -1 ? 'Move up' : 'Move vertically')
  }
  const scale = [...deltas('scaleX'), ...deltas('scaleY')]
  if (scale.length) {
    const negativeScale = [...(layer.keyframes?.scaleX || []), ...(layer.keyframes?.scaleY || [])].some(frame => frame.value < 0)
    labels.push(negativeScale ? 'Scale' : direction(scale) === 1 ? 'Scale up' : direction(scale) === -1 ? 'Scale down' : 'Scale')
  }
  const rotation = deltas('rotation')
  if (rotation.length) labels.push('Rotate')
  if ((layer.motionPath?.length ?? 0) >= 2 && (!layer.motionPathTweens?.length || layer.motionPathTweens.some(tween => tween.startTime < end && tween.endTime > start && tween.pathStart !== tween.pathEnd))) labels.push('Motion path')
  return labels.join(' + ') || 'Animation'
}

/** A read-only timing summary. Imported motion is never assigned a guessed preset. */
export function timelinePhases(layer: Layer): TimelinePhase[] {
  const start = layer.startTime ?? 0
  const end = layer.endTime ?? start + 3
  if (end <= start) return []
  if (layer.type === 'audio') return [{ kind: 'audio', start, end, label: 'Sound', direction: 'in' }]
  const holdLabel = (layer.motionPath?.length ?? 0) >= 2 ? 'Motion path' : 'Hold'
  const tracks = Object.values(layer.keyframes || {}).filter(track => track && track.length >= 2)
  if (tracks.length) {
    const changes: { start: number, end: number }[] = []
    for (const track of tracks) {
      const frames = [...track!].sort((a, b) => a.time - b.time)
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1]!, b = frames[i]!
        if (a.value === b.value || b.time <= a.time) continue
        const from = Math.max(start, a.time), to = Math.min(end, b.time)
        if (to > from) changes.push({ start: from, end: to })
      }
    }
    for (const clip of layer.animationClips || []) {
      const from = Math.max(start, clip.start), to = Math.min(end, clip.end)
      if (to > from) changes.push({ start: from, end: to })
    }
    if (layer.imageEntrance) changes.push({ start: Math.max(start, layer.imageEntrance.start), end: Math.min(end, layer.imageEntrance.start + layer.imageEntrance.duration) })
    changes.sort((a, b) => a.start - b.start)
    const merged: typeof changes = []
    for (const range of changes) {
      const last = merged.at(-1)
      if (last && range.start <= last.end + 1e-6) last.end = Math.max(last.end, range.end)
      else merged.push({ ...range })
    }
    const phases: TimelinePhase[] = []
    let cursor = start
    const authoredRanges = merged.flatMap((range) => {
      const cuts = [...new Set([range.start, range.end, ...(layer.animationClips || []).flatMap(clip => [clip.start, clip.end]).filter(time => time > range.start && time < range.end)])].sort((a, b) => a - b)
      return cuts.slice(0, -1).map((start, index) => ({ start, end: cuts[index + 1]! }))
    })
    for (const range of authoredRanges) {
      if (range.start > cursor) phases.push({ kind: 'hold', start: cursor, end: range.start, label: holdLabel, direction: 'in' })
      const kind = range.start === start && range.end < end ? 'entry' : range.end === end && range.start > start ? 'exit' : 'motion'
      const authored = layer.animationClips?.find(clip => Math.abs(clip.start - range.start) < 0.0001 && Math.abs(clip.end - range.end) < 0.0001)
      phases.push({ ...range, kind, label: authored?.label || `${kind === 'entry' ? 'Entry' : kind === 'exit' ? 'Exit' : 'Motion'} · ${describeKeyframeMotion(layer, range.start, range.end)}`, direction: kind === 'exit' ? 'out' : 'in' })
      cursor = range.end
    }
    if (cursor < end) phases.push({ kind: 'hold', start: cursor, end, label: holdLabel, direction: 'in' })
    return phases
  }
  const timing = bannerAnimationTiming(layer)
  const entry = ANIM_IN.find(p => p.id === layer.animIn)
  const exit = ANIM_OUT.find(p => p.id === (layer.animOut ?? 'fadeOut'))
  const entryDuration = layer.wordPop
    ? layer.wordPop.duration + Math.max(0, (layer.text?.trim().split(/\s+/).length || 1) - 1) * layer.wordPop.stagger
    : layer.animInDur || 0.6
  const entryEnd = Math.min(end, timing.entryStart + entryDuration)
  // Word staggering can continue beneath the layer's exit. The runtime schedules
  // that exit from animInDur, not the final word's entrance completion.
  const exitStart = Math.min(end, timing.exitStart)
  const phases: TimelinePhase[] = []
  if (timing.entryStart > start) phases.push({ kind: 'hold', start, end: timing.entryStart, label: holdLabel, direction: 'in' })
  if ((entry && entry.id !== 'none') || layer.wordPop) phases.push({ kind: 'entry', start: timing.entryStart, end: entryEnd, label: `Entry · ${layer.wordPop ? 'Words Pop' : entry!.label}`, direction: 'in' })
  const middleStart = phases.length ? entryEnd : start
  const middleEnd = exit?.id !== 'none' ? exitStart : end
  if (middleEnd > middleStart) phases.push({ kind: 'hold', start: middleStart, end: middleEnd, label: entry?.special === 'kenBurns' ? 'Ken Burns' : holdLabel, direction: 'in' })
  if (exit && exit.id !== 'none' && exitStart < end) phases.push({ kind: 'exit', start: exitStart, end: Math.min(end, exitStart + timing.exitDuration), label: `Exit · ${exit.label}`, direction: 'out' })
  const lastEnd = phases.at(-1)?.end ?? start
  if (lastEnd < end) phases.push({ kind: 'hold', start: lastEnd, end, label: holdLabel, direction: 'in' })
  return phases
}
