<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  ClientFinancialsResponse,
  ClientProjectFinancialRow,
  FinancialAllocationMutation,
  FinancialAllocationSource,
  FinancialAllocatableSourceType,
} from '~/types'

const props = defineProps<{
  open: boolean
  clientId: string
  projects: ClientProjectFinancialRow[]
  sources: FinancialAllocationSource[]
  tracking: ClientFinancialsResponse['tracking']
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'allocated': []
}>()

type SourceFilter = 'all' | FinancialAllocatableSourceType

const UNASSIGNED = '__unassigned__'
const SELECT_TRACKING = '__select__'

const toast = useToast()
const search = ref('')
const sourceFilter = ref<SourceFilter>('all')
const sourceSelections = ref<Record<string, string>>({})
const authoritativeSourceSelections = ref<Record<string, string>>({})
const pendingSourceKeys = ref<Record<string, boolean>>({})
const sourceRequestVersions = ref<Record<string, number>>({})
const selectedTrackingOptionId = ref<string>(SELECT_TRACKING)
const confirmedTrackingOption = ref<{ id: string; name: string } | null>(null)
const trackingPending = ref(false)

const currency = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const filterOptions: Array<{ label: string; value: SourceFilter }> = [
  { label: 'All sources', value: 'all' },
  { label: 'Media spend', value: 'media_spend' },
  { label: 'Xero revenue', value: 'xero_revenue' },
  { label: 'Xero costs', value: 'xero_cost' },
]

const projectOptions = computed(() => [
  { label: 'Unassigned', value: UNASSIGNED },
  ...props.projects
    .filter(project => Boolean(project.projectId))
    .map(project => ({ label: project.projectName, value: project.projectId })),
])

const trackingOptions = computed(() => [
  { label: 'Select an active Client option', value: SELECT_TRACKING },
  ...(props.tracking?.options ?? [])
    .filter(option => option.isActive && typeof option.id === 'string' && option.id.trim().length > 0)
    .map(option => ({ label: option.name, value: option.id! })),
])

const hasActiveTrackingOptions = computed(() => (
  trackingOptions.value.some(option => option.value !== SELECT_TRACKING)
))

const confirmedClientTracking = computed(() => {
  const selected = props.tracking?.selected
  if (selected?.id && selected.isActive) return { id: selected.id, name: selected.name }
  return confirmedTrackingOption.value
})

const needsTrackingConfirmation = computed(() => !confirmedClientTracking.value)

const visibleSources = computed(() => {
  const normalizedSearch = search.value.trim().toLocaleLowerCase()
  return (props.sources ?? []).filter((source) => {
    if (sourceFilter.value !== 'all' && source.sourceType !== sourceFilter.value) return false
    if (!normalizedSearch) return true
    const amountTerms = Number.isFinite(source.amount)
      ? [formatAmount(source.amount), String(source.amount)]
      : [formatAmount(source.amount)]
    return [source.label, source.description, source.platformVendor, ...amountTerms]
      .filter((value): value is string => Boolean(value))
      .some(value => value.toLocaleLowerCase().includes(normalizedSearch))
  })
})

const sections: Array<{ sourceType: FinancialAllocatableSourceType; title: string; description: string }> = [
  {
    sourceType: 'media_spend',
    title: 'Unallocated Media',
    description: 'Assign agency-paid campaign spend to the project it supports.',
  },
  {
    sourceType: 'xero_revenue',
    title: 'Xero Revenue',
    description: 'Assign eligible ACCREC line items to a client project.',
  },
  {
    sourceType: 'xero_cost',
    title: 'Xero Costs',
    description: 'Assign direct ACCPAY costs only after the Client tracking mapping is confirmed.',
  },
]

watch(
  () => props.sources,
  (sources) => {
    authoritativeSourceSelections.value = Object.fromEntries((sources ?? []).map(source => [
      sourceKey(source),
      source.projectId ?? UNASSIGNED,
    ]))
    sourceSelections.value = Object.fromEntries((sources ?? []).map((source) => {
      const key = sourceKey(source)
      const pendingSelection = sourceSelections.value[key]
      return [
        key,
        pendingSourceKeys.value[key] && pendingSelection !== undefined
          ? pendingSelection
          : source.projectId ?? UNASSIGNED,
      ]
    }))
  },
  { immediate: true },
)

watch(
  () => props.tracking?.selected,
  (selected) => {
    selectedTrackingOptionId.value = selected?.id && selected.isActive ? selected.id : SELECT_TRACKING
    confirmedTrackingOption.value = null
  },
  { immediate: true },
)

function sourceKey(source: FinancialAllocationSource): string {
  return `${source.sourceType}:${source.sourceId}`
}

function sourceRows(sourceType: FinancialAllocatableSourceType): FinancialAllocationSource[] {
  return visibleSources.value.filter(source => source.sourceType === sourceType)
}

