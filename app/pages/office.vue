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
</script>

<template>
  <div class="p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h1 class="text-lg font-semibold">
          Office
        </h1>
        <OfficeSwitcher
          v-if="listData?.offices"
          v-model="selectedId"
          :offices="listData.offices"
        />
      </div>
      <div class="flex items-center gap-3">
        <UBadge
          :color="connection.isConnected.value ? 'success' : 'neutral'"
          variant="subtle"
        >
          {{ connection.isConnected.value ? 'Connected' : 'Connecting…' }}
        </UBadge>
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

    <div v-else-if="!selectedId" class="text-muted text-sm">
      You're not a member of any office. Ask an admin to add you.
    </div>
  </div>
</template>
