<script setup lang="ts">
import type {
  OfficeRow,
  OfficeZoneRow,
  OfficeParticipant,
  ActorHandle
} from '~~/app/types/office'

const props = defineProps<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  participants: Map<ActorHandle, OfficeParticipant>
  zoneOccupancy: Record<string, ActorHandle[]>
}>()

const emit = defineEmits<{ enterZone: [zoneId: string] }>()

const layout = computed(() => ({
  width: props.office.layout?.width ?? 1200,
  height: props.office.layout?.height ?? 800
}))

function occupantsOf(zoneId: string): OfficeParticipant[] {
  const handles = props.zoneOccupancy[zoneId] || []
  return handles
    .map(h => props.participants.get(h))
    .filter((p): p is OfficeParticipant => Boolean(p))
}

const lobbyOccupants = computed<OfficeParticipant[]>(() => {
  const inZone = new Set<ActorHandle>()
  for (const list of Object.values(props.zoneOccupancy)) {
    for (const h of list) inZone.add(h)
  }
  return Array.from(props.participants.values()).filter(p => !inZone.has(p.handle))
})

const totalParticipants = computed(() => props.participants.size)
</script>

<template>
  <!-- ro.am-style cinematic dark floor: pitch black with subtle purple-blue
       overhead glow. No warm tones; the entire surface feels like a studio -->
  <div
    class="relative overflow-auto rounded-2xl ring-1 ring-white/[0.06]
           bg-[#0a0b0e]
           shadow-[inset_0_2px_30px_rgba(0,0,0,0.6),0_20px_60px_-30px_rgba(0,0,0,0.8)]"
  >
    <!-- Floor surface -->
    <div
      class="relative"
      :style="{ width: layout.width + 'px', height: layout.height + 'px' }"
    >
      <!-- Overhead spotlight: soft purple-blue radial from top-center -->
      <div
        class="absolute inset-x-0 top-0 h-[60%] pointer-events-none
               bg-[radial-gradient(ellipse_at_top,_rgba(120,90,255,0.18)_0%,_rgba(80,120,255,0.06)_30%,_transparent_70%)]"
      />
      <!-- Faint grid texture for depth -->
      <div
        class="absolute inset-0 pointer-events-none opacity-[0.08]"
        style="background-image: radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px); background-size: 28px 28px"
      />

      <OfficeZone
        v-for="zone in zones"
        :key="zone.id"
        :zone="zone"
        :occupants="occupantsOf(zone.id)"
        @enter="emit('enterZone', $event)"
      />
    </div>

    <!-- "Wandering" rail: cleaner glass card, no decorative icon -->
    <div
      v-if="lobbyOccupants.length"
      class="absolute top-4 right-4 max-w-[280px] backdrop-blur-xl
             bg-white/[0.04] ring-1 ring-white/[0.08] rounded-xl px-3 py-2.5 shadow-2xl"
    >
      <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 mb-2">
        Around · {{ lobbyOccupants.length }}
      </div>
      <div class="flex flex-wrap gap-2.5">
        <OfficeAvatar
          v-for="p in lobbyOccupants.slice(0, 12)"
          :key="p.handle"
          :participant="p"
          :size="34"
          show-label
        />
        <div
          v-if="lobbyOccupants.length > 12"
          class="text-xs text-white/40 self-center pl-1"
        >
          +{{ lobbyOccupants.length - 12 }}
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="totalParticipants === 0"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <div class="text-center">
        <div class="size-12 mx-auto rounded-full bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center mb-3">
          <UIcon name="i-lucide-moon-star" class="size-5 text-white/30" />
        </div>
        <p class="text-xs text-white/40 tracking-wide">
          No one's here yet — be the first.
        </p>
      </div>
    </div>
  </div>
</template>
