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
</script>

<template>
  <div class="relative overflow-auto rounded-xl border border-default bg-default">
    <div
      class="relative"
      :style="{ width: layout.width + 'px', height: layout.height + 'px' }"
    >
      <OfficeZone
        v-for="zone in zones"
        :key="zone.id"
        :zone="zone"
        :occupants="occupantsOf(zone.id)"
        @enter="emit('enterZone', $event)"
      />
    </div>
    <div
      v-if="lobbyOccupants.length"
      class="absolute top-2 right-2 flex items-center gap-2 bg-elevated rounded-lg p-2 border border-default"
    >
      <span class="text-xs text-muted">Wandering:</span>
      <OfficeAvatar
        v-for="p in lobbyOccupants.slice(0, 8)"
        :key="p.handle"
        :participant="p"
        :size="24"
      />
    </div>
  </div>
</template>
