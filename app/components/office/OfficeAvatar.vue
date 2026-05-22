<script setup lang="ts">
import type { OfficeParticipant, OfficeStatus } from '~~/app/types/office'

const props = defineProps<{
  participant: OfficeParticipant
  size?: number
  showLabel?: boolean
}>()

const statusColors: Record<OfficeStatus, string> = {
  available: 'bg-emerald-500',
  busy: 'bg-amber-500',
  dnd: 'bg-red-500',
  away: 'bg-zinc-400'
}

const statusLabels: Record<OfficeStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  dnd: 'Do not disturb',
  away: 'Away'
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
const firstName = computed(() => props.participant.name.split(/\s+/)[0] ?? '')
const tooltipText = computed(
  () => `${props.participant.name} — ${statusLabels[props.participant.status]}`
)
</script>

<template>
  <div class="inline-flex flex-col items-center gap-1">
    <UTooltip :text="tooltipText" :delay-duration="150">
      <div
        class="relative inline-block transition-transform duration-150 hover:scale-110"
        :style="{ width: `${sz}px`, height: `${sz}px` }"
      >
        <UAvatar
          :src="participant.avatarUrl || undefined"
          :alt="participant.name"
          :size="sz <= 24 ? 'xs' : sz <= 32 ? 'sm' : 'md'"
          :ui="participant.isGuest
            ? { root: 'ring-2 ring-orange-400 ring-offset-1 ring-offset-default' }
            : { root: 'ring-2 ring-default' }"
        >
          <span v-if="!participant.avatarUrl">{{ initials }}</span>
        </UAvatar>
        <span
          class="absolute bottom-0 right-0 block rounded-full ring-2 ring-default"
          :class="statusColors[participant.status]"
          :style="{
            width: `${Math.max(7, sz / 4)}px`,
            height: `${Math.max(7, sz / 4)}px`
          }"
        />
      </div>
    </UTooltip>
    <span
      v-if="showLabel"
      class="text-[10px] font-medium text-default leading-none truncate max-w-[60px] text-center"
    >
      {{ firstName }}
    </span>
  </div>
</template>
