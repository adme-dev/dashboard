<script setup lang="ts">
import type { OfficeParticipant, OfficeStatus } from '~~/app/types/office'

const props = defineProps<{
  participant: OfficeParticipant
  size?: number
}>()

const statusColors: Record<OfficeStatus, string> = {
  available: 'bg-emerald-500',
  busy: 'bg-amber-500',
  dnd: 'bg-red-500',
  away: 'bg-zinc-400'
}

const sz = computed(() => props.size ?? 32)
const initials = computed(() =>
  props.participant.name
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
)
</script>

<template>
  <div class="relative inline-block" :style="{ width: `${sz}px`, height: `${sz}px` }">
    <UAvatar
      :src="participant.avatarUrl || undefined"
      :alt="participant.name"
      :size="sz <= 24 ? 'xs' : sz <= 32 ? 'sm' : 'md'"
      :ui="participant.isGuest ? { root: 'ring-2 ring-orange-400' } : undefined"
    >
      <span v-if="!participant.avatarUrl">{{ initials }}</span>
    </UAvatar>
    <span
      class="absolute bottom-0 right-0 block rounded-full ring-2 ring-default"
      :class="statusColors[participant.status]"
      :style="{
        width: `${Math.max(6, sz / 4)}px`,
        height: `${Math.max(6, sz / 4)}px`
      }"
    />
  </div>
</template>
