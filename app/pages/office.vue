<script setup lang="ts">
import type { OfficeRow, OfficeZoneRow, OfficeStatus } from '~~/app/types/office'

definePageMeta({ layout: 'agency' })

const { data: listData } = await useFetch<{
  offices: (OfficeRow & { my_role: string })[]
}>('/api/office')

const selectedId = ref<string | null>(listData.value?.offices[0]?.id ?? null)

const { data: detail } = await useFetch<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  myRole: string
}>(() => (selectedId.value ? `/api/office/${selectedId.value}` : null), {
  watch: [selectedId]
})

const connection = useOfficeConnection({ officeId: selectedId })

const myStatus = ref<OfficeStatus>('available')
watch(myStatus, s => connection.setStatus(s))

const toast = useToast()

function enterZone(zoneId: string) {
  const zone = detail.value?.zones.find(z => z.id === zoneId)
  // "Knock" affordance — non-lobby zones show a transient toast before
  // the actual zone:enter completes. Media handshake lands in Phase 1b;
  // this just sells the metaphor.
  if (zone && zone.zone_type !== 'lobby') {
    toast.add({
      title: `Knocking on ${zone.name}…`,
      description: 'You\'ll join the room in a moment.',
      icon: 'i-lucide-hand',
      color: 'neutral',
      duration: 2000
    })
  }
  connection.enterZone(zoneId)
}

watch(
  () => connection.lastError.value,
  (err) => {
    if (err) {
      toast.add({ title: 'Office', description: err, color: 'error' })
      connection.lastError.value = null
    }
  }
)

const participantCount = computed(() => connection.participants.value.size)
const officeName = computed(() => detail.value?.office.name ?? '')
const showSwitcher = computed(() => (listData.value?.offices.length ?? 0) > 1)
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-[#06070a] -mx-4 -my-4 p-6">
    <!-- ro.am-style minimal centered header. Subtle status indicator. -->
    <header class="relative flex items-center justify-between mb-5">
      <!-- Left: office context (quiet) -->
      <div class="flex items-center gap-3 text-sm">
        <div class="flex items-center gap-2 text-white/90">
          <div class="size-7 rounded-lg bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center">
            <UIcon name="i-lucide-building-2" class="size-3.5 text-emerald-400" />
          </div>
          <span class="font-semibold tracking-tight">Office</span>
        </div>
        <span class="text-white/30">·</span>
        <span class="text-white/60 text-[13px]">{{ officeName }}</span>
        <OfficeSwitcher
          v-if="showSwitcher && listData?.offices"
          v-model="selectedId"
          :offices="listData.offices"
        />
        <span
          v-if="detail"
          class="hidden md:inline-flex items-center gap-1.5 text-[11px] text-white/40 tracking-wide ml-3"
        >
          <UIcon name="i-lucide-users" class="size-3" />
          {{ participantCount }} online · {{ detail.zones.length }} rooms
        </span>
      </div>

      <!-- Right: live status + your-status picker -->
      <div class="flex items-center gap-2">
        <span
          v-if="connection.isConnected.value"
          class="hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-white/50"
        >
          <span class="size-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
          Live
        </span>
        <OfficeStatusPicker v-model="myStatus" />
      </div>
    </header>

    <div v-if="detail">
      <OfficeFloorPlan
        :office="detail.office"
        :zones="detail.zones"
        :participants="connection.participants.value"
        :zone-occupancy="connection.zoneOccupancy.value"
        @enter-zone="enterZone"
      />
    </div>

    <div
      v-else-if="!selectedId"
      class="rounded-2xl bg-[#16181d] ring-1 ring-white/[0.06] p-10 text-center"
    >
      <div class="size-12 mx-auto rounded-full bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center mb-3">
        <UIcon name="i-lucide-door-closed" class="size-5 text-white/40" />
      </div>
      <p class="text-sm text-white/60">
        You're not a member of any office. Ask an admin to add you.
      </p>
    </div>
  </div>
</template>
