<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
useHead({ title: 'News Inbox' })

interface NewsItem { id: string; source: string; source_url: string | null; title: string; summary: string | null; author: string | null; published_at: string | null; status: string }
const apiFetch = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>
const items = ref<NewsItem[]>([])
const status = ref('unread')
const pending = ref(false)
const error = ref<string | null>(null)
const selected = ref<string[]>([])
const toast = useToast()
const clients = ref<Array<{ id: string; name: string }>>([])
const clientId = ref('')
const accounts = ref<Array<{ id: string; platform: string; account_name: string | null }>>([])
const accountIds = ref<string[]>([])
const platforms = ref<string[]>(['facebook'])
const rewrite = ref(false)
const tone = ref('professional')
const showDraftOptions = ref(false)

async function refresh() {
  pending.value = true; error.value = null
  try { items.value = await apiFetch<NewsItem[]>(`/api/agency/social/news?status=${status.value}`) }
  catch (e: any) { error.value = e?.data?.statusMessage || 'Could not load the news inbox' }
  finally { pending.value = false }
}
function toggle(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id] }
function fmtDate(value: string | null) { return value ? new Date(value).toLocaleString() : 'Date unknown' }
onMounted(refresh)
watch(status, refresh)
onMounted(async () => {
  const response = await apiFetch<any>('/api/agency/clients?limit=200')
  clients.value = Array.isArray(response) ? response : (response?.clients ?? [])
  clientId.value = clients.value[0]?.id ?? ''
})
watch(clientId, async (id) => {
  if (!id) return
  accounts.value = await apiFetch<any[]>(`/api/agency/social/publishing/accounts?clientId=${id}`)
  accountIds.value = accounts.value.filter(a => a.is_active).map(a => a.id)
})
async function createDrafts() {
  try {
    const targets = accounts.value.filter(a => accountIds.value.includes(a.id)).map(a => ({ platform: a.platform, accountId: a.id }))
    const result = await apiFetch<{ postIds: string[] }>('/api/agency/social/news/drafts', { method: 'POST', body: { newsIds: selected.value, clientId: clientId.value, platforms: platforms.value, accountIds: accountIds.value, targets, rewrite: rewrite.value, tone: tone.value } } as any)
    toast.add({ title: 'Drafts created', description: `${result.postIds.length} item(s) sent to Compose / Approvals`, color: 'success' })
    selected.value = []; showDraftOptions.value = false; status.value = 'used'; await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create drafts', description: e?.data?.statusMessage || 'Check connected accounts', color: 'error' }) }
}
</script>

<template>
  <SocialPublishingShell title="News Inbox" subtitle="Cherry-pick MCP news, rewrite it if needed, and send it to selected accounts and platforms.">
    <div class="flex items-center gap-2 mb-5">
      <USelectMenu v-model="status" :items="[{ label: 'Unread', value: 'unread' }, { label: 'Selected', value: 'selected' }, { label: 'Used', value: 'used' }, { label: 'Dismissed', value: 'dismissed' }]" value-key="value" class="w-36" />
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="subtle" label="Refresh" :loading="pending" @click="refresh" />
      <span class="text-sm text-muted ml-auto">{{ selected.length }} selected</span>
      <UButton icon="i-lucide-send" label="Create drafts" :disabled="!selected.length" @click="showDraftOptions = true" />
    </div>
    <div v-if="showDraftOptions" class="rounded-lg border border-primary/30 bg-default p-4 mb-5 space-y-3">
      <div class="flex flex-wrap gap-3 items-center">
        <USelectMenu v-model="clientId" :items="clients.map(c => ({ label: c.name, value: c.id }))" value-key="value" placeholder="Target client" class="w-52" />
        <UCheckbox v-for="p in ['facebook','instagram','linkedin','tiktok','youtube','google-business']" :key="p" v-model="platforms" :value="p" :label="p" />
        <UCheckbox v-model="rewrite" label="Rewrite with AI" />
        <UInput v-if="rewrite" v-model="tone" placeholder="Tone" class="w-36" />
      </div>
      <div class="flex flex-wrap gap-2">
        <UCheckbox v-for="a in accounts" :key="a.id" v-model="accountIds" :value="a.id" :label="`${a.platform}: ${a.account_name || 'account'}`" />
      </div>
      <div class="flex gap-2"><UButton label="Create drafts" :loading="pending" :disabled="!clientId || !platforms.length" @click="createDrafts" /><UButton label="Cancel" color="neutral" variant="ghost" @click="showDraftOptions = false" /></div>
    </div>
    <div v-if="error" class="rounded-lg border border-error/40 p-4 text-sm text-error">{{ error }}</div>
    <div v-else-if="pending" class="text-sm text-muted">Loading news…</div>
    <div v-else-if="!items.length" class="rounded-lg border border-dashed border-default p-10 text-center text-sm text-muted">No news items in this view.</div>
    <div v-else class="space-y-3">
      <article v-for="item in items" :key="item.id" class="rounded-lg border border-default bg-default p-4 flex gap-3">
        <UCheckbox :model-value="selected.includes(item.id)" class="mt-1" @update:model-value="toggle(item.id)" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-xs text-muted mb-1"><UBadge color="primary" variant="subtle" size="xs">{{ item.source }}</UBadge><span>{{ fmtDate(item.published_at) }}</span></div>
          <h2 class="font-medium">{{ item.title }}</h2>
          <p v-if="item.summary" class="text-sm text-muted mt-1 line-clamp-3">{{ item.summary }}</p>
          <p v-if="item.author" class="text-xs text-muted mt-2">{{ item.author }}</p>
        </div>
        <UButton v-if="item.source_url" :to="item.source_url" target="_blank" icon="i-lucide-external-link" variant="ghost" size="xs" aria-label="Open source" />
      </article>
    </div>
  </SocialPublishingShell>
</template>
