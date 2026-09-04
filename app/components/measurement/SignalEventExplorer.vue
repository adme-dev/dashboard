<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface LineageItem {
  eventId: string
  eventName: string
  occurredAt: string
  recordedAt: string
  consentState: 'granted' | 'denied' | 'unknown'
  mappingVersion: number
  destination: { id: string, platform: 'meta' | 'google_data_manager' | 'ga4' | 'tiktok' } | null
  outcome: string
  outcomeAt: string
  receiptId: string | null
  redactedReason: string | null
}

const props = defineProps<{ clientId: string }>()
const apiFetch = $fetch as <T>(
  request: string,
  options?: { query?: Record<string, string | number> }
) => Promise<T>

const platform = ref('all')
const eventName = ref('all')
const state = ref('all')
const rows = ref<LineageItem[]>([])
const nextCursor = ref<string | null>(null)
const pending = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const selected = ref<LineageItem | null>(null)
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (open: boolean) => {
    if (!open) selected.value = null
  }
})
let requestId = 0

const columns = [
  { accessorKey: 'eventName', header: 'Event' },
  { accessorKey: 'destination', header: 'Destination' },
  { accessorKey: 'outcome', header: 'Outcome' },
  { accessorKey: 'consentState', header: 'Consent' },
  { accessorKey: 'occurredAt', header: 'Occurred' },
  { accessorKey: 'actions', header: '' }
]

