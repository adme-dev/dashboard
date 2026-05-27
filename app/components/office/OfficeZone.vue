<script setup lang="ts">
import type { OfficeZoneRow, OfficeParticipant, OfficeMemberRow, OfficePresenceEventKind, ZoneType } from '~~/app/types/office'
import { safeMediaUrl } from '~~/app/utils/safe-url'

type DeskOwner = OfficeMemberRow & {
  name: string | null
  avatar_url: string | null
}

type ZonePresenceEvent = {
  id: string
  kind: OfficePresenceEventKind
  label: string
}

const props = defineProps<{
  zone: OfficeZoneRow
  deskOwner?: DeskOwner | null
  deskOwnerParticipant?: OfficeParticipant | null
  deskOwnerLocation?: string | null
  occupants: OfficeParticipant[]
  presenceEvents?: ZonePresenceEvent[]
  isHighlighted?: boolean
  isSelected?: boolean
  layout?: 'absolute' | 'grid'
}>()

const emit = defineEmits<{
  enter: [zoneId: string]
}>()

// Per-zone subtle ring tone — restrained, monochromatic-leaning.
// ro.am uses neutrals everywhere and reserves saturated rings for state
// (in-call orange, selected purple, etc). We match that: a faint ring
// suggesting the room's purpose, and a stronger ring when occupied.
const zoneTint: Record<ZoneType, { icon: string, ringOccupied: string, glow: string }> = {
  lobby: {
    icon: 'i-lucide-sofa',
    ringOccupied: 'ring-amber-400/40',
    glow: 'bg-amber-500/[0.04]'
  },
  meeting: {
    icon: 'i-lucide-users-round',
    ringOccupied: 'ring-sky-400/40',
    glow: 'bg-sky-500/[0.04]'
  },
  focus: {
    icon: 'i-lucide-headphones',
    ringOccupied: 'ring-emerald-400/40',
    glow: 'bg-emerald-500/[0.04]'
  },
  theater: {
    icon: 'i-lucide-presentation',
    ringOccupied: 'ring-violet-400/40',
    glow: 'bg-violet-500/[0.04]'
  },
  client_lounge: {
    icon: 'i-lucide-handshake',
    ringOccupied: 'ring-rose-400/40',
    glow: 'bg-rose-500/[0.04]'
  },
  desk: {
    icon: 'i-lucide-door-closed',
    ringOccupied: 'ring-indigo-400/40',
    glow: 'bg-indigo-500/[0.04]'
  }
}

