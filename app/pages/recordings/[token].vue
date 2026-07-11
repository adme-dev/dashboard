<script setup lang="ts">
import type { OfficeRecordingRow } from '~~/app/types/office'

type PublicRecording = Pick<
  OfficeRecordingRow,
  | 'id'
  | 'title'
  | 'description'
  | 'status'
  | 'access'
  | 'duration_seconds'
  | 'transcript'
  | 'summary'
  | 'chapters'
  | 'view_count'
  | 'created_at'
  | 'updated_at'
> & {
  meeting_title: string | null
  office_name: string | null
  action_items: string
  media_url: string | null
  thumbnail_url: string | null
}

const route = useRoute()
const token = computed(() => String(route.params.token || ''))
const viewRecorded = ref(false)
const viewerEmail = ref('')
const progressPercent = ref(0)
const selectedChapterIndex = ref<number | null>(null)
const transcriptQuery = ref('')
const recordingViewPending = ref(false)
const recordingViewSaved = ref(false)
const viewerIdentityReady = ref(false)
const videoElement = ref<HTMLVideoElement | null>(null)
const lastVideoProgressSentAt = ref(0)
const recordingPassword = ref('')
const passwordInput = ref('')
const passwordError = ref('')
const unlockingRecording = ref(false)
const viewerEmailStorageKey = 'office-recording-viewer-email'
const viewerIdStorageKey = 'office-recording-viewer-id'
const viewerId = ref('')
const progressStorageKey = computed(() => `office-recording-progress:${token.value}`)
const recordingUrl = computed(() => `/api/public/office-recordings/${token.value}`)
const recordingFetchHeaders = computed(() =>
  recordingPassword.value ? { 'x-recording-password': recordingPassword.value } : {}
)

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, headers?: Record<string, string> }
) => Promise<T>

const data = ref<{ recording: PublicRecording | null }>({ recording: null })
const pending = ref(true)
const error = ref<unknown>(null)

async function refresh() {
  pending.value = true
  error.value = null

  try {
    data.value = await apiFetch<{ recording: PublicRecording }>(recordingUrl.value, {
      headers: recordingFetchHeaders.value
    })
  } catch (fetchError) {
    data.value = { recording: null }
    error.value = fetchError
  } finally {
    pending.value = false
  }
}

const recording = computed(() => data.value?.recording ?? null)
const errorStatus = computed(() => {
  const fetchError = error.value as { statusCode?: number, data?: { statusCode?: number } } | null
  return fetchError?.statusCode ?? fetchError?.data?.statusCode ?? null
})
const passwordRequired = computed(() => errorStatus.value === 401)

const durationLabel = computed(() => {
  const seconds = recording.value?.duration_seconds
  if (!seconds) return 'Duration pending'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
})

const chapters = computed(() => Array.isArray(recording.value?.chapters) ? recording.value.chapters : [])
const selectedChapter = computed(() =>
  selectedChapterIndex.value === null ? null : chapters.value[selectedChapterIndex.value] ?? null
)
const filteredTranscript = computed(() => {
  const transcript = recording.value?.transcript ?? ''
  const query = transcriptQuery.value.trim().toLowerCase()
  if (!query) return transcript
  return transcript
    .split(/\n{2,}/)
    .filter(block => block.toLowerCase().includes(query))
    .join('\n\n')
})
const transcriptMatchCount = computed(() => {
  const transcript = recording.value?.transcript ?? ''
  const query = transcriptQuery.value.trim().toLowerCase()
  if (!query) return 0
  return transcript
    .split(/\n{2,}/)
    .filter(block => block.toLowerCase().includes(query))
    .length
})
const progressWatchedSeconds = computed(() => {
  const duration = recording.value?.duration_seconds ?? 0
  return duration ? Math.round((duration * progressPercent.value) / 100) : 0
})
const hasPlaybackMedia = computed(() => Boolean(recording.value?.media_url))
const accessLabel = computed(() => {
  if (recording.value?.access === 'password') return 'Password protected'
  if (recording.value?.access === 'public') return 'Public link'
  return recording.value?.access ?? 'Shared'
})
const actionItems = computed(() =>
  (recording.value?.action_items ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line !== 'No action items identified.')
    .map(line => line.replace(/^[-*]\s+/, '').replace(/^\[[ xX]\]\s+/, ''))
)
const viewerEmailValid = computed(() =>
  !viewerEmail.value.trim()
  || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(viewerEmail.value.trim())
)
const canSaveViewerProgress = computed(() =>
  Boolean(recording.value)
  && viewerEmailValid.value
  && !recordingViewPending.value
)
const progressOptions = [25, 50, 75, 100]

