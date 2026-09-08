<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useHead({ title: 'Booking enquiries | XeroFlow' })

interface BookingAggregate { booking?: Record<string, unknown>, version?: number, id?: string, status?: string }
const { data, pending, error, refresh } = await useFetch<{ bookings: BookingAggregate[] }>('/api/portal/page-studio/bookings', { default: () => ({ bookings: [] }) })
const rows = computed(() => data.value.bookings.map((aggregate) => {
  const booking = aggregate.booking ?? aggregate as unknown as Record<string, unknown>
  const customer = booking.customer && typeof booking.customer === 'object' ? booking.customer as Record<string, unknown> : null
  const trip = booking.trip && typeof booking.trip === 'object' ? booking.trip as Record<string, unknown> : null
  return {
    id: String(booking.id ?? ''),
    status: String(booking.status ?? 'unknown'),
    pickup: String(booking.pickup ?? trip?.pickupLocation ?? '—'),
    dropoff: String(booking.dropoff ?? trip?.dropoffLocation ?? '—'),
    travelAt: typeof booking.travelAt === 'string' ? booking.travelAt : typeof trip?.pickupAt === 'string' ? trip.pickupAt : null,
    customer: String(customer?.name ?? '—')
  }
}))
const columns = [
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
        to="/portal/page-studio/bookings/new"
        label="New enquiry"
        icon="i-lucide-plus"
        color="primary"
      />
    </div>
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-shield-check"
      title="Operator-reviewed bookings"
      description="Every enquiry is checked for availability before a quote or customer confirmation is issued."
    />
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Booking enquiries unavailable"
      description="The booking service is not connected in this environment."
    />
    <UCard v-else>
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
            @click="refresh"
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
