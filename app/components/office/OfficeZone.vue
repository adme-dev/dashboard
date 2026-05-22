<script setup lang="ts">
import type { OfficeZoneRow, OfficeParticipant, ZoneType } from '~~/app/types/office'

const props = defineProps<{
  zone: OfficeZoneRow
  occupants: OfficeParticipant[]
}>()

const emit = defineEmits<{
  enter: [zoneId: string]
}>()

// Zone-type-specific visual treatment. Light + dark pairs everywhere
// so the office reads in both modes per project conventions.
const zoneTheme: Record<ZoneType, { gradient: string, ring: string, icon: string, label: string }> = {
  lobby: {
    gradient: 'from-amber-50 via-orange-50/60 to-amber-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40',
    ring: 'ring-amber-200/60 dark:ring-amber-800/50',
    icon: 'i-lucide-sofa',
    label: 'text-amber-700 dark:text-amber-300'
  },
  meeting: {
    gradient: 'from-sky-50 via-indigo-50/60 to-sky-50 dark:from-sky-950/40 dark:via-indigo-950/30 dark:to-sky-950/40',
    ring: 'ring-sky-200/60 dark:ring-sky-800/50',
    icon: 'i-lucide-users-round',
    label: 'text-sky-700 dark:text-sky-300'
  },
  focus: {
    gradient: 'from-emerald-50 via-teal-50/60 to-emerald-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40',
    ring: 'ring-emerald-200/60 dark:ring-emerald-800/50',
    icon: 'i-lucide-headphones',
    label: 'text-emerald-700 dark:text-emerald-300'
  },
  theater: {
    gradient: 'from-violet-50 via-fuchsia-50/60 to-violet-50 dark:from-violet-950/40 dark:via-fuchsia-950/30 dark:to-violet-950/40',
    ring: 'ring-violet-200/60 dark:ring-violet-800/50',
    icon: 'i-lucide-presentation',
    label: 'text-violet-700 dark:text-violet-300'
  },
  client_lounge: {
    gradient: 'from-rose-50 via-pink-50/60 to-rose-50 dark:from-rose-950/40 dark:via-pink-950/30 dark:to-rose-950/40',
    ring: 'ring-rose-200/60 dark:ring-rose-800/50',
    icon: 'i-lucide-handshake',
    label: 'text-rose-700 dark:text-rose-300'
  }
}

const theme = computed(() => zoneTheme[props.zone.zone_type])
const stackedAvatars = computed(() => props.occupants.slice(0, 5))
const overflow = computed(() => Math.max(0, props.occupants.length - 5))
const isOccupied = computed(() => props.occupants.length > 0)
const fillRatio = computed(() => props.occupants.length / Math.max(1, props.zone.capacity))
const capacityTone = computed(() => {
  if (fillRatio.value >= 1) return 'bg-red-500/15 text-red-700 dark:text-red-300'
  if (fillRatio.value >= 0.75) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  return 'bg-white/60 dark:bg-zinc-900/60 text-default'
})
</script>

<template>
  <button
    type="button"
    class="group absolute overflow-hidden rounded-2xl ring-1 cursor-pointer
           transition-all duration-200 ease-out text-left
           hover:scale-[1.015] hover:shadow-xl hover:z-10
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    :class="[
      'bg-gradient-to-br',
      theme.gradient,
      theme.ring,
      isOccupied ? 'shadow-md' : 'shadow-sm'
    ]"
    :style="{
      left: zone.position.x + 'px',
      top: zone.position.y + 'px',
      width: zone.position.w + 'px',
      height: zone.position.h + 'px'
    }"
    :aria-label="`Enter ${zone.name}`"
    @click="emit('enter', zone.id)"
  >
    <!-- Decorative zone icon: large, low-opacity, bottom-right -->
    <UIcon
      :name="theme.icon"
      class="absolute -bottom-3 -right-3 size-24 opacity-[0.08] dark:opacity-[0.12] pointer-events-none"
    />

    <div class="relative flex h-full flex-col p-3 gap-2">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0">
          <UIcon :name="theme.icon" :class="[theme.label, 'size-3.5 shrink-0']" />
          <span class="font-semibold text-sm text-highlighted truncate">{{ zone.name }}</span>
        </div>
        <span
          class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums backdrop-blur-sm"
          :class="capacityTone"
        >
          {{ occupants.length }}/{{ zone.capacity }}
        </span>
      </div>

      <!-- Occupied state: "live" indicator -->
      <div
        v-if="isOccupied"
        class="absolute top-3 right-14 flex items-center gap-1 pointer-events-none"
      >
        <span class="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      <div class="flex -space-x-2 mt-auto items-end">
        <OfficeAvatar
          v-for="p in stackedAvatars"
          :key="p.handle"
          :participant="p"
          :size="32"
        />
        <span
          v-if="overflow > 0"
          class="ml-1 inline-flex items-center justify-center rounded-full
                 bg-zinc-900/85 dark:bg-white/85 text-white dark:text-zinc-900
                 size-7 text-[11px] font-semibold tabular-nums ring-2 ring-default"
        >
          +{{ overflow }}
        </span>
      </div>
    </div>
  </button>
</template>