type ViewProgressOptions = {
  force?: boolean
  keepalive?: boolean
  silent?: boolean
}

function dateTimeLabel(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function chapterTimeLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

async function recordView() {
  if (!recording.value || viewRecorded.value) return
  viewRecorded.value = true
  const ok = await sendViewProgress(progressPercent.value, true)
  if (!ok) {
    viewRecorded.value = false
  }
}

function viewProgressPayload(percent: number, countView: boolean) {
  return {
    viewerEmail: viewerEmail.value.trim() || undefined,
    viewerId: viewerId.value || undefined,
    password: recordingPassword.value || undefined,
    percentWatched: percent,
    watchedSeconds: recording.value?.duration_seconds
      ? Math.round((recording.value.duration_seconds * percent) / 100)
      : 0,
    countView
  }
}

async function sendViewProgress(percent = progressPercent.value, countView = false, options: ViewProgressOptions = {}) {
  if (!recording.value || (!options.force && recordingViewPending.value) || !viewerEmailValid.value) return false
  if (!options.silent) {
    recordingViewPending.value = true
    recordingViewSaved.value = false
  }
  try {
    const body = viewProgressPayload(percent, countView)
    if (options.keepalive && typeof window !== 'undefined') {
      const response = await fetch(`/api/public/office-recordings/${token.value}/view`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      })
      if (!response.ok) return false
    } else {
      await apiFetch(`/api/public/office-recordings/${token.value}/view`, {
        method: 'POST',
        body
      })
    }
    if (!options.silent) recordingViewSaved.value = true
    return true
  } catch {
    return false
  } finally {
    if (!options.silent) recordingViewPending.value = false
  }
}

async function unlockRecording() {
  if (unlockingRecording.value) return
  const nextPassword = passwordInput.value.trim()
  if (nextPassword.length < 8) {
    passwordError.value = 'Enter the recording password.'
    return
  }
  unlockingRecording.value = true
  try {
    passwordError.value = ''
    recordingPassword.value = nextPassword
    viewRecorded.value = false
    await refresh()
    if (error.value) {
      passwordError.value = 'Password did not unlock this recording.'
      recordingPassword.value = ''
      return
    }
    void recordView()
  } finally {
    unlockingRecording.value = false
  }
}

function selectChapter(index: number) {
  selectedChapterIndex.value = index
  const chapter = chapters.value[index]
  if (!chapter || !recording.value?.duration_seconds) return
  const percent = Math.min(100, Math.max(progressPercent.value, Math.round((chapter.start_seconds / recording.value.duration_seconds) * 100)))
  progressPercent.value = percent
  void sendViewProgress(percent)
}

function markProgress(percent: number) {
  progressPercent.value = percent
  void sendViewProgress(percent)
}

function syncVideoProgress(force = false, send = true) {
  const video = videoElement.value
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
  const percent = Math.min(100, Math.max(0, Math.round((video.currentTime / video.duration) * 100)))
  progressPercent.value = percent
  const now = Date.now()
  if (send && (force || now - lastVideoProgressSentAt.value > 10_000 || percent === 100)) {
    lastVideoProgressSentAt.value = now
    void sendViewProgress(percent)
  }
}

function flushViewProgress() {
  syncVideoProgress(true, false)
  void sendViewProgress(progressPercent.value, false, { force: true, keepalive: true, silent: true })
}

function flushViewProgressWhenHidden() {
  if (document.visibilityState === 'hidden') flushViewProgress()
}

function loadStoredProgress() {
  if (typeof window === 'undefined') return
  const stored = Number(window.localStorage.getItem(progressStorageKey.value) ?? '')
  progressPercent.value = Number.isFinite(stored) ? Math.min(100, Math.max(0, Math.round(stored))) : 0
}

watch(progressPercent, (percent) => {
  if (typeof window === 'undefined' || !token.value) return
  window.localStorage.setItem(progressStorageKey.value, String(Math.min(100, Math.max(0, Math.round(percent)))))
})

function loadStoredViewerEmail() {
  if (typeof window === 'undefined') return
  viewerEmail.value = window.localStorage.getItem(viewerEmailStorageKey) ?? ''
}

