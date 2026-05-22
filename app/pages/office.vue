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

function enterZone(zoneId: string) {
  connection.enterZone(zoneId)
}

const toast = useToast()
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
</script>

<template>
  <div class="p-4 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-building-2" class="size-5 text-primary" />
          <h1 class="text-xl font-semibold tracking-tight">
            Office
          </h1>
        </div>
        <OfficeSwitcher
          v-if="listData?.offices"
          v-model="selectedId"
          :offices="listData.offices"
        />
        <span
          v-if="detail"
          class="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted"
        >
          <UIcon name="i-lucide-users" class="size-3.5" />
          {{ participantCount }} online · {{ detail.zones.length }} rooms
        </span>
      </div>

      <div class="flex items-center gap-2">
        <span
          class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1"
          :class="connection.isConnected.value
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30'
            : 'bg-zinc-500/10 text-muted ring-zinc-400/30'"
        >
          <span
            class="size-1.5 rounded-full"
            :class="connection.isConnected.value ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'"
          />
          {{ connection.isConnected.value ? 'Live' : 'Connecting…' }}
        </span>
        <OfficeStatusPicker v-model="myStatus" />
      </div>
    </div>

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
      class="rounded-2xl border border-dashed border-default p-8 text-center"
    >
      <UIcon name="i-lucide-door-closed" class="size-10 text-muted mx-auto mb-2 opacity-60" />
      <p class="text-sm text-muted">
        You're not a member of any office. Ask an admin to add you.
      </p>
    </div>
  </div>
</template>
