<script setup lang="ts">
import { useSocialInbox } from '~/composables/useSocialInbox'
import type { SocialConversation, SocialMessage } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

interface AgencyClientOption {
  id: string
  name: string
}

type AgencyClientsResponse = AgencyClientOption[] | { clients?: AgencyClientOption[] }

function fetchErrorDescription(error: unknown) {
  const e = error as { data?: { statusMessage?: string }, message?: string }
  return e.data?.statusMessage || e.message
}

const { data: clientsData } = await useFetch<AgencyClientsResponse>('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<AgencyClientOption[]>(() => {
  const d = clientsData.value
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const { conversations, loading, hasMore, load, loadMore, open, reply } = useSocialInbox(clientId)
const selectedId = ref<string | null>(null)
const thread = ref<{ conversation: SocialConversation | null, messages: SocialMessage[] }>({ conversation: null, messages: [] })
const sending = ref(false)
const filters = ref<Record<string, string>>({ channel: 'review' })
const toast = useToast()

async function reload() {
  await load(filters.value)
}
watch(clientId, () => {
  selectedId.value = null
  thread.value = { conversation: null, messages: [] }
  reload()
})
onMounted(reload)

const dist = computed(() => {
  const d: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const c of conversations.value) if (c.rating && d[c.rating] !== undefined) d[c.rating]++
  return d
})
const avg = computed(() => {
  const rated = conversations.value.filter(c => c.rating)
  if (!rated.length) return 0
  return rated.reduce((s, c) => s + (c.rating || 0), 0) / rated.length
})

async function select(id: string) {
  selectedId.value = id
  thread.value = await open(id)
}
async function onFilter(f: Record<string, string>) {
  filters.value = { ...f, channel: 'review' }
  await reload()
}
async function onLoadMore() {
  await loadMore(filters.value)
}
async function onSend(content: string) {
  if (!selectedId.value) return
  sending.value = true
  try {
    await reply(selectedId.value, content)
    thread.value = await open(selectedId.value)
    toast.add({ title: 'Reply sent', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Reply failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <div class="flex flex-wrap items-center gap-3 p-4 border-b border-default">
      <h1 class="text-lg font-semibold">
        Reviews
      </h1>
      <USelectMenu
        v-model="clientId"
        :items="clientOptions"
        value-key="value"
        placeholder="Select client"
        class="w-56 max-w-full"
      />
      <UButton
        to="/agency/social/inbox"
        label="Inbox"
        icon="i-lucide-inbox"
        variant="subtle"
        size="sm"
      />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:ml-auto">
        <span class="font-semibold text-warning">★ {{ avg.toFixed(1) }}</span>
        <span v-for="n in [5, 4, 3, 2, 1]" :key="n" class="text-muted">{{ n }}★ {{ dist[n] }}</span>
      </div>
    </div>
    <div class="px-4">
      <SocialSuiteSectionNav />
    </div>
    <div class="flex-1 grid grid-cols-[320px_1fr] min-h-0">
      <SocialInboxSidebar
        :conversations="conversations"
        :selected-id="selectedId"
        :loading="loading"
        :has-more="hasMore"
        @select="select"
        @filter="onFilter"
        @load-more="onLoadMore"
      />
      <div class="flex flex-col min-h-0">
        <SocialInboxThread :conversation="thread.conversation" :messages="thread.messages" class="flex-1 min-h-0" />
        <SocialInboxComposer
          v-if="thread.conversation"
          :sending="sending"
          :conversation-id="thread.conversation?.id"
          @send="onSend"
        />
      </div>
    </div>
  </div>
</template>
