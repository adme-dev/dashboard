// app/composables/useMediaProjectEditor.ts — wires an SP0 project + its presigned
// clip URLs into a REAL SP2a audio engine and exposes transport + edit actions.
// The master clock is engine.currentTime(); an rAF loop mirrors it into currentTime
// for the playhead (clock rule: the view slaves to the engine, never the reverse).
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, type ScheduledClip, type TrackBus } from '~~/app/utils/audio/audioSchedulePlanner'
import { createAudioEngine, type AudioEngine } from '~~/app/composables/useAudioEngine'
import { createBrowserAudioContext, browserSetTimer, makeR2Resolver } from '~~/app/utils/audio/audioContextFactory'
import { createUndoStack } from '~~/app/composables/useTimelineUndo'
import {
  cloneState,
  addClip, deleteClip, moveClip, trimClip, sliceClipAt
} from '~~/app/utils/audio/timelineEdit'

export type EditorStatus = 'idle' | 'loading' | 'ready' | 'error'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ---------------------------------------------------------------------------
// Pure debounced-saver helper — exported for unit testing
// ---------------------------------------------------------------------------
export function makeDebouncedSaver(fn: () => Promise<void>, ms: number): { trigger(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    trigger() {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        fn().catch(() => { /* errors surfaced via saveStatus */ })
      }, ms)
    }
  }
}

// ---------------------------------------------------------------------------
// Engine-reload orchestrator — extracted as a pure factory so the two reload
// correctness invariants can be unit-tested with a mock engine:
//   1. Latest-wins serialization: engine.load() clears+repopulates shared
//      instance maps and accumulates durationSec, so overlapping reloads
//      (rapid edits / undo spam) would interleave into a corrupt node graph.
//      A superseded reload aborts after its await without committing state.
//   2. Pause-before-load: engine.load() does NOT pause the transport or stop
//      active sources, so editing during playback would keep old sources
//      playing under the new schedule. We pause first, then restore + clamp the
//      playhead. Edits never auto-resume — the user presses play again.
export interface ReloaderEngine {
  isPlaying(): boolean
  pause(): void
  load(state: TimelineState): Promise<void>
  duration(): number
  seek(sec: number): void
  currentTime(): number
}

export interface ReloaderSink {
  /** Current playhead position (read before pause, restored after load). */
  getPlayhead(): number
  /** Called when a reload pauses an in-flight transport (mirror isPlaying=false + cancel rAF). */
  onPaused(): void
  /** Commit the planned clips/tracks once this reload wins. */
  commitPlan(state: TimelineState): void
  /** Commit duration + playhead once this reload wins. */
  commitTransport(duration: number, currentTime: number): void
}

export function makeEngineReloader(
  engine: ReloaderEngine,
  sink: ReloaderSink,
  plan: (state: TimelineState) => void
) {
  let reloadSeq = 0
  return async function reload(state: TimelineState) {
    const wasPlaying = engine.isPlaying()
    const at = sink.getPlayhead()
    if (wasPlaying) { engine.pause(); sink.onPaused() }
    const seq = ++reloadSeq
    plan(state)               // planning is local/cheap; commit of clips/tracks waits for the win
    await engine.load(state)
    if (seq !== reloadSeq) return            // a newer reload superseded this one
    sink.commitPlan(state)
    const duration = engine.duration()
    engine.seek(Math.min(at, duration))      // clamp the playhead if the timeline shortened
    sink.commitTransport(duration, engine.currentTime())
  }
}

