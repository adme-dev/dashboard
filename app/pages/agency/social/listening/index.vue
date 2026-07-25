<script setup lang="ts">
import { useSocialListening } from '~/composables/useSocialListening'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
useHead({ title: 'Social Listening' })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const { mentions, loading, filterSource, filterSentiment, overview, days, load, loadMentions, loadOverview, syncOwned } = useSocialListening(clientId)

const showQueries = ref(false)
const syncing = ref(false)
async function onSync() { syncing.value = true; try { await syncOwned() } finally { syncing.value = false } }

const sourceFilterOptions = [
  { label: 'All sources', value: 'all' }, { label: 'Owned (inbox)', value: 'owned' },
  { label: 'Reddit', value: 'reddit' }, { label: 'News', value: 'news' }, { label: 'YouTube', value: 'youtube' },
  { label: 'Bluesky', value: 'bluesky' }, { label: 'Mastodon', value: 'mastodon' },
  { label: 'Hacker News', value: 'hackernews' }, { label: 'Lemmy', value: 'lemmy' },
  { label: 'Facebook Ads Library', value: 'facebook_ads_library' },
]
const sentimentFilterOptions = [
  { label: 'All sentiment', value: 'all' }, { label: 'Positive', value: 'positive' },
  { label: 'Neutral', value: 'neutral' }, { label: 'Negative', value: 'negative' }, { label: 'Unknown', value: 'unknown' },
]
function sentimentColor(s: string) { return s === 'positive' ? 'success' : s === 'negative' ? 'error' : 'neutral' }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString() : '' }

watch(clientId, load)
watch([filterSource, filterSentiment], loadMentions)
watch(days, () => { loadMentions(); loadOverview() })
onMounted(load)
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center gap-3 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">Listening</h1>
        <p class="text-sm text-muted mt-0.5">Brand mentions across your inbox and the open web.</p>
      </div>
      <div class="flex items-center gap-2 ml-auto">
        <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Client" class="w-52" />
        <USelectMenu v-model="filterSource" :items="sourceFilterOptions" value-key="value" class="w-40" />
        <USelectMenu v-model="filterSentiment" :items="sentimentFilterOptions" value-key="value" class="w-40" />
        <USelectMenu v-model="days" :items="[{label:'7d',value:7},{label:'30d',value:30},{label:'90d',value:90}]" value-key="value" class="w-28" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="subtle" label="Sync inbox" :loading="syncing" :disabled="!clientId" @click="onSync" />
        <UButton icon="i-lucide-radar" color="neutral" variant="subtle" label="Queries" :disabled="!clientId" @click="showQueries = true" />
      </div>
    </div>

    <SocialSuiteSectionNav />

    <SocialListeningQueryManager v-model:open="showQueries" :client-id="clientId" />

    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <template v-else-if="clientId">
      <!-- Analytics dashboard -->
      <div v-if="overview && overview.total" class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted">Mentions</div>
          <div class="text-2xl font-semibold mt-1">{{ overview.total }}</div>
        </div>
        <div class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted mb-2">Sentiment</div>
          <div class="flex items-center gap-2 text-sm">
            <UBadge color="success" variant="subtle" size="xs">+{{ overview.sentiment.positive }}</UBadge>
            <UBadge color="neutral" variant="subtle" size="xs">~{{ overview.sentiment.neutral }}</UBadge>
            <UBadge color="error" variant="subtle" size="xs">-{{ overview.sentiment.negative }}</UBadge>
          </div>
        </div>
        <div class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted mb-2">Share of voice</div>
          <div class="space-y-1">
            <div v-for="s in overview.shareOfVoice" :key="s.category" class="flex justify-between text-xs">
              <span class="capitalize">{{ s.category }}</span><span class="tabular-nums text-muted">{{ s.count }}</span>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted mb-2">Top topics</div>
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="t in overview.topTopics.slice(0, 8)" :key="t.topic" color="primary" variant="subtle" size="xs">{{ t.topic }} {{ t.count }}</UBadge>
            <span v-if="!overview.topTopics.length" class="text-xs text-muted">—</span>
          </div>
        </div>
      </div>
      <div v-if="mentions.length" class="space-y-2">
        <div v-for="m in mentions" :key="m.id" class="rounded-lg border border-default bg-default p-3">
          <div class="flex items-center gap-2 text-xs text-muted mb-1">
            <UBadge color="neutral" variant="subtle" size="xs">{{ m.source }}</UBadge>
            <UBadge :color="sentimentColor(m.sentiment) as any" variant="subtle" size="xs">{{ m.sentiment || 'unknown' }}</UBadge>
            <span v-if="m.author">{{ m.author }}</span>
            <span class="ml-auto">{{ fmtDate(m.published_at) }}</span>
          </div>
          <p v-if="m.title" class="text-sm font-medium">{{ m.title }}</p>
          <p class="text-sm text-muted line-clamp-3">{{ m.content || '(no text)' }}</p>
          <div v-if="(m.topics ?? []).length" class="flex flex-wrap gap-1 mt-1">
            <UBadge v-for="t in m.topics" :key="t" color="primary" variant="subtle" size="xs">{{ t }}</UBadge>
          </div>
          <UButton v-if="m.url" :to="m.url" target="_blank" icon="i-lucide-external-link" variant="ghost" size="xs" class="mt-1" label="Open" />
        </div>
      </div>
      <div v-else class="rounded-lg border border-dashed border-default p-10 text-center">
        <UIcon name="i-lucide-radar" class="text-muted size-8 mx-auto" />
        <p class="text-sm text-muted mt-2">No mentions yet. Add a listening query, then "Sync inbox" to pull owned mentions.</p>
      </div>
    </template>
    <div v-else class="text-sm text-muted">Select a client to view listening.</div>
  </div>
</template>
