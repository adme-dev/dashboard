// app/composables/useMediaProjectEditor.ts — wires an SP0 project + its presigned
// clip URLs into a REAL SP2a audio engine and exposes transport + edit actions.
// The master clock is engine.currentTime(); an rAF loop mirrors it into currentTime
// for the playhead (clock rule: the view slaves to the engine, never the reverse).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, type ScheduledClip, type TrackBus } from '~~/app/utils/audio/audioSchedulePlanner'
import { createAudioEngine, type AudioEngine, type AudioEngineDeps, type LoadResult } from '~~/app/composables/useAudioEngine'
import { createBrowserAudioContext, browserSetTimer, makeR2Resolver } from '~~/app/utils/audio/audioContextFactory'
import { createUndoStack } from '~~/app/composables/useTimelineUndo'
import { apiErrorDescription, apiErrorStatus } from '~~/app/utils/apiError'
import { resolveClipStartSec } from '~~/app/utils/video/timelinePlacement'
import {
  cloneState,
  addClip, addTrack, deleteClip, moveClip, trimClip, sliceClipAt,
  addVideoClip, addOverlayClip, addCaptionClip, trimVisualClip, setClipEffects, setClipFit,
  type VideoClipFit
} from '~~/app/utils/audio/timelineEdit'
import {
  createVideoSourceRegistry,
  mergeVideoSource,
  videoSourceRecord,
  type VideoSourceInput,
} from '~~/app/utils/video/videoSourceRegistry'
import type { Track } from '~~/server/utils/audio/timelineSchema'
import type { MediaRenderJob } from '~~/app/types'
import type { VideoAsset } from '~~/server/utils/video/assets'

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
  load(state: TimelineState): Promise<LoadResult | void>
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
  /** Commit the set of clips whose source couldn't be resolved, once this reload wins.
   * Lets the warning banner clear after the user removes/replaces a dead clip. */
  commitMissing(missingClipIds: string[]): void
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
    const result = await engine.load(state)
    if (seq !== reloadSeq) return            // a newer reload superseded this one
    sink.commitPlan(state)
    sink.commitMissing(result ? result.missingClipIds : [])
    const duration = engine.duration()
    engine.seek(Math.min(at, duration))      // clamp the playhead if the timeline shortened
    sink.commitTransport(duration, engine.currentTime())
  }
}

// ---------------------------------------------------------------------------
// V1.3 AV pure helpers — exported for unit testing
// ---------------------------------------------------------------------------

/** Resolve a clip's kind from the timeline. Missing `type` === audio (addClip omits it). */
export function clipKindOf(state: TimelineState, clipId: string): 'audio' | 'video' | 'overlay' | 'caption' | null {
  for (const t of state.tracks) {
    const c = t.clips.find(x => x.id === clipId)
    if (c) return c.type === 'video' ? 'video' : c.type === 'overlay' ? 'overlay' : c.type === 'caption' ? 'caption' : 'audio'
  }
  return null
}

/** Poll cadence for render jobs: null = stop (terminal), else ms until next poll. */
export function nextPollDelay(status: string): number | null {
  if (status === 'done' || status === 'failed') return null
  return 2500
}