function loadStoredViewerId() {
  if (typeof window === 'undefined') return
  const existing = window.localStorage.getItem(viewerIdStorageKey)
  if (existing) {
    viewerId.value = existing
    return
  }
  const next = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(viewerIdStorageKey, next)
  viewerId.value = next
}

watch(viewerEmail, (email) => {
  if (typeof window === 'undefined') return
  recordingViewSaved.value = false
  const value = email.trim()
  if (value && viewerEmailValid.value) {
    window.localStorage.setItem(viewerEmailStorageKey, value)
  } else {
    window.localStorage.removeItem(viewerEmailStorageKey)
  }
})

watch(passwordInput, () => {
  if (passwordError.value) passwordError.value = ''
})

watch(recording, () => {
  if (!viewerIdentityReady.value) return
  void recordView()
}, { immediate: true })

watch(token, () => {
  viewRecorded.value = false
  recordingPassword.value = ''
  passwordInput.value = ''
  passwordError.value = ''
  selectedChapterIndex.value = null
  transcriptQuery.value = ''
  recordingViewSaved.value = false
  lastVideoProgressSentAt.value = 0
  loadStoredProgress()
  refresh()
  if (viewerIdentityReady.value) void recordView()
})

onMounted(() => {
  loadStoredViewerEmail()
  loadStoredViewerId()
  loadStoredProgress()
  viewerIdentityReady.value = true
  document.addEventListener('visibilitychange', flushViewProgressWhenHidden)
  window.addEventListener('beforeunload', flushViewProgress)
  void recordView()
})

onBeforeUnmount(() => {
  flushViewProgress()
  document.removeEventListener('visibilitychange', flushViewProgressWhenHidden)
  window.removeEventListener('beforeunload', flushViewProgress)
})

useHead(() => ({
  title: recording.value ? `${recording.value.title} · Recording` : 'Recording'
}))

await refresh()
</script>

