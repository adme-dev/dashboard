import type { Layer } from '~/types/banner-studio'

export interface PreviewAudioTrack {
  layer: Layer
  media: HTMLAudioElement
}

/** Native audio stays in the page that receives the Play tap, outside the sandboxed artwork. */
export function createBannerPreviewAudioController(
  tracks: () => PreviewAudioTrack[],
  onError: (message: string) => void
) {
  const pending = new WeakSet<HTMLAudioElement>()
  const failed = new WeakSet<HTMLAudioElement>()
  const deferredSeek = new WeakMap<HTMLAudioElement, number>()
  let playing = false
  let previousTime = 0
  let previousIteration = 1
  let muted = false

  function volume(layer: Layer): number {
    return Math.max(0, Math.min(1, layer.volume ?? 1))
  }

  function play(media: HTMLAudioElement) {
    if (!media.paused || pending.has(media) || failed.has(media) || (media.ended && !media.loop)) return
    pending.add(media)
    try {
      Promise.resolve(media.play()).catch((error) => {
        if (error?.name !== 'AbortError') {
          failed.add(media)
          onError(error?.name === 'NotAllowedError'
            ? 'Safari blocked sound. Pause, then tap Play again.'
            : 'An audio track could not play. Try replaying the preview.')
        }
      }).finally(() => {
        pending.delete(media)
        if (!playing) media.pause()
      })
    } catch (error) {
      pending.delete(media)
      failed.add(media)
      onError(error instanceof Error && error.name === 'NotAllowedError'
        ? 'Safari blocked sound. Pause, then tap Play again.'
        : 'An audio track could not play. Try replaying the preview.')
    }
  }

  function position(media: HTMLAudioElement, time: number) {
    if (media.readyState === 0) deferredSeek.set(media, time)
    if (Math.abs(media.currentTime - time) < 0.05) return
    try {
      media.currentTime = time
    } catch { /* Retry from the loadedmetadata event. */ }
  }

  function update(time: number, iteration: number, explicitSeek: boolean) {
    const looped = iteration !== previousIteration || time < previousTime - 0.5
    for (const { layer, media } of tracks()) {
      const start = layer.startTime || 0
      const end = layer.endTime ?? Infinity
      const before = time < start
      const after = time >= end
      const entered = previousTime < start && time >= start
      if (before || after) {
        media.pause()
        if (before && (explicitSeek || looped)) position(media, 0)
        continue
      }
      if (explicitSeek || looped || entered) position(media, Math.max(0, time - start))
      // iPhone locks HTMLMediaElement.volume to full scale. Use muted for the
      // sound toggle; volume still applies the layer level on desktop Safari.
      media.muted = muted || !!layer.hidden || !!layer.muted
      media.volume = volume(layer)
      if (playing) play(media)
    }
    previousTime = time
    previousIteration = iteration
  }

  return {
    start(time: number, iteration: number) {
      playing = true
      for (const { media } of tracks()) failed.delete(media)
      // play() runs synchronously in the outer UButton click handler.
      update(time, iteration, true)
    },
    sync(time: number, iteration: number) {
      if (playing) update(time, iteration, false)
    },
    pause() {
      playing = false
      for (const { media } of tracks()) media.pause()
    },
    seek(time: number, iteration = 1) {
      playing = false
      for (const { media } of tracks()) media.pause()
      update(time, iteration, true)
    },
    setMuted(value: boolean) {
      muted = value
      for (const { layer, media } of tracks()) {
        media.muted = value || !!layer.hidden || !!layer.muted
      }
    },
    loaded(media: HTMLAudioElement) {
      const time = deferredSeek.get(media)
      if (time === undefined) return
      deferredSeek.delete(media)
      position(media, time)
    }
  }
}
