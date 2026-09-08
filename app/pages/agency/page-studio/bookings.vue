<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'agency' })
useHead({ title: 'Booking Queue | XeroFlow Agency' })

interface Booking { id: string, version: number, status: string, customerName?: string | null, pickupAt?: string | null, pickupLocation?: string | null, dropoffLocation?: string | null, quoteAmountCents?: number | null, currency?: string | null, quoteExpiresAt?: string | null, quoteVersion?: number | null, vehicleId?: string | null }
const status = ref('all')
const { siteId, selectSite } = usePageStudioBookingSite()
const selectedSiteId = ref('')
const { data, pending, error, refresh, clear } = await useFetch<{ siteId?: string, bookings: Booking[] }>('/api/agency/page-studio/bookings', { immediate: false, watch: false, query: computed(() => ({ siteId: siteId.value, status: status.value === 'all' ? undefined : status.value })), default: () => ({ bookings: [] }) })
const bookings = computed(() => data.value?.siteId === siteId.value ? data.value.bookings : [])
watch([siteId, status], () => {
  if (siteId.value) refresh()
  else clear()
}, { immediate: true })
const columns: TableColumn<Booking>[] = [
  { accessorKey: 'customerName', header: 'Customer' },
  { accessorKey: 'pickupAt', header: 'Pickup' },
  { accessorKey: 'pickupLocation', header: 'From' },
  { accessorKey: 'dropoffLocation', header: 'To' },
  { accessorKey: 'quoteAmountCents', header: 'Quote (cents)' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' }
]
const filters = [{ label: 'All statuses', value: 'all' }, { label: 'Rejected', value: 'rejected' }, { label: 'Enquiry', value: 'enquiry' }, { label: 'Quoted', value: 'quoted' }, { label: 'Approved', value: 'approved' }, { label: 'Customer confirmed', value: 'customer-confirmed' }, { label: 'Completed', value: 'completed' }, { label: 'Cancelled', value: 'cancelled' }]
const quoteOpen = ref(false)
const quoteSaving = ref(false)
const quoteError = ref<string | null>(null)
const selectedBooking = ref<Booking | null>(null)
const quoteForm = reactive({ amountCents: 0, currency: 'AUD', expiresAt: '', nextStatus: 'quoted' })
const approvalOpen = ref(false)
const approving = ref(false)
const approvalError = ref<string | null>(null)
const decisionStatus = ref<'approved' | 'rejected' | 'completed' | 'cancelled'>('approved')
const approvalVehicleId = ref('')
function openQuote(booking: Booking) {
  selectedSiteId.value = siteId.value
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
      query: { siteId: selectedSiteId.value },
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
  selectedSiteId.value = siteId.value
  selectedBooking.value = booking
  decisionStatus.value = 'approved'
  approvalVehicleId.value = booking.vehicleId ?? ''
  approvalError.value = null
  approvalOpen.value = true
}
function openDecision(booking: Booking) {
  selectedSiteId.value = siteId.value
  selectedBooking.value = booking
  decisionStatus.value = 'rejected'
  approvalVehicleId.value = ''
  approvalError.value = null
  approvalOpen.value = true
}
function openCompletion(booking: Booking) {
  selectedSiteId.value = siteId.value
  selectedBooking.value = booking
  decisionStatus.value = 'completed'
  approvalVehicleId.value = ''
  approvalError.value = null
  approvalOpen.value = true
}
function openCancellation(booking: Booking) {
  selectedSiteId.value = siteId.value
  selectedBooking.value = booking
  decisionStatus.value = 'cancelled'
  approvalVehicleId.value = ''
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
      query: { siteId: selectedSiteId.value },
      body: {
        actor: 'operator', bookingId: booking.id, expectedVersion: booking.version,
        idempotencyKey: `${decisionStatus.value}-${booking.id}-${Date.now()}`, nextStatus: decisionStatus.value,
        ...(decisionStatus.value === 'approved' ? { vehicleId: approvalVehicleId.value.trim() || null } : {})
      }
    })
    approvalOpen.value = false
    await refresh()
  } catch (error: unknown) {
    approvalError.value = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'statusMessage' in error.data ? String(error.data.statusMessage) : 'The booking decision could not be applied. Refresh and retry if it changed.'
  } finally {
    approving.value = false
  }
}
watch(siteId, () => {
  quoteOpen.value = false
  approvalOpen.value = false
  selectedBooking.value = null
})
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Booking queue">
        <template #right>
          <UButton
            label="Driver sheet"
            icon="i-lucide-printer"
            color="neutral"
            variant="outline"
            :to="{ path: '/agency/page-studio/bookings/driver-sheet', query: { siteId } }"
          />
          <UButton
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="pending"
            :disabled="!siteId"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
      <div class="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        <PageStudioBookingSitePicker audience="agency" :site-id="siteId" @update:site-id="selectSite" />
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-calendar-check"
          title="Operator approval required"
          description="Review enquiries and quotes before any customer confirmation or vehicle hold is created."
        />
        <UFormField label="Booking status">
          <USelectMenu
            v-model="status"
            :items="filters"
            value-key="value"
            class="w-full sm:w-64"
            placeholder="Filter status"
          />
        </UFormField>
        <UAlert
          v-if="siteId && error"
          color="error"
          title="Booking service unavailable"
          description="Bookings could not be loaded for this website. Refresh or ask your agency to check access."
        />
        <UCard v-else-if="siteId">
          <UTable :data="bookings" :columns="columns" :loading="pending">
            <template #actions-cell="{ row }">
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
              <UButton
                v-if="['enquiry', 'quoted'].includes(row.original.status)"
                label="Reject"
                size="xs"
                color="error"
                variant="ghost"
                @click="openDecision(row.original)"
              />
              <UButton
                v-if="row.original.status === 'customer-confirmed'"
                label="Complete"
                size="xs"
                color="success"
                variant="soft"
                @click="openCompletion(row.original)"
              />
              <UButton
                v-if="['approved', 'customer-confirmed'].includes(row.original.status)"
                label="Cancel"
                size="xs"
                color="error"
                variant="ghost"
                @click="openCancellation(row.original)"
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
          @click="() => { quoteOpen = false }"
        /><UButton
          label="Save quote"
          color="primary"
          :loading="quoteSaving"
          @click="saveQuote"
        />
      </div>
    </template>
  </UModal>
  <UModal v-model:open="approvalOpen" :title="decisionStatus === 'approved' ? 'Approve booking' : decisionStatus === 'rejected' ? 'Reject booking' : decisionStatus === 'completed' ? 'Complete booking' : 'Cancel booking'" description="Confirm this operator decision using the current booking version.">
    <template #body>
      <UAlert
        v-if="approvalError"
        color="error"
        title="Decision failed"
        :description="approvalError"
      />
      <p class="text-sm text-muted">
        This uses the current booking version and will be rejected if another operator has changed the booking.
      </p>
      <UFormField v-if="decisionStatus === 'approved'" label="Vehicle ID" help="Assign the vehicle that should be held for this booking. Leave blank to assign it later.">
        <UInput v-model="approvalVehicleId" placeholder="e.g. limo-01" class="w-full" />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="approving"
          @click="() => { approvalOpen = false }"
        />
        <UButton
          :label="decisionStatus === 'approved' ? 'Approve booking' : decisionStatus === 'rejected' ? 'Reject booking' : decisionStatus === 'completed' ? 'Complete booking' : 'Cancel booking'"
          :color="decisionStatus === 'approved' || decisionStatus === 'completed' ? 'success' : 'error'"
          :loading="approving"
          @click="approveBooking"
        />
      </div>
    </template>
  </UModal>
</template>