<template>
  <main class="min-h-screen bg-[#07090d] text-white">
    <div class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header class="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div class="flex min-w-0 items-center gap-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-300/20">
            <UIcon name="i-lucide-screen-share" class="size-4 text-emerald-200" />
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">
              {{ recording?.office_name || 'Office recording' }}
            </p>
            <p class="truncate text-xs text-white/40">
              Shared recording
            </p>
          </div>
        </div>
        <UBadge
          v-if="recording"
          color="success"
          variant="subtle"
          size="sm"
        >
          Public link active
        </UBadge>
      </header>

      <section
        v-if="pending"
        class="grid flex-1 place-items-center py-16 text-sm text-white/45"
      >
        <div class="flex flex-col items-center gap-3">
          <XfLoader />
          <span>Loading recording...</span>
        </div>
      </section>

      <section
        v-else-if="passwordRequired"
        class="grid flex-1 place-items-center py-16"
      >
        <form
          class="w-full max-w-md rounded-xl border border-white/[0.08] bg-white/[0.035] p-5"
          @submit.prevent="unlockRecording"
        >
          <span class="mx-auto flex size-11 items-center justify-center rounded-xl bg-amber-300/10 ring-1 ring-amber-200/15">
            <UIcon name="i-lucide-key-round" class="size-5 text-amber-100" />
          </span>
          <h1 class="mt-4 text-center text-base font-semibold">
            Password required
          </h1>
          <p class="mt-1 text-center text-sm leading-5 text-white/45">
            This recording is protected. Enter the password provided by the host.
          </p>
          <input
            v-model="passwordInput"
            type="password"
            autocomplete="current-password"
            placeholder="Recording password"
            class="mt-4 h-10 w-full rounded-md border border-white/[0.08] bg-black/15 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
          <p
            v-if="passwordError"
            class="mt-2 rounded-md bg-red-400/10 px-2 py-1.5 text-xs text-red-100 ring-1 ring-red-300/15"
          >
            {{ passwordError }}
          </p>
          <button
            type="submit"
            class="mt-3 h-10 w-full rounded-md bg-emerald-400/15 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-300/20 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60"
            :disabled="unlockingRecording || pending"
          >
            {{ unlockingRecording ? 'Unlocking...' : 'Unlock recording' }}
          </button>
        </form>
      </section>

      <section
        v-else-if="error || !recording"
        class="grid flex-1 place-items-center py-16"
      >
        <div class="max-w-md rounded-xl border border-white/[0.08] bg-white/[0.035] p-5 text-center">
          <UIcon name="i-lucide-lock" class="mx-auto size-6 text-white/45" />
          <h1 class="mt-3 text-base font-semibold">
            Recording unavailable
          </h1>
          <p class="mt-1 text-sm text-white/45">
            This link is no longer active or the recording is not ready to share.
          </p>
        </div>
      </section>

      <section
        v-else
        class="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div class="min-w-0 space-y-4">
          <div class="overflow-hidden rounded-xl border border-white/[0.08] bg-[#10141b] shadow-2xl">
            <div class="grid aspect-video place-items-center bg-[radial-gradient(circle_at_35%_25%,rgba(16,185,129,0.18),transparent_35%),linear-gradient(135deg,#111827,#05070a)]">
              <video
                v-if="hasPlaybackMedia"
                ref="videoElement"
                class="h-full w-full bg-black object-contain"
                :src="recording.media_url || undefined"
                :poster="recording.thumbnail_url || undefined"
                controls
                preload="metadata"
                playsinline
                @play="recordView"
                @timeupdate="syncVideoProgress()"
                @pause="syncVideoProgress(true)"
                @ended="syncVideoProgress(true)"
              />
              <div
                v-else
                class="max-w-md px-6 text-center"
              >
                <span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.08]">
                  <UIcon name="i-lucide-file-video" class="size-6 text-white/70" />
                </span>
                <p class="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-white/35">
                  Playback unavailable
                </p>
                <p class="mt-2 text-sm leading-6 text-white/50">
                  The recording media is not attached to this share link yet. Any saved summary, action items, and transcript are still available below.
                </p>
              </div>
            </div>
            <div class="border-t border-white/[0.06] bg-black/15 p-3">
              <div class="mb-2 flex items-center justify-between gap-3 text-xs text-white/45">
                <span>{{ selectedChapter ? selectedChapter.title : 'Walkthrough progress' }}</span>
                <span>{{ progressPercent }}%{{ progressPercent ? ' watched' : '' }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  class="h-full rounded-full bg-emerald-300/80 transition-[width] duration-300"
                  :style="{ width: `${progressPercent}%` }"
                />
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-if="progressPercent"
                  class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/50 ring-1 ring-white/[0.06]"
                >
                  <UIcon name="i-lucide-history" class="size-3.5" />
                  Resume saved
                </span>
                <button
                  v-for="percent in progressOptions"
                  :key="percent"
                  type="button"
                  class="rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition"
                  :class="progressPercent >= percent
                    ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
                    : 'bg-white/[0.04] text-white/55 ring-white/[0.06] hover:bg-white/[0.07] hover:text-white/75'"
                  :disabled="recordingViewPending"
                  @click="markProgress(percent)"
                >
                  {{ percent === 100 ? 'Complete' : `${percent}%` }}
                </button>
              </div>
            </div>
          </div>

          <div>
            <p class="text-xs font-medium text-emerald-200">
              {{ recording.meeting_title || 'Standalone walkthrough' }}
            </p>
            <h1 class="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">
              {{ recording.title }}
            </h1>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/38">
              <span class="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-1.5 py-0.5 font-medium text-emerald-100/75 ring-1 ring-emerald-300/15">
                <UIcon name="i-lucide-shield-check" class="size-3" />
                Ready to view
              </span>
              <span class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 font-medium text-white/50 ring-1 ring-white/[0.05]">
                <UIcon name="i-lucide-building-2" class="size-3" />
                {{ recording.office_name || 'Office' }}
              </span>
              <span
                v-if="dateTimeLabel(recording.updated_at)"
                class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 font-medium text-white/50 ring-1 ring-white/[0.05]"
              >
                <UIcon name="i-lucide-clock-3" class="size-3" />
                Updated {{ dateTimeLabel(recording.updated_at) }}
              </span>
            </div>
            <p
              v-if="recording.description"
              class="mt-2 max-w-3xl text-sm leading-6 text-white/55"
            >
              {{ recording.description }}
            </p>
          </div>

          <section
            v-if="recording.summary"
            class="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4"
          >
            <h2 class="text-sm font-semibold">
              Summary
            </h2>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/60">
              {{ recording.summary }}
            </p>
          </section>

          <section
            v-if="actionItems.length"
            class="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4"
          >
            <div class="flex items-center gap-2">
              <span class="flex size-7 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-300/15">
                <UIcon name="i-lucide-list-checks" class="size-3.5 text-emerald-100" />
              </span>
              <h2 class="text-sm font-semibold">
                Action items
              </h2>
            </div>
            <ul class="mt-3 grid gap-2 sm:grid-cols-2">
              <li
                v-for="item in actionItems"
                :key="item"
                class="flex min-w-0 items-start gap-2 rounded-lg bg-black/15 px-3 py-2 text-sm leading-5 text-white/62 ring-1 ring-white/[0.06]"
              >
                <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0 text-emerald-200/70" />
                <span class="min-w-0">{{ item }}</span>
              </li>
            </ul>
          </section>

          <section
            v-if="recording.transcript"
            class="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-sm font-semibold">
                Transcript
              </h2>
              <div class="relative w-full sm:w-64">
                <UIcon name="i-lucide-search" class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/35" />
                <input
                  v-model="transcriptQuery"
                  type="search"
                  placeholder="Search transcript"
                  class="h-8 w-full rounded-md border border-white/[0.08] bg-black/15 pl-8 pr-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
                >
              </div>
            </div>
            <p
              v-if="transcriptQuery.trim()"
              class="mt-2 text-[11px] text-white/35"
            >
              {{ transcriptMatchCount }} transcript block{{ transcriptMatchCount === 1 ? '' : 's' }} matched.
            </p>
            <p class="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap text-sm leading-6 text-white/55">
              {{ filteredTranscript || 'No transcript matches.' }}
            </p>
          </section>
        </div>

        <aside class="space-y-3">
          <div class="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
            <h2 class="text-sm font-semibold">
              Details
            </h2>
            <dl class="mt-3 space-y-2 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-white/40">
                  Duration
                </dt>
                <dd class="font-medium">
                  {{ durationLabel }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-white/40">
                  Watched
                </dt>
                <dd class="font-medium">
                  {{ chapterTimeLabel(progressWatchedSeconds) }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-white/40">
                  Views
                </dt>
                <dd class="font-medium">
                  {{ recording.view_count }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-white/40">
                  Access
                </dt>
                <dd class="font-medium">
                  {{ accessLabel }}
                </dd>
              </div>
              <div
                v-if="dateTimeLabel(recording.created_at)"
                class="flex items-center justify-between gap-3"
              >
                <dt class="text-white/40">
                  Shared
                </dt>
                <dd class="text-right font-medium">
                  {{ dateTimeLabel(recording.created_at) }}
                </dd>
              </div>
            </dl>
          </div>

          <div class="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
            <h2 class="text-sm font-semibold">
              Viewer
            </h2>
            <p class="mt-1 text-xs leading-5 text-white/40">
              Optional, remembered on this device so the team can identify watched follow-ups.
            </p>
            <input
              v-model="viewerEmail"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              :aria-invalid="viewerEmail.trim() && !viewerEmailValid ? 'true' : undefined"
              class="mt-3 h-9 w-full rounded-md border border-white/[0.08] bg-black/15 px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
            >
            <p
              v-if="viewerEmail.trim() && !viewerEmailValid"
              class="mt-1.5 text-[11px] leading-4 text-amber-100/75"
            >
              Enter a valid email or leave this blank.
            </p>
            <button
              type="button"
              class="mt-2 h-8 w-full rounded-md bg-white/[0.04] text-xs font-semibold text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
              :disabled="!canSaveViewerProgress"
              @click="sendViewProgress()"
            >
              {{ recordingViewPending ? 'Saving progress' : recordingViewSaved ? 'Progress saved' : 'Save viewer progress' }}
            </button>
          </div>

          <div
            v-if="chapters.length"
            class="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4"
          >
            <h2 class="text-sm font-semibold">
              Chapters
            </h2>
            <div class="mt-3 space-y-2">
              <button
                v-for="(chapter, index) in chapters"
                :key="`${chapter.start_seconds}-${chapter.title}`"
                class="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ring-1 transition"
                :class="selectedChapterIndex === index
                  ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
                  : 'bg-white/[0.04] text-white/70 ring-transparent hover:bg-white/[0.07]'"
                @click="selectChapter(index)"
              >
                <span class="min-w-0 truncate text-white/70">{{ chapter.title }}</span>
                <span class="shrink-0 tabular-nums text-white/35">{{ chapterTimeLabel(chapter.start_seconds) }}</span>
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  </main>
</template>
