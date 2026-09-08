<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Booking Queue | XeroFlow Agency' })

interface Booking { id: string, version: number, status: string, customerName?: string | null, pickupAt?: string | null, pickupLocation?: string | null, dropoffLocation?: string | null, quoteAmountCents?: number | null, currency?: string | null, quoteExpiresAt?: string | null, quoteVersion?: number | null }
const status = ref('all')
const { data, pending, error, refresh } = await useFetch<{ bookings: Booking[] }>('/api/agency/page-studio/bookings', { query: computed(() => ({ status: status.value === 'all' ? undefined : status.value })), default: () => ({ bookings: [] }) })
const columns = [
  { accessorKey: 'customerName', header: 'Customer' },
  { accessorKey: 'pickupAt', header: 'Pickup' },
  { accessorKey: 'pickupLocation', header: 'From' },
  { accessorKey: 'dropoffLocation', header: 'To' },
  { accessorKey: 'quoteAmountCents', header: 'Quote (cents)' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' }
]
const filters = [{ label: 'All statuses', value: 'all' }, { label: 'Enquiry', value: 'enquiry' }, { label: 'Quoted', value: 'quoted' }, { label: 'Approved', value: 'approved' }]
const quoteOpen = ref(false)
const quoteSaving = ref(false)
const quoteError = ref<string | null>(null)
const selectedBooking = ref<Booking | null>(null)
const quoteForm = reactive({ amountCents: 0, currency: 'AUD', expiresAt: '', nextStatus: 'quoted' })
const approvalOpen = ref(false)
const approving = ref(false)
const approvalError = ref<string | null>(null)
function openQuote(booking: Booking) {
  selectedBooking.value = booking
  quoteForm.amountCents = booking.quoteAmountCents ?? 0
  quoteForm.currency = booking.currency ?? 'AUD'
  quoteForm.expiresAt = booking.quoteExpiresAt ?? new Date(Date.now() + 86400000).toISOString()
  quoteForm.nextStatus = 'quoted'
  quoteError.value = null
  quoteOpen.value = true
}
async function saveQuote() {
  const booking = selectedBooking.value
  if (!booking) return
  quoteSaving.value = true
  quoteError.value = null
  try {
    await $fetch(`/api/agency/page-studio/bookings/${encodeURIComponent(booking.id)}/command`, {
      method: 'POST',
      body: {
        actor: 'operator', bookingId: booking.id, expectedVersion: booking.version,
        idempotencyKey: `quote-${booking.id}-${Date.now()}`, nextStatus: quoteForm.nextStatus,
        quote: { amountCents: quoteForm.amountCents, currency: quoteForm.currency.toUpperCase(), expiresAt: quoteForm.expiresAt, version: (booking.quoteVersion ?? 0) + 1 }
      }
    })
    quoteOpen.value = false
    await refresh()
  } catch (error: unknown) {
    quoteError.value = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'statusMessage' in error.data ? String(error.data.statusMessage) : 'The quote could not be saved. Refresh and retry if the booking changed.'
  } finally {
    quoteSaving.value = false
  }
}
function openApproval(booking: Booking) {
  selectedBooking.value = booking
  approvalError.value = null
  approvalOpen.value = true
}
async function approveBooking() {
  const booking = selectedBooking.value
  if (!booking) return
  approving.value = true
  approvalError.value = null
  try {
    await $fetch(`/api/agency/page-studio/bookings/${encodeURIComponent(booking.id)}/command`, {
      method: 'POST',
      body: { actor: 'operator', bookingId: booking.id, expectedVersion: booking.version, idempotencyKey: `approve-${booking.id}-${Date.now()}`, nextStatus: 'approved' }
    })
    approvalOpen.value = false
    await refresh()
  } catch (error: unknown) {
    approvalError.value = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'statusMessage' in error.data ? String(error.data.statusMessage) : 'The booking could not be approved. Refresh and retry if it changed.'
  } finally {
    approving.value = false
  }
}
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
          <UTable :data="data.bookings" :columns="columns" :loading="pending">
            <template #actions-data="{ row }">
              <UButton
                v-if="['enquiry', 'quoted'].includes(row.original.status)"
                label="Quote"
                size="xs"
                color="primary"
                variant="soft"
                @click="openQuote(row.original)"
              />
              <UButton
                v-if="row.original.status === 'quoted'"
                label="Approve"
                size="xs"
                color="success"
                variant="soft"
                @click="openApproval(row.original)"
              />
            </template>
          </UTable>
        </UCard>
      </div>
    </UDashboardPanel>
  </div>
  <UModal v-model:open="quoteOpen" title="Set booking quote" description="Save a versioned quote before approving the booking.">
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="quoteError"
          color="error"
          title="Quote could not be saved"
          :description="quoteError"
        />
        <UFormField label="Amount in cents" required>
          <UInput
            v-model.number="quoteForm.amountCents"
            type="number"
            min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Currency" required>
          <UInput v-model="quoteForm.currency" maxlength="3" class="w-full" />
        </UFormField>
        <UFormField label="Expires at" help="Use an ISO 8601 timestamp." required>
          <UInput v-model="quoteForm.expiresAt" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="quoteSaving"
          @click="quoteOpen = false"
        /><UButton
          label="Save quote"
          color="primary"
          :loading="quoteSaving"
          @click="saveQuote"
        />
      </div>
    </template>
  </UModal>
  <UModal v-model:open="approvalOpen" title="Approve booking" description="Confirm that the current quote and trip details are ready for customer confirmation.">
    <template #body>
      <UAlert
        v-if="approvalError"
        color="error"
        title="Approval failed"
        :description="approvalError"
      />
      <p class="text-sm text-muted">
        This uses the current booking version and will be rejected if another operator has changed the booking.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="approving"
          @click="approvalOpen = false"
        />
        <UButton
          label="Approve booking"
          color="success"
          :loading="approving"
          @click="approveBooking"
        />
      </div>
    </template>
  </UModal>
</template>
