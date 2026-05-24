<script setup lang="ts">
import type { OfficeZoneRow, OfficeParticipant, ZoneType } from '~~/app/types/office'

const props = defineProps<{
  zone: OfficeZoneRow
  occupants: OfficeParticipant[]
  currentUserZoneId?: string | null
}>()

const emit = defineEmits<{
  enter: [zoneId: string]
  knock: [payload: { zoneId: string; zoneName: string; occupantNames: string[] }]
  toast: [payload: { title: string; description: string; color: 'info' | 'warning' | 'error' | 'success' }]
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
  }
}

const isDeskOrAdhoc = computed(() =>
  props.zone.zone_type === 'desk' || props.zone.zone_type === 'adhoc'
)
const tint = computed(() => zoneTint[props.zone.zone_type])
const stackedAvatars = computed(() => props.occupants.slice(0, 6))
const overflow = computed(() => Math.max(0, props.occupants.length - 6))
const isOccupied = computed(() => props.occupants.length > 0)
const fillRatio = computed(() => props.occupants.length / Math.max(1, props.zone.capacity))
const isFull = computed(() => fillRatio.value >= 1)

// Knockable: focus rooms with at least one occupant require a knock rather
// than a direct zone:enter. (The 'private' type doesn't exist in ZoneType yet;
// if it's added to the enum, include it in this array.)
const isKnockable = computed(() =>
  (['focus'] as ZoneType[]).includes(props.zone.zone_type) &&
  props.occupants.length > 0
)

const occupantNames = computed(() => props.occupants.map(o => o.name ?? 'someone'))

function onZoneClick() {
  if (isKnockable.value) {
    if (props.currentUserZoneId) {
      // Already in a zone — cannot knock from inside a room.
      emit('toast', {
        title: 'Already in a room',
        description: 'Leave your current room first to knock on someone else.',
        color: 'warning',
      })
      return
    }
    emit('knock', {
      zoneId: props.zone.id,
      zoneName: props.zone.name,
      occupantNames: occupantNames.value,
    })
    return
  }
  // Normal enter path.
  if (!isFull.value) emit('enter', props.zone.id)
}
</script>

<template>
  <template v-if="isDeskOrAdhoc" />
  <button
    v-else
    type="button"
    :disabled="isFull && !isKnockable"
    class="group absolute overflow-hidden rounded-2xl transition-all duration-200 text-left
           bg-[#16181d] ring-1
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    :class="[
      isOccupied ? tint.ringOccupied : 'ring-white/[0.06]',
      isFull && !isKnockable
        ? 'opacity-50 cursor-not-allowed'
        : isKnockable
          ? 'cursor-help hover:ring-amber-400/50 hover:bg-[#1a1d23] hover:z-10 hover:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)]'
          : 'cursor-pointer hover:ring-white/30 hover:bg-[#1a1d23] hover:z-10 hover:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)]'
    ]"
    :style="{
      left: zone.position.x + 'px',
      top: zone.position.y + 'px',
      width: zone.position.w + 'px',
      height: zone.position.h + 'px'
    }"
    :aria-label="isKnockable ? `Knock on ${zone.name}` : isFull ? `${zone.name} (full)` : `Enter ${zone.name}`"
    @click="onZoneClick"
  >
    <!-- Inner color wash — extremely subtle, only visible when occupied -->
    <div
      v-if="isOccupied"
      class="absolute inset-0 pointer-events-none transition-opacity"
      :class="tint.glow"
    />

    <div class="relative flex h-full flex-col p-3.5 gap-2">
      <!-- Header: tiny icon + name on left, capacity badge on right -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0">
          <UIcon
            :name="tint.icon"
            class="size-3.5 shrink-0 text-white/50"
          />
          <span class="font-medium text-[13px] text-white truncate tracking-tight">
            {{ zone.name }}
          </span>
          <span
            v-if="isOccupied"
            class="ml-1 size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
          />
        </div>
        <span class="shrink-0 text-[10px] font-medium tabular-nums text-white/40">
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

      <!-- Knockable indicator: ear icon bottom-right, shown when occupants are
           present in a focus room so the user knows they can knock. -->
      <div
        v-if="isKnockable"
        class="absolute bottom-8 right-2 text-amber-400/80 pointer-events-none"
        aria-label="Knockable room — click to knock"
      >
        <UIcon name="i-lucide-ear" class="size-4" />
      </div>

      <!-- Hover affordance — subtle, only shows on hover -->
      <div
        v-if="!isFull || isKnockable"
        class="absolute inset-x-0 bottom-0 px-3 py-1.5 opacity-0 group-hover:opacity-100
               transition-opacity bg-black/60 backdrop-blur-sm border-t border-white/[0.06]
               text-[10px] font-medium tracking-wide text-center"
        :class="isKnockable ? 'text-amber-300/80' : 'text-white/70'"
      >
        {{ isKnockable ? 'Knock to enter' : zone.zone_type === 'lobby' ? 'Step in' : 'Enter' }}
      </div>

      <div
        v-else
        class="absolute inset-x-0 bottom-0 px-3 py-1.5 bg-red-500/10 border-t border-red-500/20
               text-[10px] font-medium text-red-300 text-center"
      >
        Room full
      </div>
    </div>
  </button>
</template>
