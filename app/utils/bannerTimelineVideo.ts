import type gsap from 'gsap'
import { createBannerVideoTransport, type BannerVideoPlaybackClock } from './bannerVideoPlayback'

const owners = new WeakMap<gsap.core.Timeline, { transport: ReturnType<typeof createBannerVideoTransport>, videos: Array<{ video: HTMLVideoElement, clock: BannerVideoPlaybackClock }> }>()

export function registerTimelineVideo(timeline: gsap.core.Timeline, video: HTMLVideoElement, clock: BannerVideoPlaybackClock) {
  let owner = owners.get(timeline)
  if (!owner) {
    owner = { transport: createBannerVideoTransport(), videos: [] }
    owners.set(timeline, owner)
    const previous = timeline.eventCallback('onUpdate')
    timeline.eventCallback('onUpdate', () => {
      previous?.call(timeline)
      syncTimelineVideo(timeline)
    })
  }
  owner.videos.push({ video, clock })
  owner.transport.sync(video, timeline.time(), false, clock)
}

export function syncTimelineVideo(timeline: gsap.core.Timeline) {
  const owner = owners.get(timeline)
  for (const { video, clock } of owner?.videos ?? []) {
    video.playbackRate = Math.max(0.0625, Math.min(16, Math.abs(timeline.timeScale()) || 1))
    owner!.transport.sync(video, timeline.time(), !timeline.paused() && timeline.timeScale() > 0, clock)
  }
}

export function pauseTimelineVideo(timeline: gsap.core.Timeline) {
  owners.get(timeline)?.transport.pause()
}

export function disposeTimelineVideo(timeline: gsap.core.Timeline) {
  owners.get(timeline)?.transport.dispose()
  owners.delete(timeline)
}