function sourceTypeLabel(sourceType: FinancialAllocatableSourceType): string {
  if (sourceType === 'media_spend') return 'Media spend'
  if (sourceType === 'xero_revenue') return 'Xero revenue'
  return 'Xero cost'
}

function selectionFor(source: FinancialAllocationSource): string {
  return sourceSelections.value[sourceKey(source)] ?? source.projectId ?? UNASSIGNED
}

function formatAmount(amount: number): string {
  return Number.isFinite(amount) ? currency.format(amount) : 'Amount unavailable'
}

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : dateFormatter.format(date)
}

function errorMessage(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: unknown }
    statusMessage?: unknown
  } | null
  const statusMessage = candidate?.data?.statusMessage ?? candidate?.statusMessage
  return typeof statusMessage === 'string' && statusMessage.trim()
    ? statusMessage
    : 'The server could not update this financial allocation'
}

function mutationFor(source: FinancialAllocationSource, projectId: string | null): FinancialAllocationMutation {
  if (source.sourceType === 'media_spend') {
    return { sourceType: 'media_spend', sourceId: source.sourceId, projectId }
  }
  return { sourceType: 'xero_line', sourceId: source.sourceId, projectId }
}

function canAllocateSource(source: FinancialAllocationSource): boolean {
  return source.sourceType !== 'xero_cost' || Boolean(confirmedClientTracking.value)
}

async function updateSourceAllocation(source: FinancialAllocationSource, nextSelection: string) {
  const key = sourceKey(source)
  if (pendingSourceKeys.value[key] || !canAllocateSource(source)) return
  if (nextSelection !== UNASSIGNED && !projectOptions.value.some(option => option.value === nextSelection)) return
  if (nextSelection === selectionFor(source)) return

  const requestVersion = (sourceRequestVersions.value[key] ?? 0) + 1
  sourceRequestVersions.value = { ...sourceRequestVersions.value, [key]: requestVersion }
  sourceSelections.value = { ...sourceSelections.value, [key]: nextSelection }
  pendingSourceKeys.value = { ...pendingSourceKeys.value, [key]: true }

  try {
    await $fetch(`/api/agency/clients/${props.clientId}/financial-allocations`, {
      method: 'PATCH',
      body: mutationFor(source, nextSelection === UNASSIGNED ? null : nextSelection),
    })
    toast.add({
      title: 'Financial allocation updated',
      description: 'The financial view will refresh with the confirmed assignment.',
      color: 'success',
    })
    emit('allocated')
  } catch (error: unknown) {
    if (sourceRequestVersions.value[key] === requestVersion) {
      sourceSelections.value = {
        ...sourceSelections.value,
        [key]: authoritativeSourceSelections.value[key] ?? source.projectId ?? UNASSIGNED,
      }
    }
    toast.add({
      title: 'Could not update financial allocation',
      description: errorMessage(error),
      color: 'error',
    })
  } finally {
    if (sourceRequestVersions.value[key] === requestVersion) {
      pendingSourceKeys.value = { ...pendingSourceKeys.value, [key]: false }
    }
  }
}

async function confirmClientTracking() {
  const selected = trackingOptions.value.find(option => option.value === selectedTrackingOptionId.value)
  if (!selected || selected.value === SELECT_TRACKING || trackingPending.value) return

  trackingPending.value = true
  try {
    await $fetch(`/api/agency/clients/${props.clientId}/financial-allocations`, {
      method: 'PATCH',
      body: {
        sourceType: 'client_tracking',
        trackingOptionId: selected.value,
        trackingOptionName: selected.label,
      } satisfies FinancialAllocationMutation,
    })
    confirmedTrackingOption.value = { id: selected.value, name: selected.label }
    toast.add({
      title: 'Client tracking confirmed',
      description: 'Xero direct costs can now be allocated to this client’s projects.',
      color: 'success',
    })
    emit('allocated')
  } catch (error: unknown) {
    toast.add({
      title: 'Could not confirm Client tracking',
      description: errorMessage(error),
      color: 'error',
    })
  } finally {
    trackingPending.value = false
  }
}
</script>

