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
</script>

<template>
  <SocialPublishingShell title="News Inbox" subtitle="Cherry-pick MCP news, rewrite it if needed, and send it to selected accounts and platforms.">
    <div class="flex items-center gap-2 mb-5">
      <USelectMenu v-model="status" :items="[{ label: 'Unread', value: 'unread' }, { label: 'Selected', value: 'selected' }, { label: 'Used', value: 'used' }, { label: 'Dismissed', value: 'dismissed' }]" value-key="value" class="w-36" />
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="subtle" label="Refresh" :loading="pending" @click="refresh" />
      <span class="text-sm text-muted ml-auto">{{ selected.length }} selected</span>
      <UButton icon="i-lucide-send" label="Create drafts" :disabled="!selected.length" />
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
