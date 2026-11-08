<script setup lang="ts">
import { computed } from 'vue'

type MicrophonePermissionState = PermissionState | 'unknown' | 'unsupported'

const props = defineProps<{
  permission: MicrophonePermissionState
  handsFreeAvailable: boolean
  unavailable?: boolean
  error?: string | null
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
const hasWarning = computed(() => props.unavailable || Boolean(props.error) || props.permission === 'denied' || props.permission === 'unsupported')
</script>

<template>
  <section
    class="mb-2 flex items-start gap-2 rounded-lg border border-default bg-default/80 px-3 py-2 text-xs"
    aria-label="Voice AI guidance"
    :role="hasWarning ? 'status' : undefined"
  >
    <UIcon :name="hasWarning ? 'i-lucide-mic-off' : 'i-lucide-audio-lines'" class="mt-0.5 size-3.5 shrink-0" :class="hasWarning ? 'text-warning' : 'text-muted'" />
    <div class="min-w-0 flex-1 space-y-1 leading-relaxed">
      <p v-if="unavailable" class="font-medium text-warning">
        Voice unavailable
      </p>
      <p v-if="!hasWarning" class="text-muted">
        <strong class="font-medium text-default">Voice message</strong> records one question.
        <template v-if="handsFreeAvailable">
          <strong class="font-medium text-default">Talk</strong> starts a hands-free conversation.
        </template>
      </p>
      <p :class="hasWarning ? 'text-warning' : 'text-muted'">
        {{ error || (unavailable ? 'Type your message while voice is unavailable.' : permissionMessage) }}
      </p>
    </div>
    <UButton
      v-if="!hasWarning"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="xs"
      aria-label="Dismiss Voice AI guide"
      class="shrink-0"
      @click="$emit('dismiss')"
    />
  </section>
</template>
