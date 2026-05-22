<script setup lang="ts">
import type { OfficeParticipant, OfficeStatus } from '~~/app/types/office'

const props = defineProps<{
  participant: OfficeParticipant
  size?: number
  showLabel?: boolean
}>()

const statusColors: Record<OfficeStatus, string> = {
  available: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
  busy: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]',
  dnd: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]',
  away: 'bg-zinc-500'
}

const statusLabels: Record<OfficeStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  dnd: 'Do not disturb',
  away: 'Away'
}

const sz = computed(() => props.size ?? 34)
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
    <UTooltip :text="tooltipText" :delay-duration="120">
      <div
        class="relative inline-block transition-transform duration-150 hover:scale-[1.08] cursor-pointer"
        :style="{ width: `${sz}px`, height: `${sz}px` }"
      >
        <UAvatar
          :src="participant.avatarUrl || undefined"
          :alt="participant.name"
          :size="sz <= 24 ? 'xs' : sz <= 32 ? 'sm' : 'md'"
          :ui="participant.isGuest
            ? { root: 'ring-2 ring-orange-400 ring-offset-2 ring-offset-[#0a0b0e]' }
            : { root: 'ring-1 ring-white/15' }"
        >
          <span v-if="!participant.avatarUrl" class="text-white/80">{{ initials }}</span>
        </UAvatar>
        <span
          class="absolute bottom-0 right-0 block rounded-full ring-2 ring-[#16181d]"
          :class="statusColors[participant.status]"
          :style="{
            width: `${Math.max(8, sz / 3.5)}px`,
            height: `${Math.max(8, sz / 3.5)}px`
          }"
        />
      </div>
    </UTooltip>
    <span
      v-if="showLabel"
      class="text-[10px] font-medium text-white/70 leading-none truncate max-w-[60px] text-center tracking-tight"
    >
      {{ firstName }}
    </span>
  </div>
</template>
