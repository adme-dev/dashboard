<!-- app/components/email/CampaignsPanel.vue -->
<!-- Campaigns list + draft creation (Phase 2b-1). Creating a draft optionally
     targets lists and materializes the recipient set (no sending — that's 2b-2). -->
<script setup lang="ts">
interface CampaignRow {
  id: string
  name: string
  subject: string | null
  status: string
  to_send: number
  sent: number
  updated_at: string
}
interface ListRow { id: string, name: string }

const toast = useToast()

const { data, refresh, pending } = await useFetch<{ campaigns: CampaignRow[] }>(
  '/api/email/campaigns',
  { default: () => ({ campaigns: [] }) }
)

const { data: listsData } = await useFetch<{ items: ListRow[] }>('/api/email/lists', {
  default: () => ({ items: [] })
})
const listItems = computed(() =>
  (listsData.value?.items ?? []).map(l => ({ label: l.name, value: l.id }))
)

const STATUS_COLOR: Record<string, string> = {
  draft: 'neutral',
  scheduled: 'info',
  sending: 'warning',
  paused: 'warning',
  sent: 'success',
  cancelled: 'error'
}

const showCreate = ref(false)
const creating = ref(false)
const form = ref<{ name: string, subject: string, listIds: string[] }>({
  name: '',
  subject: '',
  listIds: []
})

function openCreate() {
  form.value = { name: '', subject: '', listIds: [] }
  showCreate.value = true
}

async function create() {
  if (!form.value.name.trim()) {
    toast.add({ title: 'Name required', color: 'error' })
    return
  }
  creating.value = true
  try {
    const { campaign } = await $fetch<{ campaign: { id: string } }>('/api/email/campaigns', {
      method: 'POST',
      body: { name: form.value.name.trim(), subject: form.value.subject || null }
    })
    let recipients = 0
    if (form.value.listIds.length) {
      await $fetch(`/api/email/campaigns/${campaign.id}/lists`, {
        method: 'PUT',
        body: { list_ids: form.value.listIds }
      })
      const res = await $fetch<{ to_send: number }>(
        `/api/email/campaigns/${campaign.id}/materialize`,
        { method: 'POST' }
      )
      recipients = res.to_send
    }
    toast.add({
      title: 'Campaign created',
      description: form.value.listIds.length ? `${recipients} recipient(s) queued.` : 'Draft saved.',
      color: 'success'
    })
    showCreate.value = false
    refresh()
  } catch {
    toast.add({ title: 'Create failed', color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <p class="text-sm text-muted">
        {{ data?.campaigns?.length ?? 0 }} campaign(s)
      </p>
      <UButton icon="i-lucide-plus" label="New campaign" @click="openCreate" />
    </div>

    <div v-if="pending" class="text-sm text-muted">
      Loading…
    </div>
    <div v-else-if="!data?.campaigns?.length" class="text-sm text-muted py-8 text-center">
      No campaigns yet. Create a draft to target your lists.
    </div>

    <div v-else class="border border-default rounded-lg divide-y divide-default">
      <div
        v-for="row in data.campaigns"
        :key="row.id"
        class="flex items-center justify-between px-4 py-3"
      >
        <div class="min-w-0">
          <p class="font-medium truncate">
            {{ row.name }}
          </p>
          <p v-if="row.subject" class="text-sm text-muted truncate">
            {{ row.subject }}
          </p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-xs text-muted">{{ row.sent }} / {{ row.to_send }} sent</span>
          <UBadge :color="(STATUS_COLOR[row.status] as any) || 'neutral'" variant="subtle">
            {{ row.status }}
          </UBadge>
        </div>
      </div>
    </div>

    <UModal v-model:open="showCreate" title="New campaign">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm font-semibold">
            New campaign
          </p>
          <UFormField label="Name" required>
            <UInput v-model="form.name" placeholder="e.g. March newsletter" class="w-full" />
          </UFormField>
          <UFormField label="Subject line">
            <UInput v-model="form.subject" placeholder="Subject shown in the inbox" class="w-full" />
          </UFormField>
          <UFormField label="Target lists" help="Recipients are computed now; nothing is sent.">
            <USelectMenu
              v-model="form.listIds"
              :items="listItems"
              value-key="value"
              multiple
              placeholder="Select lists"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showCreate = false"
            />
            <UButton
              color="primary"
              label="Create"
              :loading="creating"
              @click="create()"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