<template>
  <USlideover
    :open="open"
    title="Allocate client financial sources"
    description="Map media and eligible Xero sources to one client project at a time."
    :ui="{ content: 'w-full max-w-xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="@container flex min-h-0 flex-1 flex-col gap-5 p-4 sm:p-6">
      <div class="space-y-1">
        <p class="text-sm font-medium text-highlighted">Project allocation</p>
        <p class="text-sm leading-5 text-muted">
          Assignments are saved one source at a time. Totals refresh only after the server confirms each change.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-4">
        <UFormField label="Search financial sources">
          <UInput
            v-model="search"
            type="search"
            placeholder="Search campaign, invoice, vendor, or amount"
            class="w-full"
            data-testid="financial-allocation-search"
          />
        </UFormField>
        <UFormField label="Source type">
          <USelectMenu
            v-model="sourceFilter"
            :items="filterOptions"
            value-key="value"
            class="w-full"
            data-testid="financial-allocation-filter"
          />
        </UFormField>
      </div>

      <section v-if="needsTrackingConfirmation" aria-labelledby="client-tracking-heading" class="space-y-3 border-y border-default py-4">
        <div class="space-y-1">
          <h2 id="client-tracking-heading" class="text-sm font-semibold text-highlighted">Confirm Client tracking</h2>
          <p class="text-sm leading-5 text-muted">
            Xero direct costs remain unavailable until an active tenant-owned Client option is explicitly confirmed.
          </p>
        </div>
        <UAlert
          v-if="hasActiveTrackingOptions"
          title="Client tracking is required for Xero costs"
          description="Choose the Client option that represents this agency client, then confirm it before allocating ACCPAY lines."
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
        />
        <UAlert
          v-else
          title="No active Client tracking options"
          description="An Xero administrator needs to add or activate a Client tracking option for the selected tenant, then refresh this view."
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
        />
        <template v-if="hasActiveTrackingOptions">
          <UFormField label="Client tracking option">
            <USelectMenu
              v-model="selectedTrackingOptionId"
              :items="trackingOptions"
              value-key="value"
              :disabled="trackingPending"
              class="w-full"
              data-testid="client-tracking-select"
            />
          </UFormField>
          <div class="flex justify-end">
            <UButton
              label="Confirm Client mapping"
              color="primary"
              :loading="trackingPending"
              :disabled="selectedTrackingOptionId === SELECT_TRACKING || trackingPending"
              data-testid="confirm-client-tracking"
              @click="confirmClientTracking"
            />
          </div>
        </template>
      </section>

      <div v-else class="flex items-center gap-2 rounded-lg border border-default bg-elevated/50 px-3 py-2 text-sm">
        <UIcon name="i-lucide-badge-check" class="size-4 shrink-0 text-success" aria-hidden="true" />
        <span class="text-muted">Confirmed Client tracking</span>
        <UBadge color="success" variant="subtle">{{ confirmedClientTracking?.name }}</UBadge>
      </div>

      <UAlert
        v-if="visibleSources.length === 0"
        title="No matching financial sources"
        description="Adjust the search or source type to review the sources supplied for this reporting period."
        color="neutral"
        variant="subtle"
        icon="i-lucide-search-x"
      />

      <div v-else class="space-y-6 pb-2">
        <section
          v-for="section in sections"
          v-show="sourceRows(section.sourceType).length"
          :key="section.sourceType"
          :aria-labelledby="`${section.sourceType}-heading`"
          class="space-y-3"
        >
          <div class="space-y-1">
            <h2 :id="`${section.sourceType}-heading`" class="text-sm font-semibold text-highlighted">{{ section.title }}</h2>
            <p class="text-sm leading-5 text-muted">{{ section.description }}</p>
          </div>

          <article
            v-for="source in sourceRows(section.sourceType)"
            :key="sourceKey(source)"
            :data-testid="`source-row-${source.sourceId}`"
            class="space-y-4 rounded-lg border border-default bg-default p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <p class="break-words font-medium text-highlighted">{{ source.label }}</p>
                <p v-if="source.description" class="break-words text-sm leading-5 text-muted">{{ source.description }}</p>
              </div>
              <p class="shrink-0 text-sm font-semibold tabular-nums text-highlighted">{{ formatAmount(source.amount) }}</p>
            </div>

            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
              <UBadge color="neutral" variant="subtle">{{ sourceTypeLabel(source.sourceType) }}</UBadge>
              <span>{{ formatDate(source.date) }}</span>
              <span v-if="source.platformVendor">{{ source.platformVendor }}</span>
              <UBadge v-if="source.isStale" color="warning" variant="subtle">Stale source</UBadge>
            </div>

            <div class="flex items-center gap-1.5 text-sm text-muted">
              <UIcon name="i-lucide-folder-kanban" class="size-4 shrink-0" aria-hidden="true" />
              <span>Current project: {{ source.projectName || 'Unallocated' }}</span>
            </div>

            <UAlert
              v-if="source.sourceType === 'xero_cost' && !confirmedClientTracking"
              title="Confirm Client tracking first"
              description="This Xero cost cannot be allocated until the Client option above is confirmed."
              color="warning"
              variant="subtle"
              icon="i-lucide-lock-keyhole"
            />

            <UFormField :label="`Project for ${source.label}`">
              <USelectMenu
                :model-value="selectionFor(source)"
                :items="projectOptions"
                value-key="value"
                class="w-full"
                :disabled="Boolean(pendingSourceKeys[sourceKey(source)]) || !canAllocateSource(source)"
                :data-testid="`project-select-${source.sourceId}`"
                @update:model-value="updateSourceAllocation(source, $event)"
              />
            </UFormField>
          </article>
        </section>
      </div>
      </div>
    </template>
  </USlideover>
</template>
