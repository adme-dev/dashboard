import type { KeyframeProperty, Layer } from '~/types/banner-studio'
import type { TimelinePhase } from '~/utils/banner-timeline-phases'

const epsilon = 1e-6
const isEntry = (phase: TimelinePhase) => phase.kind === 'entry' || phase.label.startsWith('Entry ·')
const isExit = (phase: TimelinePhase) => phase.kind === 'exit' || phase.label.startsWith('Exit ·')
const changesWithin = (frames: { time: number, value: number }[], phase: TimelinePhase) => frames.some((frame, index) => index > 0 && frame.value !== frames[index - 1]!.value && frame.time > phase.start + epsilon && frames[index - 1]!.time < phase.end - epsilon)

export function canRemoveTimelineAnimation(layer: Layer, phase?: TimelinePhase) {
  if (!phase || phase.kind === 'audio' || layer.type === 'audio') return false
  if (!Object.values(layer.keyframes || {}).some(track => track && track.length >= 2)) return isEntry(phase) || isExit(phase) || (layer.animIn === 'kenBurns' && phase.label === 'Ken Burns')
  return Object.entries(layer.keyframes || {}).some(([property, frames]) => !((property === 'x' || property === 'y') && layer.motionPath?.length) && frames && changesWithin([...frames].sort((a, b) => a.time - b.time), phase))
}

export function removalSampleTime(phase: TimelinePhase) {
  return isEntry(phase) ? phase.end : phase.start
}

/** Replace only this effect with a hold. Other layers, tracks and later motion survive. */
export function removeTimelineAnimation(layer: Layer, phase: TimelinePhase, sample: (property: KeyframeProperty) => number): Partial<Layer> {
  if (!canRemoveTimelineAnimation(layer, phase)) return {}
  if (!Object.values(layer.keyframes || {}).some(track => track && track.length >= 2)) {
    return isExit(phase)
      ? { animOut: 'none', animOutStart: undefined }
      : { animIn: 'none', animInStart: undefined, wordPop: undefined }
  }
  const keyframes = { ...layer.keyframes }
  for (const property of Object.keys(keyframes) as KeyframeProperty[]) {
    if ((property === 'x' || property === 'y') && layer.motionPath?.length) continue
    const frames = [...(keyframes[property] || [])].sort((a, b) => a.time - b.time)
    if (!changesWithin(frames, phase)) continue
    const resting = sample(property)
    const before = frames.filter(frame => frame.time < phase.start - epsilon)
    const after = frames.filter(frame => frame.time > phase.end + epsilon)
    const start = frames.find(frame => Math.abs(frame.time - phase.start) < epsilon)
    const end = frames.findLast(frame => Math.abs(frame.time - phase.end) < epsilon)
    keyframes[property] = [
      ...before.map(frame => ({ ...frame })),
      // Preserve a shared anchor for adjacent motion before the instantaneous reset.
      ...(before.length && start && before.at(-1)!.value !== start.value ? [{ ...start }] : []),
      { time: phase.start, value: resting, easing: 'none' },
      { time: phase.end, value: resting, easing: 'none' },
      ...(after.length && end && after[0]!.value !== end.value ? [{ ...end }] : []),
      ...after.map(frame => ({ ...frame }))
    ]
  }
  return {
    keyframes,
    animationClips: (layer.animationClips || []).filter(clip => clip.end <= phase.start + epsilon || clip.start >= phase.end - epsilon)
  }
}