const platformOptions = [
  { label: 'All destinations', value: 'all' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Meta', value: 'meta' },
  { label: 'Google Data Manager', value: 'google_data_manager' },
  { label: 'Google Analytics 4', value: 'ga4' }
]

const eventOptions = [
  { label: 'All conversion events', value: 'all' },
  { label: 'Web conversion', value: 'web_conversion' },
  { label: 'Lead created', value: 'lead_created' },
  { label: 'Lead contacted', value: 'lead_contacted' },
  { label: 'Lead qualified', value: 'lead_qualified' },
  { label: 'Lead won', value: 'lead_won' },
  { label: 'Lead lost', value: 'lead_lost' },
  { label: 'Purchase', value: 'purchase' },
  { label: 'Vehicle view', value: 'vehicle_view' },
  { label: 'Site search', value: 'site_search' },
  { label: 'Test drive booked', value: 'test_drive_booked' },
  { label: 'Phone contact', value: 'phone_contact' },
  { label: 'Phone click', value: 'phone_click' },
  { label: 'Directions click', value: 'directions_click' },
  { label: 'Add to wishlist', value: 'add_to_wishlist' },
  { label: 'Form submit', value: 'form_submit' }
]

const stateOptions = [
  { label: 'All outcomes', value: 'all' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Published', value: 'published' },
  { label: 'Retrying', value: 'retryable' },
  { label: 'Pending', value: 'pending' },
  { label: 'Claimed', value: 'claimed' },
  { label: 'Paused', value: 'paused' },
  { label: 'Policy skipped', value: 'policy_skipped' },
  { label: 'Permanent failure', value: 'permanent_failure' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' }
]

const platformLabels: Record<string, string> = {
  tiktok: 'TikTok',
  meta: 'Meta',
  google_data_manager: 'Google Data Manager',
  ga4: 'Google Analytics 4'
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function outcomeColor(value: string) {
  if (value === 'accepted' || value === 'delivered' || value === 'published') return 'success' as const
  if (value === 'pending' || value === 'claimed' || value === 'retryable' || value === 'paused') return 'warning' as const
  if (value === 'permanent_failure' || value === 'failed') return 'error' as const
  return 'neutral' as const
}

function consentColor(value: LineageItem['consentState']) {
  if (value === 'granted') return 'success' as const
  if (value === 'denied') return 'error' as const
  return 'neutral' as const
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function inspect(item: LineageItem) {
  selected.value = item
}

function errorMessage(value: unknown) {
  const candidate = value as {
    data?: { statusMessage?: string, error?: { message?: string } }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.error?.message
    || candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'Signal lineage could not be loaded'
}

function query(cursor?: string | null): Record<string, string | number> {
  return {
    limit: 50,
    ...(platform.value === 'all' ? {} : { platform: platform.value }),
    ...(eventName.value === 'all' ? {} : { eventName: eventName.value }),
    ...(state.value === 'all' ? {} : { state: state.value }),
    ...(cursor ? { cursor } : {})
  }
}

async function load(reset = true) {
  const activeRequest = ++requestId
  if (reset) {
    pending.value = true
    rows.value = []
    nextCursor.value = null
    selected.value = null
  } else {
    loadingMore.value = true
  }
  error.value = null

  try {
    const response = await apiFetch<{ items: LineageItem[], nextCursor: string | null }>(
      `/api/agency/measurement/clients/${props.clientId}/signals`,
      { query: query(reset ? null : nextCursor.value) }
    )
    if (activeRequest !== requestId) return
    rows.value = reset ? response.items : [...rows.value, ...response.items]
    nextCursor.value = response.nextCursor
  } catch (value) {
    if (activeRequest === requestId) error.value = errorMessage(value)
  } finally {
    if (activeRequest === requestId) {
      pending.value = false
      loadingMore.value = false
    }
  }
}

watch([platform, eventName, state, () => props.clientId], () => void load(), { flush: 'post' })
void load()
</script>

<template>
  <section class="@container overflow-hidden rounded-xl border border-default bg-default shadow-xs" data-testid="measurement-event-lineage">
    <header class="border-b border-default px-5 py-4 sm:px-6">
      <div class="flex flex-col gap-3 @lg:flex-row @lg:items-end @lg:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-highlighted">
              Event lineage
            </h2>
            <UBadge color="neutral" variant="outline">Redacted</UBadge>
          </div>
          <p class="mt-1 text-sm text-muted">
            Follow a canonical conversion from consent decision to provider outcome.
          </p>
        </div>
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="pending" @click="load()" />
      </div>

      <div class="mt-4 grid grid-cols-1 gap-3 @lg:grid-cols-3">
        <UFormField label="Destination">
          <USelectMenu v-model="platform" :items="platformOptions" value-key="value" label-key="label" class="w-full" />
        </UFormField>
        <UFormField label="Conversion event">
          <USelectMenu v-model="eventName" :items="eventOptions" value-key="value" label-key="label" class="w-full" />
        </UFormField>
        <UFormField label="Delivery outcome">
          <USelectMenu v-model="state" :items="stateOptions" value-key="value" label-key="label" class="w-full" />
        </UFormField>
      </div>
    </header>

    <div v-if="error" class="p-5 sm:p-6">
      <div role="alert" class="flex flex-col gap-4 rounded-lg border border-error/30 bg-error/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="font-medium text-error">Event lineage unavailable</p>
          <p class="mt-1 text-sm text-muted">{{ error }}</p>
        </div>
        <UButton label="Try again" color="neutral" variant="outline" @click="load()" />
      </div>
    </div>

    <div v-else-if="pending" class="space-y-3 p-5 sm:p-6" aria-busy="true" aria-label="Loading event lineage">
      <div v-for="index in 5" :key="index" class="h-12 animate-pulse rounded-lg bg-elevated" />
    </div>

    <div v-else-if="rows.length === 0" class="px-5 py-12 text-center sm:px-6">
      <UIcon name="i-lucide-list-filter" class="mx-auto size-7 text-dimmed" />
      <p class="mt-3 font-medium text-highlighted">No matching conversion signals</p>
      <p class="mt-1 text-sm text-muted">Try a broader filter or wait for the next confirmed conversion.</p>
    </div>

    <div v-else>
      <UTable :data="rows" :columns="columns" class="w-full">
        <template #eventName-cell="{ row }">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ titleCase(row.original.eventName) }}</p>
            <p class="mt-0.5 max-w-44 truncate font-mono text-xs text-muted">{{ row.original.eventId }}</p>
          </div>
        </template>
        <template #destination-cell="{ row }">
          <span v-if="row.original.destination" class="text-sm text-highlighted">
            {{ platformLabels[row.original.destination.platform] }}
          </span>
          <span v-else class="text-sm text-muted">Policy / outbox</span>
        </template>
        <template #outcome-cell="{ row }">
          <UBadge :color="outcomeColor(row.original.outcome)" variant="subtle">
            {{ titleCase(row.original.outcome) }}
          </UBadge>
        </template>
        <template #consentState-cell="{ row }">
          <UBadge :color="consentColor(row.original.consentState)" variant="outline">
            {{ titleCase(row.original.consentState) }}
          </UBadge>
        </template>
        <template #occurredAt-cell="{ row }">
          <span class="whitespace-nowrap text-sm text-muted">{{ formatDateTime(row.original.occurredAt) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton label="Inspect" color="neutral" variant="ghost" size="xs" @click="inspect(row.original)" />
        </template>
      </UTable>

      <div v-if="nextCursor" class="flex justify-center border-t border-default p-4">
        <UButton label="Load older signals" color="neutral" variant="outline" :loading="loadingMore" @click="load(false)" />
      </div>
    </div>

    <USlideover v-model:open="detailOpen" title="Conversion lineage" description="Redacted operational evidence for this delivery.">
      <template #body>
        <div v-if="selected" class="space-y-6 p-5">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-dimmed">Canonical event</p>
            <p class="mt-1 font-medium text-highlighted">{{ titleCase(selected.eventName) }}</p>
            <p class="mt-1 break-all font-mono text-xs text-muted">{{ selected.eventId }}</p>
          </div>
          <dl class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <div>
              <dt class="text-xs text-muted">Destination</dt>
              <dd class="mt-1 text-sm font-medium text-highlighted">{{ selected.destination ? platformLabels[selected.destination.platform] : 'Policy / outbox' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">Mapping version</dt>
              <dd class="mt-1 text-sm font-medium text-highlighted">Version {{ selected.mappingVersion }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">Consent</dt>
              <dd class="mt-1 text-sm font-medium text-highlighted">{{ titleCase(selected.consentState) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">Outcome</dt>
              <dd class="mt-1 text-sm font-medium text-highlighted">{{ titleCase(selected.outcome) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">Occurred</dt>
              <dd class="mt-1 text-sm text-highlighted">{{ formatDateTime(selected.occurredAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">Outcome observed</dt>
              <dd class="mt-1 text-sm text-highlighted">{{ formatDateTime(selected.outcomeAt) }}</dd>
            </div>
          </dl>
          <div class="rounded-lg border border-default bg-elevated/40 p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-dimmed">Provider receipt</p>
            <p class="mt-2 break-all font-mono text-sm text-highlighted">{{ selected.receiptId || 'No receipt recorded' }}</p>
          </div>
          <div v-if="selected.redactedReason" class="rounded-lg border border-warning/25 bg-warning/5 p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-warning">Redacted diagnostic</p>
            <p class="mt-2 text-sm leading-6 text-muted">{{ selected.redactedReason }}</p>
          </div>
          <p class="text-xs leading-5 text-dimmed">
            Raw click identifiers, contact details, credentials and provider payloads are intentionally excluded.
          </p>
        </div>
      </template>
    </USlideover>
  </section>
</template>
