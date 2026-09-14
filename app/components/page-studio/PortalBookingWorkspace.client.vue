<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { CalendarDateTime, today, getLocalTimeZone, type DateValue } from '@internationalized/date'
import { PageStudioPortalBookingEnquirySchema, type PageStudioBookingAggregate, type PageStudioPortalBookingEnquiry } from '~~/shared/pageStudio/bookings'

type Booking = Omit<PageStudioBookingAggregate['booking'], 'scope'> & { version: number }
interface Workspace { siteId?: string, bookings: Booking[], canCreate: boolean }
interface Draft {
  name: string
  email: string
  phone: string
  pickup: string
  dropoff: string
  date: DateValue
  time: string
  durationMinutes: number
  passengers: number
  occasion: string
  submitted: PageStudioPortalBookingEnquiry | null
  failure: string
  conflict: boolean
  errors: Record<string, string>
}
const { siteId, selectSite } = usePageStudioBookingSite()
const timezone = getLocalTimeZone()
const status = ref('all')
const filters = [{ label: 'All statuses', value: 'all' }, ...['enquiry', 'quoted', 'approved', 'rejected', 'customer-confirmed', 'completed', 'cancelled'].map(value => ({ label: value.replaceAll('-', ' '), value }))]
const { data, pending, error, refresh, clear } = await useFetch<Workspace>('/api/portal/page-studio/bookings', {
  immediate: false, watch: false,
  query: computed(() => ({ siteId: siteId.value, status: status.value === 'all' ? undefined : status.value, limit: 100 })),
  default: () => ({ bookings: [], canCreate: false })
})
const bookings = computed(() => data.value?.siteId === siteId.value ? data.value.bookings : [])
const canCreate = computed(() => data.value?.siteId === siteId.value && data.value.canCreate && !error.value)
const columns: TableColumn<Booking>[] = [
  { accessorKey: 'customer.name', header: 'Customer' }, { accessorKey: 'travelAt', header: 'Pickup' },
  { accessorKey: 'pickup', header: 'From' }, { accessorKey: 'dropoff', header: 'To' },
  { accessorKey: 'passengers', header: 'Passengers' }, { accessorKey: 'quote', header: 'Quote' }, { accessorKey: 'status', header: 'Status' }
]
const drafts = shallowReactive<Record<string, Draft>>({})
const draft = computed(() => drafts[siteId.value])
const open = ref(false)
const savingSite = ref('')
const saving = computed(() => savingSite.value === siteId.value)
const toast = useToast()
function begin(fresh = false) {
  if (!canCreate.value || saving.value) return
  if (fresh || !drafts[siteId.value]) drafts[siteId.value] = shallowReactive<Draft>({
    name: '', email: '', phone: '', pickup: '', dropoff: '', date: today(timezone).add({ days: 1 }), time: '09:00',
    durationMinutes: 60, passengers: 1, occasion: '', submitted: null, failure: '', conflict: false, errors: {}
  })
  open.value = true
}
function fieldError(name: string) {
  return draft.value?.errors[name]
}
async function save() {
  const selectedSite = siteId.value
  const current = draft.value
  if (!current || !canCreate.value || savingSite.value || current.conflict) return
  if (!current.submitted) {
    current.errors = {}
    let travelAt = ''
    try {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(current.time)) throw new Error('Invalid time')
      const [hour, minute] = current.time.split(':').map(Number)
      travelAt = new CalendarDateTime(current.date.year, current.date.month, current.date.day, hour!, minute!).toDate(timezone, 'reject').toISOString()
    } catch {
      current.errors.time = `Choose a valid pickup date and HH:mm time in ${timezone}.`
      return
    }
    const parsed = PageStudioPortalBookingEnquirySchema.safeParse({
      requestKey: crypto.randomUUID(), customer: { name: current.name, email: current.email, phone: current.phone },
      pickup: current.pickup, dropoff: current.dropoff, travelAt, durationMinutes: Number(current.durationMinutes),
      passengers: Number(current.passengers), occasion: current.occasion
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) current.errors[issue.path.join('.')] = issue.message
      return
    }
    current.submitted = parsed.data
  }
  savingSite.value = selectedSite
  current.failure = ''
  try {
    await $fetch(`/api/portal/page-studio/bookings`, { method: 'POST', query: { siteId: selectedSite }, body: current.submitted })
    Reflect.deleteProperty(drafts, selectedSite)
    if (siteId.value === selectedSite) {
      open.value = false
      toast.add({ title: 'Enquiry saved', description: 'Your enquiry is saved. Check its current status in the bookings list; saving an enquiry does not reserve a vehicle.', color: 'success' })
      await refresh()
    }
  } catch (failure: unknown) {
    const value = failure as { data?: { data?: { error?: { code?: string } }, error?: { code?: string } }, statusCode?: number }
    current.conflict = value?.statusCode === 409 || value?.data?.data?.error?.code === 'BOOKING_REQUEST_CONFLICT' || value?.data?.error?.code === 'BOOKING_REQUEST_CONFLICT'
    current.failure = current.conflict
      ? 'This request already belongs to a different enquiry. Review existing bookings or explicitly start a separate enquiry.'
      : 'Saving could not be verified. Retry this same enquiry to check whether it was saved. Its details stay unchanged until the result is known.'
  } finally { savingSite.value = '' }
}
watch([siteId, status], () => {
  clear()
  if (siteId.value) refresh()
}, { immediate: true })
watch(siteId, () => {
  open.value = false
})
</script>

