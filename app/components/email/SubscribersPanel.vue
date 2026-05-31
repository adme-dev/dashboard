<!-- app/components/email/SubscribersPanel.vue -->
<script setup lang="ts">
interface SubRow { id: string, email: string, name: string | null, status: string, created_at: string }

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
      <div v-for="row in data.items" :key="row.id" class="flex items-center justify-between px-4 py-2.5">
        <div>
          <p class="font-medium">
            {{ row.email }}
          </p>
          <p v-if="row.name" class="text-sm text-muted">
            {{ row.name }}
          </p>
        </div>
        <UBadge :color="row.status === 'enabled' ? 'success' : 'neutral'" variant="subtle">
          {{ row.status }}
        </UBadge>
      </div>
    </div>

    <p v-if="data?.total" class="text-xs text-muted">
      {{ data.total }} total
    </p>

    <EmailSubscriberFormModal v-model:open="showAdd" :lists="lists" @saved="refresh" />
    <EmailImportModal v-model:open="showImport" :lists="lists" @imported="refresh" />
  </div>
</template>
