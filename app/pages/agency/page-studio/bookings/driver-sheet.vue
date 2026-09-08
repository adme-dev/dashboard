<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Driver sheet | Page Studio' })

interface DriverBooking { id: string, customer: string, phone: string, passengers: number, pickup: string, dropoff: string, travelAt: string | null, durationMinutes: number, vehicleId: string, occasion: string }
const { data, pending, error, refresh } = await useFetch<{ bookings: DriverBooking[] }>('/api/agency/page-studio/bookings/driver-sheet', { default: () => ({ bookings: [] }) })
const columns = [
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
              @click="refresh"
            />
            <UButton
              label="Print"
              icon="i-lucide-printer"
              color="primary"
              @click="printSheet"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        title="Driver sheet unavailable"
        description="The private booking Worker binding is not configured for this environment."
      />
      <UCard v-else :ui="{ body: '!p-0' }">
        <UTable :data="data.bookings" :columns="columns" :loading="pending">
          <template #travelAt-cell="{ row }">
            {{ row.original.travelAt ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.original.travelAt)) : '—' }}
          </template>
        </UTable>
        <p v-if="!pending && !data.bookings.length" class="py-10 text-center text-sm text-muted">
          No approved trips are ready for dispatch.
        </p>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
