<script setup lang="ts">
const props = defineProps<{
  open: boolean
  audioInputs: MediaDeviceInfo[]
  videoInputs: MediaDeviceInfo[]
  selectedAudioId: string | null
  selectedVideoId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  selectMic: [deviceId: string]
  selectCam: [deviceId: string]
}>()

const localOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const audioItems = computed(() =>
  props.audioInputs.map(d => ({
    label: d.label || 'Unnamed mic',
    value: d.deviceId,
  }))
)

const videoItems = computed(() =>
  props.videoInputs.map(d => ({
    label: d.label || 'Unnamed camera',
    value: d.deviceId,
  }))
)
</script>

<template>
  <UModal v-model:open="localOpen" :ui="{ content: 'sm:max-w-sm' }">
    <template #content>
      <div class="flex flex-col gap-0 overflow-hidden rounded-xl">
        <!-- Header -->
        <div class="px-5 pt-5 pb-4 border-b border-default">
          <div class="flex items-center gap-2.5">
            <div class="flex size-8 items-center justify-center rounded-lg bg-elevated ring-1 ring-default">
              <UIcon name="i-lucide-settings-2" class="size-4 text-muted" />
            </div>
            <div>
              <h2 class="text-sm font-semibold text-highlighted leading-none">
                Devices
              </h2>
              <p class="text-xs text-muted mt-0.5">
                Pick the microphone and camera you want to use.
              </p>
            </div>
          </div>
        </div>

        <!-- Fields -->
        <div class="px-5 py-4 space-y-4 bg-default">
          <!-- Microphone -->
          <UFormField label="Microphone">
            <template #label>
              <span class="flex items-center gap-1.5 text-xs font-medium text-muted uppercase tracking-wide">
                <UIcon name="i-lucide-mic" class="size-3.5" />
                Microphone
              </span>
            </template>
            <USelectMenu
              :model-value="selectedAudioId ?? undefined"
              :items="audioItems"
              value-key="value"
              placeholder="Choose a microphone"
              class="w-full"
              :ui="{ base: 'text-sm' }"
              @update:model-value="(v: string) => emit('selectMic', v)"
            />
          </UFormField>

          <!-- Camera -->
          <UFormField label="Camera">
            <template #label>
              <span class="flex items-center gap-1.5 text-xs font-medium text-muted uppercase tracking-wide">
                <UIcon name="i-lucide-video" class="size-3.5" />
                Camera
              </span>
            </template>
            <USelectMenu
              :model-value="selectedVideoId ?? undefined"
              :items="videoItems"
              value-key="value"
              placeholder="Choose a camera"
              class="w-full"
              :ui="{ base: 'text-sm' }"
              @update:model-value="(v: string) => emit('selectCam', v)"
            />
          </UFormField>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-default bg-elevated/50">
          <UButton
            color="primary"
            size="sm"
            @click="localOpen = false"
          >
            Done
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
