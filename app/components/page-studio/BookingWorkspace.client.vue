<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { today, getLocalTimeZone, type DateValue } from '@internationalized/date'

interface Booking { id: string, version: number, status: string, customerName: string, pickupAt: string, pickupLocation: string, dropoffLocation: string, quoteAmountCents: number | null, currency: string | null, quoteVersion: number | null }
const { hasPermission, isReadOnly } = useAuth()
const canOperate = computed(() => hasPermission('PAGE_STUDIO_APPROVE') && !isReadOnly.value)
const { siteId, selectSite } = usePageStudioBookingSite()
const status = ref('all')
const { data, pending, error, refresh, clear } = await useFetch<{ siteId?: string, bookings: Booking[] }>('/api/agency/page-studio/bookings', {
  immediate: false, watch: false,
  query: computed(() => ({ siteId: siteId.value, status: status.value === 'all' ? undefined : status.value, limit: 100 })),
  default: () => ({ bookings: [] })
})
const bookings = computed(() => data.value?.siteId === siteId.value ? data.value.bookings : [])
const statuses = ['enquiry', 'quoted', 'approved', 'rejected', 'customer-confirmed', 'completed', 'cancelled']
const filters = [{ label: 'All statuses', value: 'all' }, ...statuses.map(value => ({ value, label: value.replaceAll('-', ' ') }))]
const columns: TableColumn<Booking>[] = [
  { accessorKey: 'customerName', header: 'Customer' }, { accessorKey: 'pickupAt', header: 'Pickup' },
  { accessorKey: 'pickupLocation', header: 'From' }, { accessorKey: 'dropoffLocation', header: 'To' },
  { accessorKey: 'quoteAmountCents', header: 'Quote' }, { accessorKey: 'status', header: 'Status' }, { id: 'actions', header: '' }
]
const date = (value: string) => new Date(value).toLocaleString()
const money = (booking: Booking) => booking.quoteAmountCents === null ? 'Not quoted' : new Intl.NumberFormat(undefined, { style: 'currency', currency: booking.currency || 'AUD' }).format(booking.quoteAmountCents / 100)
const open = ref(false)
const saving = ref(false)
const failure = ref('')
const selection = ref<{ booking: Booking, siteId: string, status: string } | null>(null)
const amount = ref(0)
const currency = ref('AUD')
const expiry = shallowRef<DateValue>(today(getLocalTimeZone()).add({ days: 7 }))
// A submitted intent is immutable until the operator closes and reopens it.
// Retrying a lost response sends the same payload and idempotency key.
const submitted = ref<Record<string, unknown> | null>(null)
const toast = useToast()
const title = computed(() => selection.value?.status === 'quoted' ? 'Set booking quote' : `${selection.value?.status === 'approved' ? 'Approve' : selection.value?.status === 'rejected' ? 'Reject' : selection.value?.status === 'completed' ? 'Complete' : 'Cancel'} booking`)
function begin(booking: Booking, nextStatus: string) {
  selection.value = { booking, siteId: siteId.value, status: nextStatus }
  amount.value = (booking.quoteAmountCents ?? 0) / 100
  currency.value = booking.currency ?? 'AUD'
  expiry.value = today(getLocalTimeZone()).add({ days: 7 })
  submitted.value = null
  failure.value = ''
  open.value = true
}
async function save() {
  const selected = selection.value
  if (!selected || saving.value || selected.siteId !== siteId.value || !canOperate.value) return
  if (!submitted.value) {
    const quote = selected.status === 'quoted'
    if (quote && (!Number.isFinite(amount.value) || amount.value < 0 || amount.value > 1_000_000 || !/^[A-Z]{3}$/.test(currency.value.toUpperCase()))) {
      failure.value = 'Enter a valid amount and three-letter currency.'
      return
    }
    submitted.value = {
      actor: 'operator', bookingId: selected.booking.id, expectedVersion: selected.booking.version,
      idempotencyKey: crypto.randomUUID(), nextStatus: selected.status,
      ...(quote ? { quote: { amountCents: Math.round(amount.value * 100), currency: currency.value.toUpperCase(), expiresAt: expiry.value.add({ days: 1 }).toDate(getLocalTimeZone()).toISOString(), version: (selected.booking.quoteVersion ?? 0) + 1 } } : {})
    }
  }
  saving.value = true
  failure.value = ''
  try {
    await $fetch(`/api/agency/page-studio/bookings/${encodeURIComponent(selected.booking.id)}/command`, { method: 'POST', query: { siteId: selected.siteId }, body: submitted.value })
    open.value = false
    toast.add({ title: 'Booking updated', color: 'success' })
    await refresh()
  } catch {
    failure.value = 'The update could not be verified. Retry the same action, or close this dialog and refresh to check the latest booking.'
  } finally { saving.value = false }
}
watch([siteId, status], () => {
  clear()
  if (siteId.value) refresh()
}, { immediate: true })
watch(siteId, () => {
  open.value = false
  selection.value = null
  submitted.value = null
})
</script>

