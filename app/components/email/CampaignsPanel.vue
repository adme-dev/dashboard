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

// ── Send controls (gated) ──────────────────────────────────────────────────
const { data: cfg } = await useFetch<{ sending_enabled: boolean }>(
  '/api/email/campaigns/config',
  { default: () => ({ sending_enabled: false }) }
)
const sendingEnabled = computed(() => !!cfg.value?.sending_enabled)

const busyId = ref<string | null>(null)
const showSend = ref(false)
const sendTarget = ref<CampaignRow | null>(null)

function errMessage(e: unknown): string {
  const err = e as { data?: { statusMessage?: string, message?: string }, statusMessage?: string }
  return err?.data?.message || err?.data?.statusMessage || err?.statusMessage || 'Something went wrong.'
}

function confirmSend(row: CampaignRow) {
  sendTarget.value = row
  showSend.value = true
}

async function doSend() {
  const row = sendTarget.value
  if (!row) return
  busyId.value = row.id
  try {
    const res = await $fetch<{ sent: number, remaining: number, status: string }>(
      `/api/email/campaigns/${row.id}/send`, { method: 'POST' }
    )
    toast.add({
      title: res.status === 'sent' ? 'Campaign sent' : 'Sending…',
      description: `${res.sent} sent, ${res.remaining} remaining.`,
      color: 'success'
    })
    showSend.value = false
    refresh()
  } catch (e) {
    toast.add({ title: 'Send failed', description: errMessage(e), color: 'error' })
  } finally {
    busyId.value = null
  }
}

async function pause(row: CampaignRow) {
  busyId.value = row.id
  try {
    await $fetch(`/api/email/campaigns/${row.id}/pause`, { method: 'POST' })
    toast.add({ title: 'Paused', color: 'success' })
    refresh()
  } catch (e) {
    toast.add({ title: 'Pause failed', description: errMessage(e), color: 'error' })
  } finally {
    busyId.value = null
  }
}

async function cancel(row: CampaignRow) {
  busyId.value = row.id
  try {
    await $fetch(`/api/email/campaigns/${row.id}/cancel`, { method: 'POST' })
    toast.add({ title: 'Cancelled', color: 'success' })
    refresh()
  } catch (e) {
    toast.add({ title: 'Cancel failed', description: errMessage(e), color: 'error' })
  } finally {
    busyId.value = null
  }
}

async function testSend(row: CampaignRow) {
  busyId.value = row.id
  try {
    const res = await $fetch<{ sent_to: string }>(
      `/api/email/campaigns/${row.id}/test-send`, { method: 'POST' }
    )
    toast.add({ title: 'Test sent', description: `Sent to ${res.sent_to}.`, color: 'success' })
  } catch (e) {
    toast.add({ title: 'Test failed', description: errMessage(e), color: 'error' })
  } finally {
    busyId.value = null
  }
}

const SENDABLE = new Set(['draft', 'scheduled', 'paused'])
const TERMINAL = new Set(['sent', 'cancelled'])
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <p class="text-sm text-muted">
        {{ data?.campaigns?.length ?? 0 }} campaign(s)
      </p>
      <UButton icon="i-lucide-plus" label="New campaign" @click="openCreate" />
    </div>

    <UAlert
      v-if="!sendingEnabled"
      icon="i-lucide-shield-alert"
      color="warning"
      variant="subtle"
      title="Sending is disabled"
      description="Set EMAIL_SENDING_ENABLED=true and configure Resend to enable sending. You can still build, target, and materialize campaigns."
    />

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
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs text-muted">{{ row.sent }} / {{ row.to_send }} sent</span>
          <UBadge :color="(STATUS_COLOR[row.status] as any) || 'neutral'" variant="subtle">
            {{ row.status }}
          </UBadge>

          <UButton
            v-if="!TERMINAL.has(row.status)"
            icon="i-lucide-mail-check"
            variant="ghost"
            color="neutral"
            size="xs"
            title="Send a test to me"
            :loading="busyId === row.id"
            :disabled="!sendingEnabled"
            @click="testSend(row)"
          />
          <UTooltip v-if="SENDABLE.has(row.status)" :text="sendingEnabled ? 'Send' : 'Sending disabled'">
            <UButton
              icon="i-lucide-send"
              color="primary"
              size="xs"
              label="Send"
              :loading="busyId === row.id"
              :disabled="!sendingEnabled || row.to_send < 1"
              @click="confirmSend(row)"
            />
          </UTooltip>
          <UButton
            v-if="row.status === 'sending'"
            icon="i-lucide-pause"
            variant="soft"
            color="warning"
            size="xs"
            label="Pause"
            :loading="busyId === row.id"
            @click="pause(row)"
          />
          <UButton
            v-if="row.status === 'sending' || row.status === 'paused'"
            icon="i-lucide-x"
            variant="ghost"
            color="error"
            size="xs"
            label="Cancel"
            :loading="busyId === row.id"
            @click="cancel(row)"
          />
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

    <UModal v-model:open="showSend" title="Send campaign">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm font-semibold">
            Send “{{ sendTarget?.name }}”?
          </p>
          <p class="text-sm text-muted">
            This sends a real email to
            <span class="font-medium text-default">{{ sendTarget?.to_send }}</span>
            recipient(s). This can't be undone.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showSend = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-send"
              label="Send now"
              :loading="busyId === sendTarget?.id"
              @click="doSend()"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
