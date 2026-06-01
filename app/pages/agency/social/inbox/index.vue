<script setup lang="ts">
import { useSocialInbox } from '~/composables/useSocialInbox'
import type { SocialConversation, SocialMessage } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const { conversations, loading, load, open, reply, setStatus, markRead, refresh } = useSocialInbox(clientId)

const selectedId = ref<string | null>(null)
const thread = ref<{ conversation: SocialConversation | null; messages: SocialMessage[] }>({ conversation: null, messages: [] })
const sending = ref(false)
const syncing = ref(false)
const filters = ref<Record<string, string>>({ status: 'open' })
const toast = useToast()

async function reload() { await load(filters.value) }
watch(clientId, () => { selectedId.value = null; thread.value = { conversation: null, messages: [] }; reload() })
onMounted(reload)

async function onFilter(f: Record<string, string>) { filters.value = f; await reload() }

async function select(id: string) {
  selectedId.value = id
  thread.value = await open(id)
  if (thread.value.conversation?.unread_count) { await markRead(id); reload() }
}

async function onSend(content: string) {
  if (!selectedId.value) return
  sending.value = true
  try {
    await reply(selectedId.value, content)
    thread.value = await open(selectedId.value)
    toast.add({ title: 'Reply sent', color: 'success' })
    reload()
  } catch (e: any) {
    toast.add({ title: 'Reply failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    sending.value = false
  }
}

async function onStatus(s: 'open' | 'snoozed' | 'closed') {
  if (!selectedId.value) return
  await setStatus(selectedId.value, s)
  reload()
}
async function onMarkRead() {
  if (!selectedId.value) return
  await markRead(selectedId.value)
  reload()
}

async function onRefresh() {
  syncing.value = true
  try {
    const r = await refresh()
    toast.add({ title: `Synced (${r.synced} new)`, color: 'success' })
    await reload()
  } catch {
    toast.add({ title: 'Sync failed', color: 'error' })
  } finally {
    syncing.value = false
  }
}

const selectedConv = computed(() => thread.value.conversation)
const replyDisabled = computed(() => selectedConv.value?.platform === 'tiktok')
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <div class="flex items-center gap-3 p-4 border-b border-default">
      <h1 class="text-lg font-semibold">Engagement Inbox</h1>
      <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Select client" class="w-56" />
      <UButton to="/agency/social/inbox/reviews" label="Reviews" icon="i-lucide-star" variant="subtle" size="sm" />
      <UButton class="ml-auto" label="Refresh" icon="i-lucide-refresh-cw" :loading="syncing" variant="subtle" size="sm" @click="onRefresh" />
    </div>
    <div class="flex-1 grid grid-cols-[320px_1fr_240px] min-h-0">
      <SocialInboxSidebar :conversations="conversations" :selected-id="selectedId" :loading="loading" @select="select" @filter="onFilter" />
      <div class="flex flex-col min-h-0">
        <SocialInboxThread :conversation="selectedConv" :messages="thread.messages" class="flex-1 min-h-0" />
        <SocialInboxComposer
          v-if="selectedConv" :sending="sending" :disabled="replyDisabled"
          disabled-reason="TikTok replies require additional API access" @send="onSend"
        />
      </div>
      <SocialInboxActionPanel :conversation="selectedConv" @status="onStatus" @mark-read="onMarkRead" />
    </div>
  </div>
</template>
