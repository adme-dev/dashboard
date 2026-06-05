<!-- app/components/email/SubscribersPanel.vue -->
<script setup lang="ts">
interface SubRow {
  id: string
  email: string
  name: string | null
  status: string
  created_at: string
  soft_bounce_count?: number | null
  last_soft_bounce_at?: string | null
  suppression_reason?: string | null
  suppressed_at?: string | null
}

const listFilter = ref<string>('all')
const search = ref('')
const page = ref(1)

const { data: listsData } = await useFetch<{ items: { id: string, name: string }[] }>('/api/email/lists', {
  default: () => ({ items: [] })
})
const lists = computed(() => listsData.value?.items ?? [])

const listFilterOptions = computed(() => [
  { value: 'all', label: 'All lists' },
  ...lists.value.map(l => ({ value: l.id, label: l.name }))
])

const query = computed(() => ({
  list_id: listFilter.value === 'all' ? undefined : listFilter.value,
  q: search.value || undefined,
  page: page.value,
  page_size: 50
}))
const { data, refresh, pending } = await useFetch<{ items: SubRow[], total: number }>(
  '/api/email/subscribers',
  { query, default: () => ({ items: [], total: 0 }) }
)

const showAdd = ref(false)
const showImport = ref(false)
const showDetail = ref(false)
const selectedSubscriberId = ref<string | null>(null)

function openDetails(row: SubRow) {
  selectedSubscriberId.value = row.id
  showDetail.value = true
}

function statusColor(status: string): 'success' | 'error' | 'neutral' {
  if (status === 'enabled') return 'success'
  if (status === 'blocklisted') return 'error'
  return 'neutral'
}

function suppressionColor(reason: string): 'error' | 'warning' | 'info' | 'neutral' {
  if (reason === 'complaint' || reason === 'hard_bounce') return 'error'
  if (reason === 'global_unsubscribe' || reason === 'soft_bounce') return 'warning'
  if (reason === 'manual') return 'info'
  return 'neutral'
}

function formatReason(reason: string): string {
  return reason.replace(/_/g, ' ')
}

function softBounceLabel(count?: number | null): string {
  const value = Number(count ?? 0)
  return `${value} soft bounce${value === 1 ? '' : 's'}`
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search email or name"
          class="w-64"
        />
        <USelectMenu
          v-model="listFilter"
          :items="listFilterOptions"
          value-key="value"
          class="w-48"
        />
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-upload"
          color="neutral"
          variant="outline"
          label="Import CSV"
          @click="showImport = true"
        />
        <UButton icon="i-lucide-plus" label="Add subscriber" @click="showAdd = true" />
      </div>
    </div>

    <div v-if="pending" class="text-sm text-muted">
      Loading…
    </div>
    <div v-else-if="!data?.items?.length" class="text-sm text-muted py-8 text-center">
      No subscribers found.
    </div>

    <div v-else class="border border-default rounded-lg divide-y divide-default">
      <div
        v-for="row in data.items"
        :key="row.id"
        class="flex items-center justify-between gap-4 px-4 py-2.5 cursor-pointer hover:bg-elevated/50 transition-colors"
        @click="openDetails(row)"
      >
        <div>
          <p class="font-medium">
            {{ row.email }}
          </p>
          <p v-if="row.name" class="text-sm text-muted">
            {{ row.name }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :color="statusColor(row.status)" variant="subtle">
            {{ row.status }}
          </UBadge>
          <UBadge
            v-if="row.suppression_reason"
            :color="suppressionColor(row.suppression_reason)"
            variant="subtle"
          >
            {{ formatReason(row.suppression_reason) }}
          </UBadge>
          <UBadge v-else-if="Number(row.soft_bounce_count ?? 0) > 0" color="warning" variant="subtle">
            {{ softBounceLabel(row.soft_bounce_count) }}
          </UBadge>
          <UButton
            icon="i-lucide-history"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="View subscriber history"
            @click.stop="openDetails(row)"
          />
        </div>
      </div>
    </div>

    <p v-if="data?.total" class="text-xs text-muted">
      {{ data.total }} total
    </p>

    <EmailSubscriberFormModal v-model:open="showAdd" :lists="lists" @saved="refresh" />
    <EmailImportModal v-model:open="showImport" :lists="lists" @imported="refresh" />
    <EmailSubscriberDetailDrawer v-model:open="showDetail" :subscriber-id="selectedSubscriberId" />
  </div>
</template>
