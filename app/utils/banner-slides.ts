import type { ArtboardState, BannerSlide, Layer } from '~/types/banner-studio'

export const MIN_SLIDE_DURATION = 0.1
export const MAX_SEQUENCE_DURATION = 300
export const MAX_SLIDES = 50
const round = (value: number) => Math.round(value * 10000) / 10000
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export function slideRanges(slides: BannerSlide[]) {
  let start = 0
  return slides.map((slide) => {
    const result = { ...slide, start, end: round(start + slide.duration) }
    start = result.end
    return result
  })
}

/** Ignore a transparent import pre-roll only when trimming it cannot retime a tween. */
function scenePresence(layer: Layer) {
  const firstOpacity = [...(layer.keyframes?.opacity || [])].sort((a, b) => a.time - b.time)[0]
  const canTrim = layer.clipToPresence && layer.type !== 'audio'
    && firstOpacity?.value === 0 && firstOpacity.time > layer.startTime && firstOpacity.time < layer.endTime
    && !layer.motionPath?.length && !layer.motionPathTweens?.length && !layer.animationClips?.length
    && (!layer.animIn || layer.animIn === 'none') && (!layer.animOut || layer.animOut === 'none')
    && Object.values(layer.keyframes || {}).every(frames => !frames?.some(frame => frame.time < firstOpacity.time))
  return { startTime: canTrim ? firstOpacity.time : layer.startTime, endTime: layer.endTime }
}

/** Recover only unambiguous hard cuts; overlapping scene artwork stays a single slide. */
export function resolveSlides(board?: ArtboardState): BannerSlide[] {
  if (!board) return []
  if (board.slides?.length) return board.slides
  const duration = board.playback?.duration || Math.max(0.1, ...board.layers.map(layer => layer.endTime || 3))
  const clipped = board.layers.filter(layer => layer.clipToPresence && !layer.slideTransitionFor).map(scenePresence)
  const cuts = [...new Set(clipped.map(layer => layer.endTime))].filter(time => time > 0 && time < duration
    && clipped.some(layer => Math.abs(layer.startTime - time) < 0.0001)
    && !clipped.some(layer => layer.startTime < time - 0.0001 && layer.endTime > time + 0.0001)).sort((a, b) => a - b)
  const ends = [...cuts, duration]
  return ends.map((end, index) => ({ id: `slide-${index + 1}`, name: `Slide ${index + 1}`, duration: round(end - (ends[index - 1] || 0)) }))
}

export function slideAtTime(board: ArtboardState | undefined, time: number) {
  const ranges = slideRanges(resolveSlides(board))
  return ranges.find(slide => time < slide.end - 0.00001) || ranges.at(-1)
}

export function layerSlideId(board: ArtboardState, layer: Layer): string | undefined {
  if (layer.slideTransitionFor) return undefined
  if (layer.slideId) return layer.slideId
  // A full-cycle background stays behind every slide.
  if (layer.type === 'bg' && !layer.clipToPresence) return undefined
  const presence = scenePresence(layer)
  return slideRanges(resolveSlides(board)).find(slide => presence.startTime >= slide.start - 0.0001 && presence.endTime <= slide.end + 0.0001)?.id
}

export function slidePoster(board: ArtboardState, slideId: string): ArtboardState {
  return { bgColor: board.bgColor, layers: board.layers.filter(layer => layer.type !== 'audio' && !layer.slideTransitionFor && (!layerSlideId(board, layer) || layerSlideId(board, layer) === slideId)).map(layer => ({ ...layer, clipToPresence: false, animIn: 'none', animOut: 'none', keyframes: undefined })) }
}

export type SlideEdit
  = | { type: 'add', after: number, id: string }
    | { type: 'duplicate', index: number, id: string }
    | { type: 'delete', index: number }
    | { type: 'move', index: number, to: number }
    | { type: 'duration', index: number, duration: number }
    | { type: 'rename', index: number, name: string }
    | { type: 'transition', index: number, duration: number }
    | { type: 'loop', loopCount: number }

