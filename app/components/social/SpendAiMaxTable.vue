<script setup lang="ts">
import type { GoogleAiMaxCampaignListItem } from '~/types'
import {
  aiMaxMigrationReasonLabel,
  aiMaxReadinessLabel,
  aiMaxReadinessTone,
  aiMaxRiskLabel,
  aiMaxSearchMatchingLabel,
  aiMaxToggleLabel,
} from '~/utils/googleAiMax'

type FilterState = {
  search: string
  status: string
  migrationReason: string
  stale: string
  campaignStatus: string
  connectionId: string
  clientId: string
}

const props = defineProps<{
  items: GoogleAiMaxCampaignListItem[]
  loading: boolean
  page: number
  pageSize: number
  total: number
  filters: FilterState
  connectionOptions: Array<{ label: string; value: string }>
  clientOptions: Array<{ label: string; value: string }>
}>()

const emit = defineEmits<{
  updateFilter: [key: keyof FilterState, value: string]
  updatePage: [page: number]
  openCampaign: [id: string]
  clearFilters: []
}>()

const statusOptions = [
  { label: 'All readiness states', value: 'all' },
  { label: 'AI Max ready', value: 'ready' },
  { label: 'Upgrade scheduled', value: 'scheduled_upgrade' },
  { label: 'Needs review', value: 'needs_review' },
  { label: 'Not affected', value: 'not_affected' },
  { label: 'Unknown', value: 'unknown' },
]
const migrationOptions = [
  { label: 'All migration triggers', value: 'all' },
  { label: 'Automatically created assets', value: 'aca' },
  { label: 'Campaign broad match', value: 'campaign_broad_match' },
  { label: 'Both legacy settings', value: 'aca_and_campaign_broad_match' },
  { label: 'No legacy trigger', value: 'none' },
  { label: 'Unknown evidence', value: 'unknown' },
]
const staleOptions = [
  { label: 'Any freshness', value: 'all' },
  { label: 'Fresh · under 26h', value: 'fresh' },
  { label: 'Warning · 26–72h', value: 'warning' },
  { label: 'Critical · over 72h', value: 'critical' },
]
const campaignStatusOptions = [
  { label: 'All campaign states', value: 'all' },
  { label: 'Enabled', value: 'ENABLED' },
  { label: 'Paused', value: 'PAUSED' },
]

const columns = [
  { accessorKey: 'client', header: 'Client / account' },
  { accessorKey: 'campaignName', header: 'Campaign' },
  { accessorKey: 'readinessStatus', header: 'Readiness' },
  { accessorKey: 'migrationReason', header: 'Migration trigger' },
  { id: 'controls', header: 'Effective controls' },
  { accessorKey: 'risks', header: 'Control risks' },
  { accessorKey: 'lastObservedAt', header: 'Last scanned' },
]

