<script setup lang="ts">
import { usePortalSocialListening } from '~/composables/usePortalSocialListening'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Social Listening' })

const days = ref(30)
const { overview, mentions, loading, load } = usePortalSocialListening(days)
function sentimentColor(s: string) { return s === 'positive' ? 'success' : s === 'negative' ? 'error' : 'neutral' }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString() : '' }
watch(days, load)
onMounted(load)
</script>

<template>
  <div class="w-full p-6 space-y-6">
    <div class="flex items-center gap-3 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">Social Listening</h1>
        <p class="text-sm text-muted mt-0.5">Where your brand is being mentioned across the web.</p>
      </div>
      <USelectMenu v-model="days" :items="[{label:'7d',value:7},{label:'30d',value:30},{label:'90d',value:90}]" value-key="value" class="w-28 ml-auto" />
    </div>
    <PortalSocialSectionNav />

    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <template v-else>
      <div v-if="overview && overview.total" class="grid gap-4 md:grid-cols-3">
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
          <div class="text-xs text-muted mb-2">Top topics</div>
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="t in overview.topTopics.slice(0, 8)" :key="t.topic" color="primary" variant="subtle" size="xs">{{ t.topic }}</UBadge>
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
          <UButton v-if="m.url" :to="m.url" target="_blank" icon="i-lucide-external-link" variant="ghost" size="xs" class="mt-1" label="Open" />
        </div>
      </div>
      <div v-else class="rounded-lg border border-dashed border-default p-10 text-center">
        <UIcon name="i-lucide-radar" class="text-muted size-8 mx-auto" />
        <p class="text-sm text-muted mt-2">No mentions in this period yet.</p>
      </div>
    </template>
  </div>
</template>