<template>
  <UDashboardPanel id="website-bookings" class="min-h-0 min-w-0">
    <UDashboardNavbar title="Website bookings">
      <template #right>
        <UButton
          label="Refresh"
          icon="i-lucide-refresh-cw"
          variant="outline"
          color="neutral"
          :loading="pending"
          :disabled="!siteId || saving"
          @click="() => refresh()"
        />
      </template>
    </UDashboardNavbar>
    <div class="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
      <PageStudioBookingSitePicker
        audience="agency"
        :site-id="siteId"
        :disabled="saving"
        @update:site-id="selectSite"
      />
      <p class="max-w-3xl text-sm text-muted">
        Review enquiries, save quotes and record operator decisions. Vehicle reservations and customer notifications are managed separately;
        approval here records the decision only.
      </p>
      <UFormField label="Booking status" class="max-w-sm">
        <USelectMenu
          v-model="status"
          :items="filters"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <UAlert
        v-if="siteId && error"
        color="warning"
        title="Bookings could not be loaded"
        description="The website needs active booking access and a connected booking service. Refresh after setup is complete, or ask your administrator to check its connection."
      />
      <div v-else-if="siteId" class="overflow-x-auto rounded-lg border border-default">
        <UTable
          :data="bookings"
          :columns="columns"
          :loading="pending"
          empty="No bookings match this view."
        >
          <template #pickupAt-cell="{ row }">
            {{ date(row.original.pickupAt) }}
          </template>
          <template #quoteAmountCents-cell="{ row }">
            {{ money(row.original) }}
          </template>
          <template #status-cell="{ row }">
            <UBadge color="neutral" variant="subtle">
              {{ row.original.status.replaceAll('-', ' ') }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div v-if="canOperate" class="flex gap-2">
              <UButton
                v-if="['enquiry', 'quoted'].includes(row.original.status)"
                label="Quote"
                size="xs"
                variant="soft"
                @click="begin(row.original, 'quoted')"
              />
              <UButton
                v-if="row.original.status === 'quoted'"
                label="Approve"
                size="xs"
                color="success"
                variant="soft"
                @click="begin(row.original, 'approved')"
              />
              <UButton
                v-if="['enquiry', 'quoted'].includes(row.original.status)"
                label="Reject"
                size="xs"
                color="error"
                variant="ghost"
                @click="begin(row.original, 'rejected')"
              />
              <UButton
                v-if="row.original.status === 'customer-confirmed'"
                label="Complete"
                size="xs"
                color="success"
                variant="soft"
                @click="begin(row.original, 'completed')"
              />
              <UButton
                v-if="['approved', 'customer-confirmed'].includes(row.original.status)"
                label="Cancel"
                size="xs"
                color="error"
                variant="ghost"
                @click="begin(row.original, 'cancelled')"
              />
            </div>
          </template>
        </UTable>
      </div>
      <p v-if="bookings.length === 100" class="text-sm text-muted">
        Showing the latest 100 bookings. Filter by status to narrow the list.
      </p>
    </div>
    <UModal
      v-model:open="open"
      :title="title"
      :dismissible="!saving"
      description="Review this booking before saving the operator decision."
    >
      <template #body>
        <div class="@container space-y-4">
          <p class="text-sm">
            {{ selection?.booking.customerName }} — {{ selection?.booking.pickupLocation }} to {{ selection?.booking.dropoffLocation }}
          </p>
          <UAlert
            v-if="failure"
            color="error"
            title="Update not verified"
            :description="failure"
          />
          <div v-if="selection?.status === 'quoted'" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Quote amount" required>
              <UInput
                v-model.number="amount"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                :disabled="Boolean(submitted)"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Currency" required>
              <UInput
                v-model="currency"
                maxlength="3"
                :disabled="Boolean(submitted)"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Valid through" :help="`End of day in ${getLocalTimeZone()}`" class="@lg:col-span-2">
              <UPopover>
                <UButton
                  :label="expiry.toString()"
                  icon="i-lucide-calendar"
                  variant="outline"
                  color="neutral"
                  :disabled="Boolean(submitted)"
                  class="w-full"
                /><template #content>
                  <UCalendar v-model="expiry" :min-value="today(getLocalTimeZone())" class="p-2" />
                </template>
              </UPopover>
            </UFormField>
          </div>
          <p v-else class="text-sm text-muted">
            This records the booking decision. Confirm any vehicle arrangements and customer communication separately.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton
            label="Close"
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="() => { open = false }"
          /><UButton :label="submitted ? 'Retry update' : 'Save decision'" :loading="saving" @click="save" />
        </div>
      </template>
    </UModal>
  </UDashboardPanel>
</template>
