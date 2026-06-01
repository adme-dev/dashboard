<script setup lang="ts">
import type { SocialResponseQueueItem } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const { data: items, refresh, pending } = await useFetch<SocialResponseQueueItem[]>(
  '/api/agency/social/inbox/response-queue',
  { query: { clientId, status: 'pending' }, default: () => [], watch: [clientId] },
)

const toast = useToast()
const edits = reactive<Record<string, string>>({})
const busy = ref<string | null>(null)

// Seed each editable textarea with its draft as rows arrive.
watch(items, (list) => {
  for (const it of list) if (!(it.id in edits)) edits[it.id] = it.draft_content
}, { immediate: true })

function bodyFor(it: SocialResponseQueueItem) { return edits[it.id] ?? it.draft_content }

async function approve(it: SocialResponseQueueItem) {
  busy.value = it.id
  try {
    await $fetch(`/api/agency/social/inbox/response-queue/${it.id}/approve`, { method: 'POST', body: { clientId: clientId.value, content: bodyFor(it) } })
    delete edits[it.id]
    toast.add({ title: 'Sent', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Send failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { busy.value = null }
}
async function reject(it: SocialResponseQueueItem) {
  busy.value = it.id
  try {
    await $fetch(`/api/agency/social/inbox/response-queue/${it.id}/reject`, { method: 'POST', body: { clientId: clientId.value } })
    delete edits[it.id]
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Reject failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { busy.value = null }
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Reply Queue</h1>
        <p class="text-sm text-muted">AI-drafted replies awaiting approval. Edit before sending if needed.</p>
      </div>
      <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Select client" class="w-56" />
    </div>

    <UAlert v-if="!clientId" color="warning" variant="subtle" title="Select a client"
      description="Choose a client to review its pending replies." icon="i-lucide-info" />
    <div v-else-if="pending" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!items.length" class="rounded-lg border border-dashed border-default p-10 text-center text-muted">
      Nothing waiting. AI drafts in approval mode will appear here.
    </div>

    <div v-else class="space-y-4">
      <UCard v-for="it in items" :key="it.id">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-sm">
              <UBadge variant="subtle" size="sm">{{ it.platform }}</UBadge>
              <UBadge variant="subtle" color="neutral" size="sm">{{ it.channel_type }}</UBadge>
              <span class="text-muted">{{ it.participant_name || 'Customer' }}</span>
              <UBadge v-if="it.confidence != null" :color="it.confidence >= 0.7 ? 'success' : 'warning'" variant="subtle" size="sm">
                {{ Math.round((it.confidence || 0) * 100) }}% conf
              </UBadge>
            </div>
            <ULink v-if="it.permalink" :to="it.permalink" target="_blank" class="text-xs text-primary">View on platform ↗</ULink>
          </div>
          <p v-if="it.inbound_preview" class="text-sm text-muted border-l-2 border-default pl-3">"{{ it.inbound_preview }}"</p>
          <p v-if="it.guardrail_notes" class="text-xs text-warning">⚠ {{ it.guardrail_notes }}</p>
          <UTextarea v-model="edits[it.id]" :rows="3" :placeholder="it.draft_content" class="w-full" />
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Reject" :loading="busy === it.id" @click="reject(it)" />
            <UButton label="Approve & send" icon="i-lucide-send" :loading="busy === it.id" @click="approve(it)" />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
