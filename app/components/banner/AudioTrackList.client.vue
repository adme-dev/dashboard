<script lang="ts">
import { safeMediaUrl } from '~/utils/safe-url'

let stopActivePreview: (() => void) | undefined
</script>

<script setup lang="ts">
type Track = {
  id: string
  name: string
  url?: string
  kind: 'Music' | 'Voiceover' | 'Upload'
  detail?: string
  durationSec?: number | null
  add: () => void | Promise<void>
  remove?: () => void | Promise<void>
}

const props = defineProps<{
  tracks: Track[]
  busyId?: string | null
  selectionOnly?: boolean
  suspended?: boolean
  playingDesign?: boolean
}>()
const emit = defineEmits<{ preview: [] }>()
const player = ref<HTMLAudioElement | null>(null)
const activeId = ref<string | null>(null)
const loading = ref(false)
const failureId = ref<string | null>(null)
let playRequest = 0

function stopPreview() {
  if (stopActivePreview === stopPreview) stopActivePreview = undefined
  playRequest++
  if (activeId.value) {
    player.value?.pause()
    player.value?.removeAttribute('src')
    player.value?.load()
  }
  activeId.value = null
  loading.value = false
}

function failPreview() {
  if (!activeId.value) return
  failureId.value = activeId.value
  stopPreview()
}

async function togglePreview(track: Track) {
  if (activeId.value === track.id) {
    stopPreview()
    return
  }
  const src = safeMediaUrl(track.url)
  const audio = player.value
  if (!src || !audio || props.suspended) return
  stopActivePreview?.()
  stopActivePreview = stopPreview
  failureId.value = null
  emit('preview')
  const request = ++playRequest
  activeId.value = track.id
  loading.value = true
  audio.src = src
  try {
    await audio.play()
    if (request === playRequest) loading.value = false
  } catch {
    if (request === playRequest) failPreview()
  }
}

function chooseTrack(track: Track) {
  stopPreview()
  void track.add()
}

function removeTrack(track: Track) {
  if (activeId.value === track.id) stopPreview()
  void track.remove?.()
}

watch(() => props.tracks, (tracks) => {
  if (activeId.value && !tracks.some(track => track.id === activeId.value)) stopPreview()
  if (failureId.value && !tracks.some(track => track.id === failureId.value)) failureId.value = null
})
watch(() => props.suspended, (suspended) => {
  if (suspended) stopPreview()
})
watch(() => props.playingDesign, (playing) => {
  if (playing) stopPreview()
})
onBeforeUnmount(stopPreview)

function displayDuration(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return ''
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`
  const rounded = Math.round(seconds)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}
</script>

<template>
  <audio
    ref="player"
    preload="none"
    @ended="stopPreview"
    @error="failPreview"
  />
  <ul aria-label="Audio tracks" class="space-y-1.5">
    <li
      v-for="track in tracks"
      :key="track.id"
      class="rounded-md border border-default bg-default px-2 py-1.5"
      :class="{ 'border-primary/50': activeId === track.id }"
    >
      <div class="flex min-w-0 items-center gap-2">
        <UButton
          :icon="activeId === track.id ? loading ? 'i-lucide-loader-circle' : 'i-lucide-square' : 'i-lucide-play'"
          :aria-label="`${activeId === track.id ? 'Stop preview' : 'Play preview'} for ${track.name}`"
          :title="activeId === track.id ? 'Stop preview' : 'Play preview'"
          :disabled="!track.url || suspended"
          :variant="activeId === track.id ? 'soft' : 'ghost'"
          :color="activeId === track.id ? 'primary' : 'neutral'"
          :ui="{ leadingIcon: activeId === track.id && loading ? 'animate-spin' : undefined }"
          class="shrink-0"
          size="sm"
          @click="togglePreview(track)"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium text-highlighted" :title="track.name">
            {{ track.name }}
          </p>
          <p class="truncate text-[11px] text-muted">
            {{ [track.kind, track.detail, displayDuration(track.durationSec)].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <UButton
          v-if="track.remove"
          icon="i-lucide-trash-2"
          :aria-label="`Delete ${track.name}`"
          title="Delete upload"
          variant="ghost"
          color="neutral"
          size="xs"
          class="shrink-0"
          @click="removeTrack(track)"
        />
        <UButton
          :label="selectionOnly ? 'Choose' : 'Add'"
          :aria-label="`${selectionOnly ? 'Choose' : 'Add'} ${track.name}`"
          :loading="busyId === track.id"
          :disabled="!track.url || !!busyId"
          variant="soft"
          size="xs"
          class="shrink-0"
          @click="chooseTrack(track)"
        />
      </div>
      <p v-if="failureId === track.id" role="alert" class="px-2 py-1 text-xs text-error">
        Preview couldn’t play. Try again.
      </p>
    </li>
  </ul>
</template>
