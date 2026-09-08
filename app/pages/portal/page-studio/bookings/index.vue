<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PageStudioBookingAggregate } from '~~/shared/pageStudio/bookings'

definePageMeta({ layout: 'portal' })
useHead({ title: 'Booking enquiries | XeroFlow' })

const { siteId, selectSite } = usePageStudioBookingSite()
const { data, pending, error, refresh, clear } = await useFetch<{ siteId?: string, bookings: PageStudioBookingAggregate[] }>('/api/portal/page-studio/bookings', { immediate: false, watch: false, query: { siteId }, default: () => ({ bookings: [] }) })
watch(siteId, () => {
  if (siteId.value) refresh()
  else clear()
}, { immediate: true })
const rows = computed(() => (data.value?.siteId === siteId.value ? data.value.bookings : []).map(({ booking }) => ({
  id: booking.id, status: booking.status, pickup: booking.pickup, dropoff: booking.dropoff,
  travelAt: booking.travelAt, customer: booking.customer.name
})))
type BookingRow = (typeof rows.value)[number]
const columns: TableColumn<BookingRow>[] = [
  { accessorKey: 'customer', header: 'Customer' },
  { accessorKey: 'travelAt', header: 'Pickup' },
  { accessorKey: 'pickup', header: 'From' },
  { accessorKey: 'dropoff', header: 'To' },
  { accessorKey: 'status', header: 'Status' }
]
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Bookings
        </p><h1 class="mt-2 text-2xl font-semibold text-highlighted">
          Request a trip
        </h1><p class="mt-2 text-sm leading-6 text-muted">
          Submit a booking enquiry for your agency to review.
        </p>
      </div>
      <UButton
        :to="{ path: '/portal/page-studio/bookings/new', query: { siteId } }"
        label="New enquiry"
        icon="i-lucide-plus"
        color="primary"
      />
    </div>
    <PageStudioBookingSitePicker audience="portal" :site-id="siteId" @update:site-id="selectSite" />
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-shield-check"
      title="Operator-reviewed bookings"
      description="Every enquiry is checked for availability before a quote or customer confirmation is issued."
    />
    <UAlert
      v-if="siteId && error"
      color="error"
      variant="subtle"
      title="Booking enquiries unavailable"
      description="Bookings could not be loaded for this website. Refresh or ask your agency to check access."
    />
    <UCard v-else-if="siteId">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold text-highlighted">
            Your enquiries
          </h2>
          <UButton
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="pending"
            @click="() => refresh()"
          />
        </div>
      </template>
      <UTable :data="rows" :columns="columns" :loading="pending">
        <template #travelAt-cell="{ row }">
          {{ row.original.travelAt ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.original.travelAt)) : '—' }}
        </template>
        <template #status-cell="{ row }">
          <UBadge color="info" variant="subtle">
            {{ row.original.status }}
          </UBadge>
        </template>
      </UTable>
      <p v-if="!pending && !rows.length" class="py-8 text-center text-sm text-muted">
        No enquiries have been submitted yet.
      </p>
    </UCard>
  </div>
</template>
