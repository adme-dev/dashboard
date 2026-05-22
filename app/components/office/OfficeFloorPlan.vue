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
  <div
    class="relative overflow-auto rounded-2xl ring-1 ring-default
           shadow-[inset_0_2px_10px_rgba(0,0,0,0.04)]
           dark:shadow-[inset_0_2px_10px_rgba(0,0,0,0.4)]"
  >
    <!-- Floor: warm gradient (light) / cool deep gradient (dark) + faint dot grid -->
    <div
      class="relative bg-[radial-gradient(ellipse_at_top,_#fffaf3_0%,_#fef3e8_60%,_#fce8d0_100%)]
             dark:bg-[radial-gradient(ellipse_at_top,_#11151c_0%,_#0d1117_60%,_#080b10_100%)]"
      :style="{ width: layout.width + 'px', height: layout.height + 'px' }"
    >
      <div
        class="absolute inset-0 pointer-events-none opacity-[0.5] dark:opacity-[0.25]"
        style="background-image: radial-gradient(currentColor 1px, transparent 1px); background-size: 22px 22px; color: rgba(120,90,60,0.15)"
      />

      <OfficeZone
        v-for="zone in zones"
        :key="zone.id"
        :zone="zone"
        :occupants="occupantsOf(zone.id)"
        @enter="emit('enterZone', $event)"
      />
    </div>

    <!-- "Wandering" floating card top-right -->
    <div
      v-if="lobbyOccupants.length"
      class="absolute top-3 right-3 max-w-[260px] backdrop-blur-md
             bg-white/85 dark:bg-zinc-900/85 ring-1 ring-default rounded-xl shadow-lg p-3"
    >
      <div class="flex items-center gap-1.5 mb-2">
        <UIcon name="i-lucide-footprints" class="size-3.5 text-muted" />
        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Wandering · {{ lobbyOccupants.length }}
        </span>
      </div>
      <div class="flex flex-wrap gap-2">
        <OfficeAvatar
          v-for="p in lobbyOccupants.slice(0, 10)"
          :key="p.handle"
          :participant="p"
          :size="32"
          show-label
        />
        <div
          v-if="lobbyOccupants.length > 10"
          class="text-xs text-muted self-center pl-1"
        >
          +{{ lobbyOccupants.length - 10 }}
        </div>
      </div>
    </div>

    <!-- Empty state when no one is online -->
    <div
      v-if="totalParticipants === 0"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <div class="text-center">
        <UIcon name="i-lucide-coffee" class="size-10 text-muted opacity-50 mb-2 mx-auto" />
        <p class="text-sm text-muted">
          No one's around yet — be the first.
        </p>
      </div>
    </div>
  </div>
</template>