const tint = computed(() => zoneTint[props.zone.zone_type] ?? zoneTint.focus)
const stackedAvatars = computed(() => props.occupants.slice(0, 6))
const overflow = computed(() => Math.max(0, props.occupants.length - 6))
const isOccupied = computed(() => props.occupants.length > 0)
const fillRatio = computed(() => props.occupants.length / Math.max(1, props.zone.capacity))
const isFull = computed(() => fillRatio.value >= 1)
const isDesk = computed(() => props.zone.zone_type === 'desk')
const deskName = computed(() =>
  props.deskOwner?.name || props.zone.name.replace(/'s desk$/i, '')
)
const cleanedDeskName = computed(() => deskName.value.replace(/\s*\([^)]*\)/g, '').trim() || deskName.value)
const deskDisplayName = computed(() => {
  return cleanedDeskName.value
})
const deskSecondaryName = computed(() => {
  return props.zone.name.replace(/'s desk$/i, '') === cleanedDeskName.value
    ? 'Private office'
    : props.zone.name.replace(/'s desk$/i, '')
})
const deskInitials = computed(() =>
  deskName.value
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
)
const deskAvatarSrc = computed(() => safeMediaUrl(props.deskOwner?.avatar_url))
const deskPresence = computed(() =>
  props.occupants.find(p => p.handle === `user:${props.deskOwner?.user_id}`)
)
const deskOwnerPresence = computed(() => props.deskOwnerParticipant ?? deskPresence.value ?? null)
const deskPresenceLabel = computed(() => {
  if (!deskOwnerPresence.value) return 'Desk'
  if (deskOwnerPresence.value.currentZoneId === props.zone.id) return 'In office'
  return 'Online'
})
const deskPresenceTitle = computed(() => {
  if (!deskOwnerPresence.value) return 'Private office'
  return props.deskOwnerLocation ? `Currently in ${props.deskOwnerLocation}` : 'Online'
})
const deskLocationLabel = computed(() => {
  if (deskOwnerPresence.value?.currentZoneId && deskOwnerPresence.value.currentZoneId !== props.zone.id && props.deskOwnerLocation) {
    return props.deskOwnerLocation
  }
  return deskSecondaryName.value
})
const isGridLayout = computed(() => props.layout === 'grid')
const visiblePresenceEvents = computed(() => props.presenceEvents?.slice(0, 2) ?? [])
const eventTone = computed(() => {
  const latest = visiblePresenceEvents.value[0]
  if (latest?.kind === 'knock') {
    return {
      icon: 'i-lucide-hand',
      label: latest.label,
      class: 'border-amber-300/20 bg-amber-400/12 text-amber-100 ring-amber-300/15'
    }
  }
  if (latest?.kind === 'raise_hand') {
    return {
      icon: 'i-lucide-hand-metal',
      label: latest.label,
      class: 'border-sky-300/20 bg-sky-400/12 text-sky-100 ring-sky-300/15'
    }
  }
  return {
    icon: 'i-lucide-hand-heart',
    label: latest?.label ?? 'Wave',
    class: 'border-emerald-300/20 bg-emerald-400/12 text-emerald-100 ring-emerald-300/15'
  }
})
const displayPosition = computed(() => ({
  left: props.zone.position.x,
  top: props.zone.position.y,
  width: isDesk.value ? Math.max(props.zone.position.w, 122) : props.zone.position.w,
  height: isDesk.value ? Math.max(props.zone.position.h, 92) : props.zone.position.h
}))
</script>

<template>
  <button
    type="button"
    class="group overflow-hidden transition-all duration-200 text-left
           bg-[#171a20] ring-1
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    :class="[
      isGridLayout ? (isDesk ? 'relative h-[112px] w-full' : 'relative min-h-[150px] w-full') : 'absolute',
      isDesk ? 'rounded-lg' : 'rounded-xl',
      isSelected
        ? 'ring-2 ring-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_18px_50px_-18px_rgba(255,255,255,0.45)] z-20'
        : isHighlighted
          ? 'ring-2 ring-emerald-300/70 shadow-[0_0_0_1px_rgba(110,231,183,0.2),0_16px_42px_-18px_rgba(16,185,129,0.8)] z-10'
          : isOccupied ? tint.ringOccupied : 'ring-white/[0.06]',
      'cursor-pointer hover:ring-white/30 hover:bg-[#1d2128] hover:z-10 hover:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)]',
      isFull ? 'opacity-70' : ''
    ]"
    :style="isGridLayout
      ? undefined
      : {
        left: displayPosition.left + 'px',
        top: displayPosition.top + 'px',
        width: displayPosition.width + 'px',
        height: displayPosition.height + 'px'
      }"
    :aria-label="`Open ${zone.name}`"
    @click="emit('enter', zone.id)"
  >
    <!-- Inner color wash — extremely subtle, only visible when occupied -->
    <div
      v-if="isOccupied"
      class="absolute inset-0 pointer-events-none transition-opacity"
      :class="tint.glow"
    />

    <div
      v-if="visiblePresenceEvents.length"
      class="pointer-events-none absolute right-2 top-2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold shadow-[0_10px_30px_-18px_rgba(0,0,0,0.95)] ring-1 backdrop-blur-xl"
      :class="eventTone.class"
    >
      <UIcon
        :name="eventTone.icon"
        class="size-3 shrink-0 animate-pulse"
      />
      <span class="truncate">{{ eventTone.label }}</span>
      <span
        v-if="visiblePresenceEvents.length > 1"
        class="rounded-full bg-white/10 px-1 text-[9px]"
      >
        +{{ visiblePresenceEvents.length - 1 }}
      </span>
    </div>

    <div
      v-if="isDesk"
      class="relative flex h-full flex-col justify-between gap-2 px-3 py-2.5"
    >
      <div class="flex min-w-0 items-center justify-between gap-2">
        <UAvatar
          :src="deskAvatarSrc"
          :alt="deskName"
          size="sm"
          :ui="{ root: 'ring-1 ring-white/15 shrink-0' }"
        >
          <span class="text-[11px] font-semibold text-white/80">{{ deskInitials }}</span>
        </UAvatar>
        <span
          class="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.045] px-2 py-0.5 text-[10px] font-medium text-white/45 ring-1 ring-white/[0.06]"
          :title="deskPresenceTitle"
        >
          <span
            class="size-1.5 rounded-full"
            :class="deskOwnerPresence ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-white/25'"
          />
          {{ deskPresenceLabel }}
        </span>
      </div>

      <div class="min-w-0">
        <div class="min-w-0">
          <span
            class="line-clamp-2 text-[13px] font-semibold leading-[1.14] text-white"
            :title="deskName"
          >
            {{ deskDisplayName }}
          </span>
        </div>
        <div class="mt-1.5 flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-white/38">
          <UIcon name="i-lucide-door-closed" class="size-3 shrink-0" />
          <span
            class="truncate"
            :title="deskLocationLabel"
          >
            {{ deskLocationLabel }}
          </span>
        </div>
      </div>
    </div>

    <div v-else class="relative flex h-full flex-col gap-2 p-4">
      <!-- Header: tiny icon + name on left, capacity badge on right -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <UIcon
            :name="tint.icon"
            class="size-4 shrink-0 text-white/50"
          />
          <span class="truncate text-sm font-semibold tracking-tight text-white">
            {{ zone.name }}
          </span>
          <span
            v-if="isOccupied"
            class="ml-1 size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
          />
        </div>
        <span class="shrink-0 text-[11px] font-medium tabular-nums text-white/42">
          {{ occupants.length }}<span class="text-white/20">/{{ zone.capacity }}</span>
        </span>
      </div>

      <!-- Avatar grid: bigger, named, ro.am-style -->
      <div class="flex flex-wrap gap-2 mt-auto">
        <OfficeAvatar
          v-for="p in stackedAvatars"
          :key="p.handle"
          :participant="p"
          :size="34"
          show-label
        />
        <div
          v-if="overflow > 0"
          class="inline-flex flex-col items-center gap-1"
        >
          <span
            class="inline-flex items-center justify-center rounded-full
                   bg-white/10 text-white text-[10px] font-semibold tabular-nums
                   size-[34px] ring-1 ring-white/20"
          >
            +{{ overflow }}
          </span>
        </div>
      </div>

      <!-- Hover affordance — subtle, only shows on hover -->
      <div
        class="absolute inset-x-0 bottom-0 px-3 py-1.5 opacity-0 group-hover:opacity-100
               transition-opacity bg-black/60 backdrop-blur-sm border-t border-white/[0.06]
               text-[10px] font-medium tracking-wide text-white/70 text-center"
      >
        {{ isFull ? 'View room' : zone.zone_type === 'desk' ? 'Open private office' : 'Open room' }}
      </div>
    </div>
  </button>
</template>
