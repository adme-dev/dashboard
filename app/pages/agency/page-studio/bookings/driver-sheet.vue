<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'agency' })
useHead({ title: 'Driver sheet | Page Studio' })

interface DriverBooking { id: string, customer: string, phone: string, passengers: number, pickup: string, dropoff: string, travelAt: string | null, durationMinutes: number, vehicleId: string, occasion: string }
const { siteId, selectSite } = usePageStudioBookingSite()
const { data, pending, error, refresh, clear } = await useFetch<{ siteId?: string, bookings: DriverBooking[] }>('/api/agency/page-studio/bookings/driver-sheet', { immediate: false, watch: false, query: { siteId }, default: () => ({ bookings: [] }) })
const bookings = computed(() => data.value?.siteId === siteId.value ? data.value.bookings : [])
watch(siteId, () => {
  if (siteId.value) refresh()
  else clear()
}, { immediate: true })
const columns: TableColumn<DriverBooking>[] = [
  { accessorKey: 'travelAt', header: 'Pickup' },
  { accessorKey: 'customer', header: 'Customer' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'pickup', header: 'From' },
  { accessorKey: 'dropoff', header: 'To' },
  { accessorKey: 'passengers', header: 'Pax' },
  { accessorKey: 'vehicleId', header: 'Vehicle' },
  { accessorKey: 'occasion', header: 'Occasion' }
]
function printSheet() {
  if (import.meta.client) window.print()
}
</script>

<template>
  <UDashboardPanel id="page-studio-driver-sheet">
    <template #header>
      <UDashboardNavbar title="Driver sheet" description="Approved and customer-confirmed trips ready for dispatch.">
        <template #right>
          <div class="flex gap-2">
            <UButton
              label="Refresh"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              :loading="pending"
              :disabled="!siteId"
              @click="() => refresh()"
            />
            <UButton
              label="Print"
              icon="i-lucide-printer"
              color="primary"
              :disabled="!siteId || pending || Boolean(error)"
              @click="printSheet"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <PageStudioBookingSitePicker audience="agency" :site-id="siteId" @update:site-id="selectSite" />
      <UAlert
        v-if="siteId && error"
        color="error"
        title="Driver sheet unavailable"
        description="Trips could not be loaded for this website. Refresh or ask your agency to check access."
      />
      <UCard v-else-if="siteId" :ui="{ body: '!p-0' }">
        <UTable :data="bookings" :columns="columns" :loading="pending">
          <template #travelAt-cell="{ row }">
            {{ row.original.travelAt ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.original.travelAt)) : '—' }}
          </template>
        </UTable>
        <p v-if="!pending && !bookings.length" class="py-10 text-center text-sm text-muted">
          No approved trips are ready for dispatch.
        </p>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
