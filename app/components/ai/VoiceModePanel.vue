<script setup lang="ts">
import { computed } from 'vue'
import type { VoicePhase } from '~~/app/utils/voiceSessionMachine'

const props = defineProps<{ phase: VoicePhase, volumeLevel: number, error: string | null }>()
defineEmits<{ stop: [] }>()

const LABELS: Record<VoicePhase, string> = {
  idle: 'Voice off',
  listening: 'Listening…',
  processing: 'Thinking…',
  speaking: 'Speaking…',
  awaitingConfirm: 'Say "confirm" to proceed, or "cancel"',
  confirming: 'Confirming…'
}

const label = computed(() => LABELS[props.phase])
const bars = [0.4, 0.7, 1, 0.7, 0.4]
function barHeight(scale: number): string {
  return Math.max(3, Math.min(16, props.volumeLevel * 80 * scale)) + 'px'
}
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl border border-default bg-elevated/70 px-4 py-2.5 backdrop-blur">
    <span
      class="flex size-7 items-center justify-center rounded-full"
      :class="phase === 'awaitingConfirm' ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'"
    >
      <UIcon
        :name="phase === 'speaking' ? 'i-lucide-volume-2' : phase === 'processing' || phase === 'confirming' ? 'i-lucide-loader' : 'i-lucide-mic'"
        class="size-4"
        :class="(phase === 'processing' || phase === 'confirming') ? 'animate-spin' : ''"
      />
    </span>

    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-highlighted">
        {{ label }}
      </p>
      <p v-if="error" class="truncate text-xs text-error">
        {{ error }}
      </p>
    </div>

    <!-- Live waveform -->
    <span v-if="phase === 'listening'" class="flex h-4 items-end gap-0.5" aria-hidden="true">
      <span
        v-for="(scale, i) in bars"
        :key="i"
        class="w-1 rounded-t bg-primary/70 transition-all duration-75"
        :style="{ height: barHeight(scale) }"
      />
    </span>

    <UButton
      icon="i-lucide-square"
      color="neutral"
      variant="soft"
      size="sm"
      label="Stop"
      @click="$emit('stop')"
    />
  </div>
</template>
