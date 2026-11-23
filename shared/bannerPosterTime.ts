import type { Layer } from '../app/types/banner-studio'
import { safeWordEntrance, wordEntranceDelay } from './bannerImportedMotion'

/** Honour a designer's saved frame; otherwise choose readable, settled timeline content. */
export function bannerPosterTime(duration: number, selected?: number, layers: Layer[] = []) {
  const length = Number.isFinite(duration) && duration > 0 ? Math.min(300, duration) : 5
  const last = Math.max(0, length - 0.001)
  if (Number.isFinite(selected)) return Math.max(0, Math.min(last, selected!))
  const background = layers.find(layer => layer.type === 'bg')
  const area = Math.max(1, background ? background.w * background.h : Math.max(1, ...layers.map(layer => (layer.w || 0) * (layer.h || 0))))
  const visible = layers.filter(layer => !layer.hidden && !layer.isMask && layer.type !== 'audio' && (layer.type !== 'bg' || !!layer.src))
  if (!visible.length) return Math.min(3, length / 2)
  const samples = visible.map((layer) => {
    const start = Number.isFinite(layer.startTime) ? layer.startTime : 0
    const end = Number.isFinite(layer.endTime) ? layer.endTime : length
    const tracks = Object.values(layer.keyframes || {}).filter((track): track is NonNullable<typeof track> => !!track?.length)
    const opacity = layer.keyframes?.opacity
    const word = safeWordEntrance(layer.wordPop)
    const count = word?.unit === 'character' ? Array.from(layer.text || '').length : (layer.text || '').trim().split(/\s+/).length
    const entrance = word
      ? (word.offset || 0) + word.duration + wordEntranceDelay(word, Math.max(0, count - 1))
      : layer.reveal?.duration || (!tracks.length && layer.animIn && layer.animIn !== 'none' ? layer.animInDur || 0 : 0)
    const entered = (layer.animInStart ?? start) + entrance
    const exit = layer.animOut && layer.animOut !== 'none' ? layer.animOutStart ?? end - (layer.outDur || 0) : end
    const text = !!layer.text?.trim() && (layer.type === 'text' || layer.type === 'button')
    const visual = layer.type === 'image' || layer.type === 'video' || (layer.type === 'bg' && !!layer.src)
    const weight = text ? 2 + Math.min(80, layer.text!.trim().length) / 20 : visual ? 1 + 12 * Math.min(1, Math.max(0, layer.w * layer.h) / area) : 0.25
    return { layer, start, end, entered, exit, tracks, opacity, weight, visual, mainVisual: visual && layer.w * layer.h / area > 0.15 }
  })
  const hasMainVisual = samples.some(sample => sample.mainVisual)
  let best = Math.min(3, length / 2), bestScore = -Infinity
  // A fixed sample budget bounds work even on long, densely keyframed artwork.
  for (let index = 0; index <= 120; index++) {
    const time = Math.min(last, (index === 120 ? length / 2 : length * (index + 0.5) / 120))
    let score = -0.005 * Math.abs(time - length / 2) / length
    let visualScore = 0, mainVisible = 0
    for (const sample of samples) {
      if (time < sample.start || time >= sample.end) continue
      let opacity = sample.layer.opacity ?? 1
      if (sample.opacity?.length) {
        opacity = Number(sample.opacity[0]!.value)
        for (let i = 0; i < sample.opacity.length; i++) {
          const frame = sample.opacity[i]!, next = sample.opacity[i + 1]
          if (time < frame.time) break
          opacity = Number(frame.value)
          if (next && time < next.time) {
            opacity += (Number(next.value) - opacity) * (time - frame.time) / (next.time - frame.time)
            break
          }
        }
      }
      if (!Number.isFinite(opacity)) continue
      const moving = sample.tracks.some(track => track.some((frame, i) => {
        const next = track[i + 1]
        return next && frame.value !== next.value && time >= frame.time && time < next.time
      }))
      const settled = time >= sample.entered + 0.15 && time < sample.exit - 0.15 && !moving
      const value = sample.weight * Math.max(0, Math.min(1, opacity)) * (settled ? 1 : 0.45)
      if (sample.mainVisual) mainVisible = Math.max(mainVisible, Math.max(0, Math.min(1, opacity)))
      if (sample.visual) visualScore = Math.max(visualScore, value)
      else score += value
    }
    score += visualScore
    if (hasMainVisual) score *= 0.4 + 0.6 * mainVisible
    // Do not reward overlapping scenes just because both contain visible copy.
    if (samples.some(sample => Math.abs(time - sample.start) < 0.35 || Math.abs(time - sample.end) < 0.35)) score *= 0.4
    if (score > bestScore) {
      bestScore = score
      best = time
    }
  }
  return Math.round(best * 1000) / 1000
}