export function useMediaProjectEditor(projectId: string) {
  const timeline = ref<TimelineState | null>(null)
  const clips = ref<ScheduledClip[]>([])
  const tracks = ref<TrackBus[]>([])
  const status = ref<EditorStatus>('idle')
  const error = ref<string | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const canUndo = ref(false)
  const canRedo = ref(false)
  const saveStatus = ref<SaveStatus>('idle')
  // Live presigned-URL map — keyed by r2_key. makeR2Resolver reads from this map
  // on every resolve call so newly-added clip URLs are visible without rebuilding
  // the resolver.  sourcesRef is a reactive snapshot of the map — passed as the
  // :sources prop to MediaTimeline so wavesurfer waveforms update when new clips
  // are added.
  const sourcesMap = new Map<string, string>()
  const sourcesRef = ref<Record<string, string>>({})

  let engine: AudioEngine | null = null
  let raf = 0

  // Undo/redo stack — instantiated once per editor instance.
  const undo = createUndoStack<TimelineState>({ limit: 100 })

  // ---------------------------------------------------------------------------
  // Autosave wiring
  // ---------------------------------------------------------------------------
  async function doSave() {
    if (!timeline.value) return
    saveStatus.value = 'saving'
    try {
      await $fetch(`/api/agency/audio/projects/${projectId}/timeline`, {
        method: 'PUT',
        body: { state: timeline.value }
      })
      saveStatus.value = 'saved'
    } catch {
      saveStatus.value = 'error'
    }
  }

  const saver = makeDebouncedSaver(doSave, 1500)
  function scheduleAutosave() { saver.trigger() }

  // ---------------------------------------------------------------------------
  // Engine reload — re-plans and re-loads the engine after an edit
  // ---------------------------------------------------------------------------
  // The serialize/pause/clamp logic lives in the testable makeEngineReloader
  // factory (see top of file). It's bound lazily once the engine exists.
  let runReload: ((state: TimelineState) => Promise<void>) | null = null
  function reloadEngine(state: TimelineState): Promise<void> {
    if (!engine || !runReload) return Promise.resolve()
    return runReload(state)
  }

  // ---------------------------------------------------------------------------
  // applyEdit — the single entry point for all mutations
  // ---------------------------------------------------------------------------
  function syncUndoRedo() {
    canUndo.value = undo.canUndo()
    canRedo.value = undo.canRedo()
  }

  function applyEdit(next: TimelineState) {
    if (!timeline.value) return
    // Push the CURRENT state onto the undo stack before replacing it.
    undo.push(timeline.value)
    timeline.value = next
    void reloadEngine(next)
    scheduleAutosave()
    syncUndoRedo()
  }

  // ---------------------------------------------------------------------------
  // Edit action wrappers
  // ---------------------------------------------------------------------------
  function moveClipAction(clipId: string, toTrackId: string, newStartSec: number) {
    if (!timeline.value) return
    applyEdit(moveClip(timeline.value, { clipId, toTrackId, newStartSec }))
  }

  function trimClipAction(clipId: string, edge: 'start' | 'end', newTimeSec: number) {
    if (!timeline.value || !engine) return
    applyEdit(trimClip(timeline.value, { clipId, edge, newTimeSec, sourceDurationSec: engine.clipSourceDuration(clipId) }))
  }

  function sliceAction(clipId: string, timeSec: number) {
    if (!timeline.value || !engine) return
    applyEdit(sliceClipAt(timeline.value, {
      clipId, timeSec,
      leftId: crypto.randomUUID(),
      rightId: crypto.randomUUID(),
      sourceDurationSec: engine.clipSourceDuration(clipId)
    }))
  }

  /** Merge a presigned URL into the live sources map so the resolver + waveform
   * prop see it immediately. Call this BEFORE addClipAction when you have a URL. */
  function mergeSource(r2Key: string, url: string) {
    sourcesMap.set(r2Key, url)
    // Bump sourcesRef so watchers / MediaTimeline :sources prop update
    sourcesRef.value = Object.fromEntries(sourcesMap)
  }

  function addClipAction(
    trackId: string,
    asset: { id: string; r2_key_master: string },
    startSec: number,
    presignedUrl?: string
  ) {
    if (!timeline.value) return
    // Merge the presigned URL before the engine reload so the resolver sees it.
    if (presignedUrl && asset.r2_key_master) {
      mergeSource(asset.r2_key_master, presignedUrl)
    }
    applyEdit(addClip(timeline.value, { trackId, id: crypto.randomUUID(), asset, startSec }))
  }

  function deleteClipAction(clipId: string) {
    if (!timeline.value) return
    applyEdit(deleteClip(timeline.value, { clipId }))
  }

  function undoAction() {
    if (!timeline.value) return
    const prev = undo.undo(timeline.value)
    if (prev) {
      timeline.value = prev
      void reloadEngine(prev)
      scheduleAutosave()
      syncUndoRedo()
    }
  }

  function redoAction() {
    if (!timeline.value) return
    const nxt = undo.redo(timeline.value)
    if (nxt) {
      timeline.value = nxt
      void reloadEngine(nxt)
      scheduleAutosave()
      syncUndoRedo()
    }
  }

  // ---------------------------------------------------------------------------
  // Version snapshots
  // ---------------------------------------------------------------------------

  /** Snapshot the CURRENT timeline as a named version (server-side copy). */
  async function saveVersion(label: string) {
    // versions.post reads body: { label?: string | null }
    // It snapshots the server's current draft timeline; save first so it's up to date.
    await doSave()
    return $fetch(`/api/agency/audio/projects/${projectId}/versions`, {
      method: 'POST',
      body: { label }
    })
  }

  /** List all saved versions for this project. Returns { versions: [...] } */
  async function listVersions() {
    return $fetch<{ versions: Array<{ id: string; label: string | null; created_at: string; state: TimelineState }> }>(
      `/api/agency/audio/projects/${projectId}/versions`
    )
  }

  /** Restore a previously-saved version as the new working state. */
  function restoreVersion(state: TimelineState) {
    applyEdit(cloneState(state))
  }

  // ---------------------------------------------------------------------------
  // Init / transport
  // ---------------------------------------------------------------------------
  async function init() {
    status.value = 'loading'
    error.value = null
    try {
      // The SP0 project GET returns the MediaTimeline WRAPPER; the TimelineState lives
      // in `.state` (validated on write — cast rather than re-import the Zod value client-side).
      const [proj, src] = await Promise.all([
        $fetch<{ project: unknown; timeline: { state: unknown } | null }>(`/api/agency/audio/projects/${projectId}`),
        $fetch<{ sources: Record<string, string> }>(`/api/agency/audio/projects/${projectId}/clip-sources`)
      ])
      const state = proj.timeline?.state as TimelineState | undefined
      if (!state) { status.value = 'error'; error.value = 'This project has no timeline yet.'; return }
      timeline.value = state
      // Populate the live sources map from the initial presigned URLs
      for (const [k, v] of Object.entries(src.sources)) sourcesMap.set(k, v)
      sourcesRef.value = Object.fromEntries(sourcesMap)
      const plan = planTimeline(state)
      clips.value = plan.clips
      tracks.value = plan.tracks
      const ctx = createBrowserAudioContext(state.sample_rate)
      engine = createAudioEngine({
        ctx: ctx as any,
        resolveBuffer: makeR2Resolver(sourcesMap, ctx),
        setTimer: browserSetTimer,
        now: () => ctx.currentTime
      })
      // Bind the serialized reload orchestrator to this engine + reactive sink.
      runReload = makeEngineReloader(
        engine,
        {
          getPlayhead: () => currentTime.value,
          onPaused: () => { isPlaying.value = false; cancelAnimationFrame(raf) },
          commitPlan: (s) => { const p = planTimeline(s); clips.value = p.clips; tracks.value = p.tracks },
          commitTransport: (dur, ct) => { duration.value = dur; currentTime.value = ct }
        },
        () => { /* planning committed on win in commitPlan */ }
      )
      await engine.load(state)
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

  return {
    // State
    timeline, clips, tracks, status, error,
    isPlaying, currentTime, duration,
    canUndo, canRedo, saveStatus,
    /** Reactive snapshot of { r2_key → presigned URL } — pass as :sources to MediaTimeline */
    sources: sourcesRef,
    // Transport
    play, pause, seek,
    // Edit actions
    moveClipAction, trimClipAction, sliceAction,
    addClipAction, deleteClipAction,
    undoAction, redoAction,
    /** Merge a new presigned URL into the live sources map (called before addClipAction). */
    mergeSource,
    // Version management
    saveVersion, listVersions, restoreVersion
  }
}
