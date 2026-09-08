<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Booking Queue | XeroFlow Agency' })

interface Booking { id: string, status: string, customerName?: string, pickupAt?: string, pickupLocation?: string, dropoffLocation?: string }
const status = ref('all')
const { data, pending, error, refresh } = await useFetch<{ bookings: Booking[] }>('/api/agency/page-studio/bookings', { query: computed(() => ({ status: status.value === 'all' ? undefined : status.value })), default: () => ({ bookings: [] }) })
const columns = [
  { accessorKey: 'customerName', header: 'Customer' },
  { accessorKey: 'pickupAt', header: 'Pickup' },
  { accessorKey: 'pickupLocation', header: 'From' },
  { accessorKey: 'dropoffLocation', header: 'To' },
  { accessorKey: 'status', header: 'Status' }
]
const filters = [{ label: 'All statuses', value: 'all' }, { label: 'Enquiry', value: 'enquiry' }, { label: 'Quoted', value: 'quoted' }, { label: 'Approved', value: 'approved' }]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Booking queue">
        <template #right>
          <UButton
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="pending"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
      <div class="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-calendar-check"
          title="Operator approval required"
          description="Review enquiries and quotes before any customer confirmation or vehicle hold is created."
        />
        <USelectMenu
          v-model="status"
          :items="filters"
          value-key="value"
          class="w-full sm:w-64"
          placeholder="Filter status"
        />
        <UAlert
          v-if="error"
          color="error"
          title="Booking service unavailable"
          description="The private booking Worker binding is not configured for this environment."
        />
        <UCard v-else>
          <UTable :data="data.bookings" :columns="columns" :loading="pending" />
        </UCard>
      </div>
    </UDashboardPanel>
  </div>
</template>
