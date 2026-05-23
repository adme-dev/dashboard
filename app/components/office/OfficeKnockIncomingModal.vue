<script setup lang="ts">
// Phase 1c.1 — incoming knock modal. Opens on knock:incoming WS message,
// plays one-shot sound, countdown ticks down, [Deny] / [Accept] actions.
// Dismissal by outside-click is treated as deny.

import { computed, ref, watch, onUnmounted } from 'vue'

interface Props {
  open: boolean
  fromName: string
  zoneName: string
  ttlMs: number
  /** ms timestamp when the knock was received (countdown source) */
  receivedAt: number
}
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'accept'): void
  (e: 'deny'): void
}>()

const now = ref(Date.now())
let tickHandle: ReturnType<typeof setInterval> | null = null

const secondsRemaining = computed(() => {
  const elapsed = now.value - props.receivedAt
  const remaining = Math.max(0, props.ttlMs - elapsed)
  return Math.ceil(remaining / 1000)
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    // One-shot sound; ignore autoplay rejection
    try { new Audio('/sounds/knock.mp3').play().catch(() => {}) } catch { /* no-op */ }
    // Start countdown tick
    if (tickHandle) clearInterval(tickHandle)
    tickHandle = setInterval(() => {
      now.value = Date.now()
      if (secondsRemaining.value <= 0) {
        // Auto-deny on timeout (server will also fire timeout via knock:result;
        // this is just for the UI to close before the server message arrives)
        if (tickHandle) { clearInterval(tickHandle); tickHandle = null }
        emit('deny')
        emit('update:open', false)
      }
    }, 250)
  } else if (tickHandle) {
    clearInterval(tickHandle)
    tickHandle = null
  }
}, { immediate: true })

onUnmounted(() => { if (tickHandle) clearInterval(tickHandle) })

function onAccept() {
  emit('accept')
  emit('update:open', false)
}
function onDeny() {
  emit('deny')
  emit('update:open', false)
}
// Outside click → update:open false → treated as deny by parent
function onOpenChange(v: boolean) {
  if (!v) emit('deny')
  emit('update:open', v)
}
</script>

<template>
  <UModal :open="open" @update:open="onOpenChange">
    <template #content>
      <div class="p-6 space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-lg font-semibold">{{ fromName }} wants to talk</h3>
            <UIcon name="i-lucide-bell-ring" class="text-amber-500" />
          </div>
          <p class="text-sm text-muted">
            {{ fromName }} knocked. Accept to start an audio chat in {{ zoneName }}.
          </p>
        </div>
        <div class="flex items-center justify-between gap-2 pt-2">
          <span class="text-xs text-muted">Times out in {{ secondsRemaining }}s…</span>
          <div class="flex gap-2">
            <UButton variant="ghost" @click="onDeny">Deny</UButton>
            <UButton color="primary" @click="onAccept">Accept</UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