<template>
  <section class="min-w-0 space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="max-w-2xl">
        <h1 class="text-2xl font-semibold text-highlighted">
          Website bookings
        </h1>
        <p class="mt-2 text-sm text-muted">
          Record customer enquiries and follow their quotes and booking decisions. An enquiry does not reserve a vehicle.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Refresh"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="pending"
          :disabled="!siteId || Boolean(savingSite)"
          @click="() => refresh()"
        />
        <UButton
          v-if="canCreate"
          :label="draft?.submitted ? 'Resume enquiry' : 'New enquiry'"
          icon="i-lucide-plus"
          :disabled="Boolean(savingSite)"
          @click="begin()"
        />
      </div>
    </header>
    <PageStudioBookingSitePicker
      audience="portal"
      :site-id="siteId"
      :disabled="Boolean(savingSite)"
      @update:site-id="selectSite"
    />
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
      description="This website needs active booking access and a connected service. Refresh after setup, or ask your agency to check its connection."
    />
    <template v-else-if="siteId">
      <div class="overflow-x-auto rounded-lg border border-default">
        <UTable
          :data="bookings"
          :columns="columns"
          :loading="pending"
          empty="No bookings match this view."
        >
          <template #travelAt-cell="{ row }">
            {{ new Date(row.original.travelAt).toLocaleString() }}
          </template>
          <template #quote-cell="{ row }">
            {{ row.original.quote ? new Intl.NumberFormat(undefined, { style: 'currency', currency: row.original.quote.currency }).format(row.original.quote.amountCents / 100) : 'Not quoted' }}
          </template>
          <template #status-cell="{ row }">
            <UBadge color="neutral" variant="subtle">
              {{ row.original.status.replaceAll('-', ' ') }}
            </UBadge>
          </template>
        </UTable>
      </div>
      <p v-if="bookings.length === 100" class="text-sm text-muted">
        Showing the latest 100 bookings. Filter by status to narrow the list.
      </p>
      <p v-if="!pending && !canCreate" class="text-sm text-muted">
        You can view these bookings. Ask your agency for website editing access to record enquiries.
      </p>
    </template>
    <USlideover
      v-model:open="open"
      title="Customer enquiry"
      description="Save the journey details for your agency to review."
      :dismissible="!saving"
      :ui="{ content: 'sm:max-w-xl', body: 'overflow-y-auto min-h-0' }"
    >
      <template #body>
        <UForm
          v-if="draft"
          :state="draft"
          class="@container space-y-6"
          @submit="save"
        >
          <UAlert
            v-if="draft.failure"
            color="error"
            title="Enquiry not verified"
            :description="draft.failure"
          />
          <div>
            <h2 class="mb-4 font-semibold text-highlighted">
              Customer
            </h2>
            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField
                label="Customer name"
                name="name"
                :error="fieldError('customer.name')"
                required
                class="@lg:col-span-2"
              >
                <UInput
                  v-model="draft.name"
                  autocomplete="name"
                  :disabled="Boolean(draft.submitted)"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Email"
                name="email"
                :error="fieldError('customer.email')"
                required
              >
                <UInput
                  v-model="draft.email"
                  type="email"
                  autocomplete="email"
                  :disabled="Boolean(draft.submitted)"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Phone"
                name="phone"
                :error="fieldError('customer.phone')"
                required
              >
                <UInput
                  v-model="draft.phone"
                  type="tel"
                  autocomplete="tel"
                  :disabled="Boolean(draft.submitted)"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
          <div>
            <h2 class="mb-4 font-semibold text-highlighted">
              Journey
            </h2>
            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField
                label="Pickup location"
                name="pickup"
                :error="fieldError('pickup')"
                required
                class="@lg:col-span-2"
              >
                <UInput v-model="draft.pickup" :disabled="Boolean(draft.submitted)" class="w-full" />
              </UFormField>
              <UFormField
                label="Drop-off location"
                name="dropoff"
                :error="fieldError('dropoff')"
                required
                class="@lg:col-span-2"
              >
                <UInput v-model="draft.dropoff" :disabled="Boolean(draft.submitted)" class="w-full" />
              </UFormField>
              <UFormField label="Pickup date" required>
                <UPopover>
                  <UButton
                    :label="draft.date.toString()"
                    icon="i-lucide-calendar"
                    color="neutral"
                    variant="outline"
                    :disabled="Boolean(draft.submitted)"
                    class="w-full"
                  /><template #content>
                    <UCalendar v-model="draft.date" :min-value="today(timezone)" class="p-2" />
                  </template>
                </UPopover>
              </UFormField>
              <UFormField
                label="Pickup time"
                name="time"
                :help="`24-hour time in ${timezone}`"
                :error="fieldError('time')"
                required
              >
                <UInput
                  v-model="draft.time"
                  placeholder="09:00"
                  maxlength="5"
                  :disabled="Boolean(draft.submitted)"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Hire duration (minutes)"
                name="durationMinutes"
                :error="fieldError('durationMinutes')"
                required
              >
                <UInput
                  v-model.number="draft.durationMinutes"
                  type="number"
                  min="1"
                  max="2880"
                  :disabled="Boolean(draft.submitted)"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Passengers"
                name="passengers"
                :error="fieldError('passengers')"
                required
              >
                <UInput
                  v-model.number="draft.passengers"
                  type="number"
                  min="1"
                  max="500"
                  :disabled="Boolean(draft.submitted)"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Occasion"
                name="occasion"
                :error="fieldError('occasion')"
                class="@lg:col-span-2"
              >
                <UInput
                  v-model="draft.occasion"
                  placeholder="Optional, for example an airport transfer"
                  maxlength="160"
                  :disabled="Boolean(draft.submitted)"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-3">
          <UButton
            label="Close"
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="() => { open = false }"
          />
          <UButton
            v-if="draft?.conflict"
            label="Start separate enquiry"
            color="neutral"
            variant="outline"
            :disabled="!canCreate || saving"
            @click="begin(true)"
          />
          <UButton
            v-else
            :label="draft?.submitted ? 'Retry same enquiry' : 'Save enquiry'"
            :loading="saving"
            :disabled="!canCreate || Boolean(savingSite)"
            @click="save"
          />
        </div>
      </template>
    </USlideover>
  </section>
</template>
