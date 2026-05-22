<script setup lang="ts">
import type { MediaCredentials, OfficeZoneRow } from '~~/app/types/office'

const props = defineProps<{
  open: boolean
  zone: OfficeZoneRow | null
  credentials: MediaCredentials | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  leave: []
}>()

// ─── Composables ──────────────────────────────────────────────────────────────

const {
  permissionDenied,
  audioInputs,
  videoInputs,
  selectedAudioId,
  selectedVideoId,
  selectMic,
  selectCam,
  stop: stopMedia,
} = useMediaDevices({ initialAudio: true, initialVideo: true })

const credsRef = computed(() => props.credentials)

const {
  state,
  lastError,
  localVideoTrack,
  localMicEnabled,
  localCamEnabled,
  localScreenEnabled,
  participants,
  toggleMic,
  toggleCam,
  toggleScreen,
  disconnect,
} = useOfficeRealtime({ credentials: credsRef })

// ─── Local state ──────────────────────────────────────────────────────────────

const deviceModalOpen = ref(false)

// ─── v-model:open passthrough ────────────────────────────────────────────────

const localOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

// ─── Connection badge ─────────────────────────────────────────────────────────

const connectionLabel = computed(() => {
  switch (state.value) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting…'
    case 'failed': return 'Connection failed'
    case 'closed': return 'Disconnected'
    default: return 'Idle'
  }
})

const connectionColor = computed<'success' | 'warning' | 'error' | 'neutral'>(() => {
  switch (state.value) {
    case 'connected': return 'success'
    case 'connecting': return 'warning'
    case 'failed': return 'error'
    default: return 'neutral'
  }
})

// ─── Actions ──────────────────────────────────────────────────────────────────

function handleLeave() {
  emit('leave')
  emit('update:open', false)
  void disconnect()
  stopMedia()
}
</script>

<template>
  <USlideover
    v-model:open="localOpen"
    side="bottom"
    :ui="{ content: 'h-[88vh] rounded-t-3xl' }"
  >
    <template #content>
      <div class="flex h-full flex-col bg-default text-default">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-default shrink-0">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-radio"
              class="size-4 text-emerald-500"
              :class="state === 'connected' ? 'animate-pulse' : ''"
            />
            <span class="font-semibold text-highlighted">
              {{ zone?.name ?? 'Zone' }}
            </span>
            <UBadge :color="connectionColor" variant="subtle" size="xs">
              {{ connectionLabel }}
            </UBadge>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            aria-label="Close"
            @click="handleLeave"
          />
        </div>

        <!-- Tile grid -->
        <div
          class="flex-1 overflow-auto p-4 grid auto-rows-fr gap-3"
          :style="{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }"
        >
          <!-- Local tile -->
          <OfficeMediaTile
            :video-track="localVideoTrack"
            name="You"
            is-local
            :mic-muted="!localMicEnabled"
          />

          <!-- Remote tiles -->
          <OfficeMediaTile
            v-for="p in participants"
            :key="p.peerId"
            :video-track="p.videoTrack"
            :name="p.name"
            :mic-muted="p.micMuted"
          />
        </div>

        <!-- Permission-denied lurking strip -->
        <div
          v-if="permissionDenied"
          class="px-5 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border-t border-amber-500/20 shrink-0"
        >
          Mic/camera permission denied — you're lurking. Click the mic or camera button to retry.
        </div>

        <!-- Error strip (only when no permission denial AND there's an error) -->
        <div
          v-else-if="lastError"
          class="px-5 py-2 text-xs text-red-700 dark:text-red-300 bg-red-500/10 border-t border-red-500/20 shrink-0"
        >
          {{ lastError }}
        </div>

        <!-- Controls bar -->
        <div class="px-4 py-4 border-t border-default flex justify-center bg-elevated/40 shrink-0">
          <OfficeMediaControls
            :mic-enabled="localMicEnabled"
            :cam-enabled="localCamEnabled"
            :sharing-screen="localScreenEnabled"
            @toggle-mic="toggleMic"
            @toggle-cam="toggleCam"
            @toggle-screen="toggleScreen"
            @open-devices="deviceModalOpen = true"
            @leave="handleLeave"
          />
        </div>
      </div>

      <!-- Device settings modal — outside the flex column so it can portal freely -->
      <OfficeDeviceSettings
        v-model:open="deviceModalOpen"
        :audio-inputs="audioInputs"
        :video-inputs="videoInputs"
        :selected-audio-id="selectedAudioId"
        :selected-video-id="selectedVideoId"
        @select-mic="selectMic"
        @select-cam="selectCam"
      />
    </template>
  </USlideover>
</template>