function formatTime(value: string | null) {
  if (!value) return 'Not scanned'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <section class="@container overflow-hidden rounded-xl border border-default bg-default">
    <div class="border-b border-default px-4 py-4">
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-4 @5xl:grid-cols-7">
        <UFormField label="Search" class="@lg:col-span-2 @3xl:col-span-2">
          <UInput
            :model-value="filters.search"
            class="w-full"
            icon="i-lucide-search"
            placeholder="Campaign, client or Google account"
            @update:model-value="emit('updateFilter', 'search', String($event))"
          />
        </UFormField>
        <UFormField label="Readiness">
          <USelect
            :model-value="filters.status"
            :items="statusOptions"
            class="w-full"
            @update:model-value="emit('updateFilter', 'status', String($event))"
          />
        </UFormField>
        <UFormField label="Migration trigger">
          <USelect
            :model-value="filters.migrationReason"
            :items="migrationOptions"
            class="w-full"
            @update:model-value="emit('updateFilter', 'migrationReason', String($event))"
          />
        </UFormField>
        <UFormField label="Freshness">
          <USelect
            :model-value="filters.stale"
            :items="staleOptions"
            class="w-full"
            @update:model-value="emit('updateFilter', 'stale', String($event))"
          />
        </UFormField>
        <UFormField label="Google account">
          <USelect
            :model-value="filters.connectionId"
            :items="connectionOptions"
            class="w-full"
            @update:model-value="emit('updateFilter', 'connectionId', String($event))"
          />
        </UFormField>
        <UFormField label="Client">
          <USelect
            :model-value="filters.clientId"
            :items="clientOptions"
            class="w-full"
            @update:model-value="emit('updateFilter', 'clientId', String($event))"
          />
        </UFormField>
      </div>
      <div class="mt-3 flex items-center justify-between gap-3">
        <p class="text-xs text-muted">
          {{ total }} campaign{{ total === 1 ? '' : 's' }} in this review
        </p>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-filter-x"
          @click="emit('clearFilters')"
        >
          Clear filters
        </UButton>
      </div>
    </div>

    <div v-if="!loading && items.length === 0" class="px-6 py-14 text-center" role="status">
      <UIcon name="i-lucide-list-filter" class="mx-auto size-8 text-muted" />
      <h3 class="mt-3 text-sm font-semibold">No campaigns match this review</h3>
      <p class="mx-auto mt-1 max-w-md text-xs text-muted">
        Clear filters to see every observed Search campaign, or run a scan if this workspace has not been checked yet.
      </p>
      <UButton class="mt-4" size="sm" variant="soft" @click="emit('clearFilters')">
        Clear filters
      </UButton>
    </div>

    <UTable v-else :data="items" :columns="columns" :loading="loading" class="max-h-[640px]">
      <template #client-cell="{ row }">
        <div class="min-w-36">
          <p class="text-sm font-medium">{{ row.original.client?.name || 'Unmapped client' }}</p>
          <p class="text-xs text-muted">{{ row.original.accountName || row.original.customerId }}</p>
        </div>
      </template>
      <template #campaignName-cell="{ row }">
        <UButton variant="link" color="neutral" class="h-auto justify-start p-0 text-left" @click="emit('openCampaign', row.original.id)">
          {{ row.original.campaignName }}
        </UButton>
        <p class="mt-0.5 text-[11px] text-muted">{{ row.original.campaignStatus }}</p>
      </template>
      <template #readinessStatus-cell="{ row }">
        <UBadge :color="aiMaxReadinessTone(row.original.readinessStatus)" variant="soft" size="xs">
          {{ aiMaxReadinessLabel(row.original.readinessStatus) }}
        </UBadge>
      </template>
      <template #migrationReason-cell="{ row }">
        <span class="max-w-48 text-xs">{{ aiMaxMigrationReasonLabel(row.original.migrationReason) }}</span>
      </template>
      <template #controls-cell="{ row }">
        <div class="space-y-0.5 text-[11px] text-muted">
          <p>Matching · {{ aiMaxSearchMatchingLabel(row.original.effectiveSettings.searchTermMatching) }}</p>
          <p>Text · {{ aiMaxToggleLabel(row.original.effectiveSettings.textCustomisation) }}</p>
          <p>URL · {{ aiMaxToggleLabel(row.original.effectiveSettings.finalUrlExpansion) }}</p>
        </div>
      </template>
      <template #risks-cell="{ row }">
        <div v-if="row.original.risks.length" class="flex max-w-52 flex-wrap gap-1">
          <UBadge v-for="risk in row.original.risks.slice(0, 2)" :key="risk" color="warning" variant="subtle" size="xs">
            {{ aiMaxRiskLabel(risk) }}
          </UBadge>
          <UBadge v-if="row.original.risks.length > 2" color="neutral" variant="subtle" size="xs">
            +{{ row.original.risks.length - 2 }}
          </UBadge>
        </div>
        <span v-else class="text-xs text-muted">No flags</span>
      </template>
      <template #lastObservedAt-cell="{ row }">
        <div class="text-xs">
          <p>{{ formatTime(row.original.lastObservedAt) }}</p>
          <p class="capitalize text-muted">{{ row.original.freshness }}</p>
        </div>
      </template>
    </UTable>

    <div v-if="total > pageSize" class="flex justify-end border-t border-default px-4 py-3">
      <UPagination
        :page="page"
        :total="total"
        :items-per-page="pageSize"
        @update:page="emit('updatePage', Number($event))"
      />
    </div>
  </section>
</template>