function mapLayerTime(layer: Layer, time: (value: number) => number, scale: number) {
  layer.startTime = time(layer.startTime)
  layer.endTime = time(layer.endTime)
  if (layer.keyframes) for (const frames of Object.values(layer.keyframes)) {
    if (frames) for (const frame of frames) frame.time = time(frame.time)
  }
  for (const clip of layer.animationClips || []) {
    clip.start = time(clip.start)
    clip.end = time(clip.end)
  }
  for (const tween of layer.motionPathTweens || []) {
    tween.startTime = time(tween.startTime)
    tween.endTime = time(tween.endTime)
  }
  if (layer.animInStart !== undefined) layer.animInStart = time(layer.animInStart)
  if (layer.animOutStart !== undefined) layer.animOutStart = time(layer.animOutStart)
  if (layer.animInDur) layer.animInDur = round(layer.animInDur * scale)
  if (layer.outDur) layer.outDur = round(layer.outDur * scale)
  layer.delay = layer.startTime
  if (layer.animInDur !== undefined) layer.dur = layer.animInDur
  if (layer.wordPop) {
    layer.wordPop.duration = round(layer.wordPop.duration * scale)
    layer.wordPop.stagger = round(layer.wordPop.stagger * scale)
  }
}

/** Return a complete replacement so failed multi-layout edits cannot partly mutate a project. */
export function editSlides(source: ArtboardState, edit: SlideEdit, nextId: () => number, format: { w: number, h: number }): ArtboardState {
  const board = clone(source)
  board.slides = clone(resolveSlides(source))
  if (board.slides.some(slide => !slide.id || !slide.name || !Number.isFinite(slide.duration) || slide.duration < MIN_SLIDE_DURATION)) throw new Error('This layout has invalid slide settings.')
  const old = slideRanges(board.slides)
  if (!old.length || old.length > MAX_SLIDES) throw new Error('This layout has an invalid slide sequence.')
  board.layers = board.layers.filter(layer => !layer.slideTransitionFor)
  for (const layer of board.layers) layer.slideId = layerSlideId(source, layer)
  const index = 'index' in edit ? edit.index : -1
  const target = board.slides[index]
  if ('index' in edit && (!Number.isInteger(index) || index < 0 || !target)) throw new Error('The selected slide no longer exists.')
  if (edit.type === 'add') {
    if (!old[edit.after]) throw new Error('Select a slide before adding another.')
    board.slides.splice(edit.after + 1, 0, { id: edit.id, name: 'New slide', duration: 3 })
  } else if (edit.type === 'duplicate') {
    const copy = { ...clone(target!), id: edit.id, name: `${target!.name} copy` }
    board.slides.splice(index + 1, 0, copy)
    const originals = board.layers.filter(layer => layer.slideId === target!.id)
    const ids = new Map(originals.map(layer => [layer.id, nextId()]))
    board.layers.push(...originals.map((layer) => {
      const copyLayer = clone(layer)
      copyLayer.id = ids.get(layer.id)!
      copyLayer.slideId = edit.id
      // Keep cross-layout linkage, while making copied content independent of its source.
      if (copyLayer.linkId) copyLayer.linkId = `${copyLayer.linkId}:${edit.id}`
      if (copyLayer.maskTargetIds) copyLayer.maskTargetIds = copyLayer.maskTargetIds.map(id => ids.get(id)).filter((id): id is number => id !== undefined)
      return copyLayer
    }))
  } else if (edit.type === 'delete') {
    if (old.length === 1) throw new Error('Keep at least one slide in the design.')
    const removed = new Set(board.layers.filter(layer => layer.slideId === target!.id).map(layer => layer.id))
    board.layers = board.layers.filter(layer => !removed.has(layer.id))
    for (const layer of board.layers) if (layer.maskTargetIds) layer.maskTargetIds = layer.maskTargetIds.filter(id => !removed.has(id))
    board.slides.splice(index, 1)
  } else if (edit.type === 'move') {
    if (!Number.isInteger(edit.to) || edit.to < 0 || edit.to >= old.length) throw new Error('Invalid slide position.')
    board.slides.splice(edit.to, 0, board.slides.splice(index, 1)[0]!)
  } else if (edit.type === 'duration') {
    if (!Number.isFinite(edit.duration) || edit.duration < MIN_SLIDE_DURATION) throw new Error('A slide must be at least 0.1 seconds long.')
    target!.duration = round(edit.duration)
  } else if (edit.type === 'rename') {
    const name = edit.name.trim()
    if (!name || name.length > 100) throw new Error('Use a slide name between 1 and 100 characters.')
    target!.name = name
  } else if (edit.type === 'transition') {
    if (index === old.length - 1) throw new Error('Add another slide before setting a transition.')
    if (!Number.isFinite(edit.duration) || edit.duration < 0 || edit.duration > 5) throw new Error('Use a transition between 0 and 5 seconds.')
    target!.transition = edit.duration ? { type: 'fade', duration: edit.duration } : undefined
  } else if (edit.type === 'loop') {
    if (!Number.isInteger(edit.loopCount) || edit.loopCount < 0 || edit.loopCount > 1000) throw new Error('Use 0 for forever, or 1–1000 plays.')
  }
  if (board.slides.length > MAX_SLIDES) throw new Error('A design can contain up to 50 slides.')
  if (new Set(board.slides.map(slide => slide.id)).size !== board.slides.length) throw new Error('Duplicate slide identity.')
  const ranges = slideRanges(board.slides)
  const total = ranges.at(-1)!.end
  if (total > MAX_SEQUENCE_DURATION) throw new Error('The full design must be 300 seconds or shorter.')
  for (const layer of board.layers) {
    if (layer.slideId) {
      const to = ranges.find(slide => slide.id === layer.slideId)!
      const fromId = edit.type === 'duplicate' && layer.slideId === edit.id ? target!.id : layer.slideId
      const from = old.find(slide => slide.id === fromId)!
      if (!to || !from) throw new Error('Artwork references a missing slide.')
      const scale = to.duration / from.duration
      mapLayerTime(layer, value => round(Math.max(to.start, Math.min(to.end, to.start + (value - from.start) * scale))), scale)
      if (layer.endTime <= layer.startTime) throw new Error('This duration makes an artwork clip too short. Use a longer slide.')
      layer.clipToPresence = true
    } else if (old.at(-1)!.end !== total) {
      // Shared audio and backdrops keep their full-sequence timing.
      const previousEnd = old.at(-1)!.end
      const scale = total / previousEnd
      mapLayerTime(layer, time => round(time * scale), scale)
    }
  }
  board.playback = { duration: total, loopCount: edit.type === 'loop' ? edit.loopCount : board.playback?.loopCount ?? 1 }
  // Explicit opacity overlays use the same renderer for editor, HTML, GIF and MP4.
  const top = Math.max(0, ...board.layers.map(layer => layer.zIndex)) + 1
  for (let i = 0; i < ranges.length - 1; i++) {
    const slide = ranges[i]!, next = ranges[i + 1]!
    if (!slide.transition) continue
    const duration = Math.min(slide.transition.duration, slide.duration, next.duration)
    board.slides[i]!.transition = { type: 'fade', duration }
    const at = slide.end
    board.layers.push({ id: nextId(), type: 'rect', name: `Transition after ${slide.name}`, slideTransitionFor: slide.id, x: 0, y: 0, w: format.w, h: format.h, zIndex: top + i, opacity: 0, fillColor: (board.bgColor && board.bgColor !== 'transparent' ? board.bgColor : board.layers.find(layer => layer.type === 'bg' && layer.bgColor && layer.bgColor !== 'transparent')?.bgColor) || '#0a0a10', locked: true, animIn: 'none', animOut: 'none', animOutEase: 'power1.in', animInDur: 0, dur: 0, delay: round(at - duration / 2), startTime: round(at - duration / 2), endTime: round(at + duration / 2), clipToPresence: true, keyframes: { opacity: [{ time: round(at - duration / 2), value: 0, easing: 'none' }, { time: at, value: 1, easing: 'none' }, { time: round(at + duration / 2), value: 0 }] } } as Layer)
  }
  return board
}
