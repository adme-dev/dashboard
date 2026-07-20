<script setup lang="ts">
import { computed } from 'vue'

type MicrophonePermissionState = PermissionState | 'unknown' | 'unsupported'

const props = defineProps<{
  permission: MicrophonePermissionState
  handsFreeAvailable: boolean
}>()

defineEmits<{ dismiss: [] }>()

const permissionMessage = computed(() => {
  switch (props.permission) {
    case 'granted':
      return 'Microphone access is on.'
    case 'denied':
      return 'Microphone access is blocked. Enable it in your browser settings to use Voice AI.'
    case 'prompt':
      return 'Your browser will ask for microphone access the first time you start.'
    case 'unsupported':
      return 'Microphone permission is unavailable in this browser.'
    default:
      return 'Microphone access is checked when you start.'
  }
})
</script>

<template>
  <section
    class="mb-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 sm:px-4"
    aria-label="Voice AI guidance"
  >
    <div class="flex items-start gap-3">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <UIcon name="i-lucide-audio-lines" class="size-4" />
      </span>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold text-highlighted">
            Voice AI is ready
          </h2>
          <span class="inline-flex items-center gap-1 text-[11px] font-medium text-success">
            <span class="size-1.5 rounded-full bg-success" aria-hidden="true" />
            Live
          </span>
        </div>

        <p class="mt-1 text-xs leading-relaxed text-muted">
          Choose <strong class="font-medium text-default">Voice message</strong> for one question.
          <template v-if="handsFreeAvailable">
            Choose <strong class="font-medium text-default">Start Voice</strong> for an ongoing hands-free conversation.
          </template>
        </p>

        <p
          class="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed"
          :class="permission === 'denied' || permission === 'unsupported' ? 'text-warning' : 'text-muted'"
        >
          <UIcon
            :name="permission === 'granted' ? 'i-lucide-mic-2' : permission === 'denied' ? 'i-lucide-mic-off' : 'i-lucide-shield-check'"
            class="mt-0.5 size-3 shrink-0"
          />
          {{ permissionMessage }}
        </p>
      </div>

      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Dismiss Voice AI guide"
        class="shrink-0"
        @click="$emit('dismiss')"
      />
    </div>
  </section>
</template>