/** Read a video File's intrinsic duration (seconds) via an object URL. Falls back to 5s. */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5) }
      v.onerror = () => { URL.revokeObjectURL(url); resolve(5) }
      v.src = url
    } catch { resolve(5) }
  })
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
  // Clip ids whose audio source couldn't be resolved (deleted/404). Non-fatal: the
  // project still loads (status 'ready'); the page shows a warning so the user can
  // remove or replace them. Kept in sync on every engine reload via commitMissing.
  const missingClipIds = ref<string[]>([])
  const mediaType = computed(() => timeline.value?.media_type ?? 'audio')
  // Live presigned-URL map — keyed by r2_key. makeR2Resolver reads from this map
  // on every resolve call so newly-added clip URLs are visible without rebuilding
  // the resolver.  sourcesRef is a reactive snapshot of the map — passed as the
  // :sources prop to MediaTimeline so wavesurfer waveforms update when new clips
  // are added.
  const sourcesRegistry = createVideoSourceRegistry()
  const sourcesMap = new Map<string, string>()
  const sourcesRef = ref<Record<string, string>>({})

  let engine: AudioEngine | null = null
  let raf = 0

  // Undo/redo stack — instantiated once per editor instance.
  const undo = createUndoStack<TimelineState>({ limit: 100 })

  // ---------------------------------------------------------------------------
  // Autosave wiring
  // ---------------------------------------------------------------------------
  async function doSave(): Promise<boolean> {
    if (!timeline.value) return false
    saveStatus.value = 'saving'
    try {
      await $fetch(`/api/agency/audio/projects/${projectId}/timeline`, {
        method: 'PUT',
        body: { state: timeline.value }
      })
      saveStatus.value = 'saved'
      return true
    } catch {
      saveStatus.value = 'error'
      return false
    }
  }

  const saver = makeDebouncedSaver(async () => { await doSave() }, 1500)
  function scheduleAutosave() { saver.trigger() }
  async function saveNow() {
    const saved = await doSave()
    if (!saved) throw new Error('Could not save timeline')
  }

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

  /** Replace the effect presets on a video clip. One undo step; no-op for non-video clips. */
  function setClipEffectsAction(clipId: string, effects: string[]) {
    if (!timeline.value) return
    const next = setClipEffects(timeline.value, { clipId, effects })
    if (next !== timeline.value) applyEdit(next)
  }

  /** Replace the framing mode on a video clip. One undo step; no-op for non-video clips. */
  function setClipFitAction(clipId: string, fit: VideoClipFit) {
    if (!timeline.value) return
    const next = setClipFit(timeline.value, { clipId, fit })
    if (next !== timeline.value) applyEdit(next)
  }

  function trimClipAction(clipId: string, edge: 'start' | 'end', newTimeSec: number) {
    if (!timeline.value) return
    const kind = clipKindOf(timeline.value, clipId)
    if (kind === 'video' || kind === 'overlay' || kind === 'caption') {
      applyEdit(trimVisualClip(timeline.value, { clipId, edge, newTimeSec }))
      return
    }
    if (!engine) return
    applyEdit(trimClip(timeline.value, { clipId, edge, newTimeSec, sourceDurationSec: engine.clipSourceDuration(clipId) }))
  }

  function sliceAction(clipId: string, timeSec: number) {
    if (!timeline.value || !engine) return
    if (clipKindOf(timeline.value, clipId) !== 'audio') return   // V1.3: audio-only slice
    applyEdit(sliceClipAt(timeline.value, {
      clipId, timeSec,
      leftId: crypto.randomUUID(),
      rightId: crypto.randomUUID(),
      sourceDurationSec: engine.clipSourceDuration(clipId)
    }))
  }

  /** Merge a presigned URL into the live sources map so the resolver + waveform
   * prop see it immediately. Call this BEFORE addClipAction when you have a URL. */
  function mergeSource(r2Key: string, url: string, metadata: Partial<Omit<VideoSourceInput, 'r2Key' | 'url'>> = {}) {
    sourcesMap.set(r2Key, url)
    mergeVideoSource(sourcesRegistry, { r2Key, url, ...metadata })
    // Bump sourcesRef so watchers / MediaTimeline :sources prop update
    sourcesRef.value = videoSourceRecord(sourcesRegistry)
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

  /** Append a new empty track of the given kind. Returns the new track id (or null
   * if there's no timeline yet). One undo step. */
  function addTrackAction(kind: Track['kind'], name?: string): string | null {
    if (!timeline.value) return null
    const id = crypto.randomUUID()
    applyEdit(addTrack(timeline.value, { id, kind, name }))
    return id
  }

  /** Add a clip, creating a track of the asset's kind if none exists. Resolves the
   * dead-end where a project with no matching lane silently dropped the add. Track
   * creation + clip insert collapse into a single edit (one undo step). */
  function addClipToKindTrackAction(
    asset: { id: string; r2_key_master: string; kind: Track['kind'] },
    startSec: number,
    presignedUrl?: string
  ) {
    if (!timeline.value) return
    if (presignedUrl && asset.r2_key_master) {
      mergeSource(asset.r2_key_master, presignedUrl)
    }
    let next = timeline.value
    let track = next.tracks.find(t => t.kind === asset.kind)
    if (!track) {
      // No lane of the asset's kind (or an empty timeline) — append one rather
      // than mixing kinds or silently dropping the add.
      const id = crypto.randomUUID()
      next = addTrack(next, { id, kind: asset.kind })
      track = next.tracks.find(t => t.id === id)!
    }
    applyEdit(addClip(next, {
      trackId: track.id, id: crypto.randomUUID(),
      asset: { id: asset.id, r2_key_master: asset.r2_key_master }, startSec
    }))
  }

  // ─── V1.3 AV actions ──────────────────────────────────────────────────────────

  /** Upload footage/still → R2 → merge its presigned URL into sources → return r2_key + duration. */
  async function uploadMedia(file: File, kind: 'footage' | 'still'): Promise<{ r2Key: string; url: string; durationSec: number }> {
    const durationSec = kind === 'footage' ? await readVideoDuration(file) : 5
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    const res = await $fetch<{ r2_key: string; url: string }>(`/api/agency/audio/projects/${projectId}/upload-media`, { method: 'POST', body: fd })
    mergeSource(res.r2_key, res.url, { durationSec })
    return { r2Key: res.r2_key, url: res.url, durationSec }
  }

  /** Add a video clip (footage or still). Ensures a video track exists. One undo step.
   * If the desired start would overlap an existing clip, appends after the last clip
   * instead of stacking (every add path defaults to the playhead, usually 0s). */
  function addVideoClipAction(r2Key: string, durationSec: number, baseSource: 'uploaded_footage' | 'still_kenburns', startSec: number, assetId: string | null = null) {
    if (!timeline.value) return
    let next = timeline.value
    let track = next.tracks.find(t => t.kind === 'video')
    if (!track) { const tid = crypto.randomUUID(); next = addTrack(next, { id: tid, kind: 'video' }); track = next.tracks.find(t => t.id === tid)! }
    const placedStart = resolveClipStartSec(next, 'video', startSec, durationSec)
    applyEdit(addVideoClip(next, { trackId: track.id, id: crypto.randomUUID(), assetId, r2Key, startSec: placedStart, durationSec, baseSource }))
  }

  /** Add an overlay clip from a Banner project + format. Ensures an overlay track exists. */
  function addOverlayClipAction(gsapProjectId: string, gsapFormatKey: string, durationSec: number, startSec: number) {
    if (!timeline.value) return
    let next = timeline.value
    let track = next.tracks.find(t => t.kind === 'overlay')
    if (!track) { const tid = crypto.randomUUID(); next = addTrack(next, { id: tid, kind: 'overlay' }); track = next.tracks.find(t => t.id === tid)! }
    const placedStart = resolveClipStartSec(next, 'overlay', startSec, durationSec)
    applyEdit(addOverlayClip(next, { trackId: track.id, id: crypto.randomUUID(), gsapProjectId, gsapFormatKey, startSec: placedStart, durationSec }))
  }

  /** Add burn-in captions to the AV timeline. Ensures a caption track exists. */
  function addCaptionClipAction(text: string, startSec: number, durationSec: number, sourceAssetId: string | null = null, captionVttUrl: string | null = null) {
    if (!timeline.value || !text.trim()) return
    let next = timeline.value
    let track = next.tracks.find(t => t.kind === 'caption')
    if (!track) { const tid = crypto.randomUUID(); next = addTrack(next, { id: tid, kind: 'caption', name: 'Captions' }); track = next.tracks.find(t => t.id === tid)! }
    const placedStart = resolveClipStartSec(next, 'caption', startSec, durationSec)
    applyEdit(addCaptionClip(next, {
      trackId: track.id,
      id: crypto.randomUUID(),
      text,
      sourceAssetId,
      captionVttUrl,
      startSec: placedStart,
      durationSec
    }))
  }

  // ─── Render jobs ────────────────────────────────────────────────────────────
  const renderJobs = ref<MediaRenderJob[]>([])
  const rendering = ref(false)
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  async function refreshRenderJobs() {
    try {
      const res = await $fetch<{ jobs: MediaRenderJob[] }>(`/api/agency/audio/projects/${projectId}/render-jobs`)
      renderJobs.value = res?.jobs ?? []
    } catch { /* surfaced via UI emptiness */ }
  }

  function scheduleJobPoll() {
    if (pollTimer) clearTimeout(pollTimer)
    const active = renderJobs.value.some(j => j.status === 'queued' || j.status === 'rendering')
    const delay = active ? nextPollDelay('rendering') : null
    if (delay == null) return
    pollTimer = setTimeout(async () => { await refreshRenderJobs(); scheduleJobPoll() }, delay)
  }

  /** Enqueue a composite-video render. Returns false (with a flag-off signal) on 404. */
  async function renderVideoAction(formats?: string[]): Promise<{ ok: boolean; flagOff?: boolean }> {
    if (rendering.value) return { ok: false }
    rendering.value = true
    try {
      if (!await doSave()) return { ok: false }
      await $fetch(`/api/agency/audio/projects/${projectId}/render-video`, { method: 'POST', body: formats?.length ? { formats } : {} })
      await refreshRenderJobs()
      scheduleJobPoll()
      return { ok: true }
    } catch (e: unknown) {
      if (apiErrorStatus(e) === 404) return { ok: false, flagOff: true }
      return { ok: false }
    } finally {
      rendering.value = false
    }
  }

  /** Draft a social post from a rendered variant. Returns { postId, clientId } or throws (page toasts). */
  async function publishToSocial(jobId: string, format: string): Promise<{ postId: string; clientId: string }> {
    return await $fetch(`/api/agency/audio/projects/${projectId}/renders/${jobId}/publish-social`, {
      method: 'POST', body: { format }
    })
  }

  /** Draft a social post from a saved/generated video asset. */
  async function publishVideoAssetToSocial(assetId: string): Promise<{ postId: string; clientId: string }> {
    return await $fetch(`/api/agency/video/assets/${assetId}/publish-social`, { method: 'POST' })
  }

  /** Send a rendered variant to the client portal for review. Returns the created review or throws. */
  async function sendToPortal(jobId: string, format: string): Promise<{ review: unknown }> {
    return await $fetch(`/api/agency/audio/projects/${projectId}/renders/${jobId}/send-to-portal`, {
      method: 'POST', body: { format }
    })
  }

  /** Save a rendered variant to the reusable video library. */
  async function saveAsset(jobId: string, format: string, title?: string | null): Promise<{ asset: VideoAsset }> {
    return await $fetch(`/api/agency/audio/projects/${projectId}/renders/${jobId}/save-asset`, {
      method: 'POST', body: { format, title: title ?? null }
    })
  }

  /** List saved video assets (for the library). */
  async function listVideoAssets(): Promise<{ assets: VideoAsset[] }> {
    return await $fetch('/api/agency/video/assets')
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
    await saveNow()
    return $fetch(`/api/agency/audio/projects/${projectId}/versions`, {
      method: 'POST',
      body: { label }
    })
  }

  /** List all saved versions for this project. The endpoint returns mapped
   * MediaTimeline rows (camelCase createdAt, plus version), newest-first. */
  async function listVersions() {
    return $fetch<{ versions: Array<{ id: string; version: number; label: string | null; createdAt: string; state: TimelineState }> }>(
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
      for (const [k, v] of Object.entries(src.sources)) mergeSource(k, v)
      const plan = planTimeline(state)
      clips.value = plan.clips
      tracks.value = plan.tracks
      const ctx = createBrowserAudioContext(state.sample_rate)
      engine = createAudioEngine({
        ctx: ctx as AudioEngineDeps['ctx'],
        resolveBuffer: makeR2Resolver(sourcesMap, ctx),
        setTimer: browserSetTimer,
        now: () => performance.now() / 1000
      })
      // Bind the serialized reload orchestrator to this engine + reactive sink.
      runReload = makeEngineReloader(
        engine,
        {
          getPlayhead: () => currentTime.value,
          onPaused: () => { isPlaying.value = false; cancelAnimationFrame(raf) },
          commitPlan: (s) => { const p = planTimeline(s); clips.value = p.clips; tracks.value = p.tracks },
          commitMissing: (ids) => { missingClipIds.value = ids },
          commitTransport: (dur, ct) => { duration.value = dur; currentTime.value = ct }
        },
        () => { /* planning committed on win in commitPlan */ }
      )
      const result = await engine.load(state)
      missingClipIds.value = result.missingClipIds
      duration.value = engine.duration()
      status.value = 'ready'
    } catch (e: unknown) {
      status.value = 'error'
      error.value = apiErrorDescription(e, 'Failed to load the project audio.')
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
  onBeforeUnmount(() => { cancelAnimationFrame(raf); if (pollTimer) clearTimeout(pollTimer); engine?.dispose(); engine = null })

  return {
    // State
    timeline, clips, tracks, status, error,
    isPlaying, currentTime, duration,
    canUndo, canRedo, saveStatus, saveNow,
    /** Clip ids whose source couldn't be loaded (deleted/404). Non-fatal warning. */
    missingClipIds,
    mediaType,
    /** Reactive snapshot of { r2_key → presigned URL } — pass as :sources to MediaTimeline */
    sources: sourcesRef,
    // Transport
    play, pause, seek,
    // Edit actions
    moveClipAction, trimClipAction, sliceAction, setClipEffectsAction, setClipFitAction,
    addClipAction, addTrackAction, addClipToKindTrackAction, deleteClipAction,
    undoAction, redoAction,
    // AV actions
    uploadMedia, addVideoClipAction, addOverlayClipAction,
    addCaptionClipAction,
    renderVideoAction, refreshRenderJobs, renderJobs, rendering, publishToSocial, publishVideoAssetToSocial, sendToPortal,
    saveAsset, listVideoAssets,
    /** Merge a new presigned URL into the live sources map (called before addClipAction). */
    mergeSource,
    // Version management
    saveVersion, listVersions, restoreVersion
  }
}
