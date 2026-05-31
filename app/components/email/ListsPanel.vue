<!-- app/components/email/ListsPanel.vue -->
<script setup lang="ts">
interface ListRow {
  id: string
  name: string
  description: string | null
  double_optin: boolean
  subscriber_count: number
  archived_at: string | null
}

const toast = useToast()
const { data, refresh, pending } = await useFetch<{ items: ListRow[] }>('/api/email/lists', {
  default: () => ({ items: [] })
})

const showModal = ref(false)
const editing = ref<ListRow | null>(null)

function openCreate() {
  editing.value = null
  showModal.value = true
}
function openEdit(row: ListRow) {
  editing.value = row
  showModal.value = true
}

async function archive(row: ListRow) {
  try {
    await $fetch(`/api/email/lists/${row.id}`, { method: 'DELETE' })
    toast.add({ title: 'List archived', color: 'success' })
    refresh()
  } catch {
    toast.add({ title: 'Archive failed', color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <p class="text-sm text-muted">
        {{ data?.items?.length ?? 0 }} list(s)
      </p>
      <UButton icon="i-lucide-plus" label="New list" @click="openCreate" />
    </div>

    <div v-if="pending" class="text-sm text-muted">
      Loading…
    </div>
    <div v-else-if="!data?.items?.length" class="text-sm text-muted py-8 text-center">
      No lists yet. Create your first list to start collecting subscribers.
    </div>

    <div v-else class="border border-default rounded-lg divide-y divide-default">
      <div v-for="row in data.items" :key="row.id" class="flex items-center justify-between px-4 py-3">
        <div>
          <p class="font-medium">
            {{ row.name }}
          </p>
          <p v-if="row.description" class="text-sm text-muted">
            {{ row.description }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <UBadge color="neutral" variant="subtle">
            {{ row.subscriber_count }} subscribers
          </UBadge>
          <UBadge v-if="row.double_optin" color="info" variant="subtle">
            Double opt-in
          </UBadge>
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="openEdit(row)"
          />
          <UButton
            icon="i-lucide-archive"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="archive(row)"
          />
        </div>
      </div>
    </div>

    <EmailListFormModal v-model:open="showModal" :list="editing" @saved="refresh" />
  </div>
</template>
