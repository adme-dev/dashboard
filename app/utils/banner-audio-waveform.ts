export interface AudioWaveform {
  duration: number
  peaks: Float32Array
}

// Share decoding across linked layouts, retaining only small peak arrays.
const cache = new Map<string, Promise<AudioWaveform>>()
const MAX_SOURCES = 24

export function audioWaveform(src: string): Promise<AudioWaveform> {
  const existing = cache.get(src)
  if (existing) return existing
  const pending = (async () => {
    const response = await fetch(src)
    if (!response.ok) throw new Error('Audio preview unavailable')
    const buffer = await response.arrayBuffer()
    const context = new AudioContext()
    try {
      const audio = await context.decodeAudioData(buffer)
      const count = Math.min(4096, audio.length)
      const peaks = new Float32Array(count)
      let maximum = 0
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        const samples = audio.getChannelData(channel)
        for (let i = 0; i < count; i++) {
          const end = Math.floor((i + 1) * samples.length / count)
          for (let j = Math.floor(i * samples.length / count); j < end; j++) {
            peaks[i] = Math.max(peaks[i]!, Math.abs(samples[j]!))
          }
          maximum = Math.max(maximum, peaks[i]!)
        }
      }
      if (maximum > 0) for (let i = 0; i < count; i++) peaks[i] /= maximum
      return { duration: audio.duration, peaks }
    } finally {
      await context.close()
    }
  })()
  cache.set(src, pending)
  if (cache.size > MAX_SOURCES) cache.delete(cache.keys().next().value!)
  void pending.catch(() => {
    // Failures can be retried when the track remounts or its URL changes.
    if (cache.get(src) === pending) cache.delete(src)
  })
  return pending
}

/** Sample timeline seconds, so extending a clip never stretches the source audio. */
export function waveformBars(waveform: AudioWaveform, span: number, count: number, loop = false, clock: { mediaStart?: number, mediaEnd?: number } = {}): number[] {
  const { duration, peaks } = waveform
  if (duration <= 0 || !peaks.length || span <= 0 || count <= 0) return []
  const sourceStart = Math.max(0, Math.min(duration, clock.mediaStart ?? 0))
  const sourceEnd = Math.min(duration, clock.mediaEnd ?? duration)
  const length = sourceEnd - sourceStart
  if (!(length > 0)) return []
  return Array.from({ length: count }, (_, i) => {
    const start = i * span / count
    const end = (i + 1) * span / count
    if (!loop && start >= length) return 0
    if (loop && end - start >= length) {
      const selected = peaks.subarray(Math.floor(sourceStart / duration * peaks.length), Math.ceil(sourceEnd / duration * peaks.length))
      return Math.max(0, ...selected)
    }
    const peakAt = (from: number, to: number) => {
      let peak = 0
      const first = Math.floor(from / duration * peaks.length)
      const last = Math.min(peaks.length, Math.ceil(to / duration * peaks.length))
      for (let j = first; j < last; j++) peak = Math.max(peak, peaks[j]!)
      return peak
    }
    if (!loop) return peakAt(sourceStart + start, Math.min(sourceStart + end, sourceEnd))
    const from = sourceStart + start % length
    const to = from + end - start
    return to <= sourceEnd ? peakAt(from, to) : Math.max(peakAt(from, sourceEnd), peakAt(sourceStart, sourceStart + to - sourceEnd))
  })
}
