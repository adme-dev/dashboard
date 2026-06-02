// app/composables/useMediaProjectEditor.ts — wires an SP0 project + its presigned
// clip URLs into a REAL SP2a audio engine and exposes read-only transport. The
// master clock is engine.currentTime(); an rAF loop mirrors it into currentTime for
// the playhead (clock rule: the view slaves to the engine, never the reverse).
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, type ScheduledClip, type TrackBus } from '~~/app/utils/audio/audioSchedulePlanner'
import { createAudioEngine, type AudioEngine } from '~~/app/composables/useAudioEngine'
import { createBrowserAudioContext, browserSetTimer, makeR2Resolver } from '~~/app/utils/audio/audioContextFactory'

export type EditorStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useMediaProjectEditor(projectId: string) {
  const timeline = ref<TimelineState | null>(null)
  const clips = ref<ScheduledClip[]>([])
  const tracks = ref<TrackBus[]>([])
  const status = ref<EditorStatus>('idle')
  const error = ref<string | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)

  let engine: AudioEngine | null = null
  let raf = 0

  async function init() {
    status.value = 'loading'
    error.value = null
    try {
      const [proj, src] = await Promise.all([
        $fetch<{ project: unknown; timeline: TimelineState | null }>(`/api/agency/audio/projects/${projectId}`),
        $fetch<{ sources: Record<string, string> }>(`/api/agency/audio/projects/${projectId}/clip-sources`)
      ])
      if (!proj.timeline) { status.value = 'error'; error.value = 'This project has no timeline yet.'; return }
      timeline.value = proj.timeline
      const plan = planTimeline(proj.timeline)
      clips.value = plan.clips
      tracks.value = plan.tracks
      const ctx = createBrowserAudioContext(proj.timeline.sample_rate)
      engine = createAudioEngine({
        ctx: ctx as any,
        resolveBuffer: makeR2Resolver(src.sources, ctx),
        setTimer: browserSetTimer,
        now: () => ctx.currentTime
      })
      await engine.load(proj.timeline)
      duration.value = engine.duration()
      status.value = 'ready'
    } catch (e: any) {
      status.value = 'error'
      error.value = e?.message ?? 'Failed to load the project audio.'
    }
  }

  function tickClock() {
    if (!engine) return
    currentTime.value = engine.currentTime()
    if (engine.isPlaying()) {
      raf = requestAnimationFrame(tickClock)
    } else {
      isPlaying.value = false
      cancelAnimationFrame(raf)
    }
  }

  function play() {
    if (!engine || status.value !== 'ready') return
    engine.play()                 // resumes a suspended ctx (autoplay policy)
    isPlaying.value = true
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(tickClock)
  }

  function pause() {
    if (!engine) return
    engine.pause()
    isPlaying.value = false
    cancelAnimationFrame(raf)
    currentTime.value = engine.currentTime()
  }

  function seek(sec: number) {
    if (!engine) return
    engine.seek(sec)
    currentTime.value = engine.currentTime()
  }

  onMounted(() => { void init() })
  onBeforeUnmount(() => { cancelAnimationFrame(raf); engine?.dispose(); engine = null })

  return { timeline, clips, tracks, status, error, isPlaying, currentTime, duration, play, pause, seek }
}
