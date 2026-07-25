<script setup lang="ts">
const props = withDefaults(defineProps<{
  startDate: string
  endDate: string
  platforms?: string[]
}>(), {
  platforms: () => [],
})

interface SourceFreshness {
  platform: string
  campaignCount: number
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  firstSourceSyncAt: string | null
  lastSourceSyncAt: string | null
  lastDetailSuccessAt: string | null
  refreshingCount: number
  failedCount: number
  latestSnapshotAt: string | null
  delta: {
    spend: number
    clicks: number
    conversions: number
    campaignCoverage: number
  } | null
}

const { fmtCurrency, fmtCompact, getPlatformIcon, getPlatformLabel } = useAnalytics()
const data = ref<{ generatedAt: string; sources: SourceFreshness[] } | null>(null)
const pending = ref(false)
const failed = ref(false)

const query = computed(() => {
  const value: Record<string, string> = {
    startDate: props.startDate,
    endDate: props.endDate,
  }
  if (props.platforms.length) value.platform = props.platforms.join(',')
  return value
})

async function refresh() {
  pending.value = true
  failed.value = false
  try {
    data.value = await $fetch('/api/portal/analytics/refresh-overview', { query: query.value })
  } catch {
    failed.value = true
  } finally {
    pending.value = false
  }
}

watch(query, refresh, { immediate: true })

function timeAgo(value: string | null): string {
  if (!value) return 'Not synced'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function sourceState(source: SourceFreshness) {
  if (source.refreshingCount > 0) return { label: 'Refreshing details', color: 'info' as const }
  if (source.failedCount > 0) return { label: 'Refresh attention', color: 'warning' as const }
  return { label: 'Cached', color: 'success' as const }
}

function signed(value: number, kind: 'currency' | 'number') {
  const prefix = value > 0 ? '+' : ''
  return kind === 'currency' ? `${prefix}${fmtCurrency(value)}` : `${prefix}${fmtCompact(value)}`
}
</script>

<template>
  <section class="rounded-xl border border-default bg-elevated/20 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-database-zap" class="size-4 text-primary" />
          <h3 class="text-sm font-semibold text-default">Campaign data freshness</h3>
        </div>
        <p class="mt-1 text-xs text-muted">
          Stored results render immediately. Stale campaign details refresh in the background when opened.
        </p>
      </div>
      <UButton
        size="xs"
        variant="outline"
        icon="i-lucide-refresh-cw"
        label="Reload overview"
        :loading="pending"
        @click="refresh"
      />
    </div>

    <div v-if="failed" class="mt-4 text-xs text-warning">
      Freshness metadata is temporarily unavailable. Campaign totals are unaffected.
    </div>

    <div v-else-if="pending && !data" class="mt-4 grid gap-3 lg:grid-cols-2">
      <USkeleton v-for="item in 2" :key="item" class="h-28 rounded-lg" />
    </div>

    <div v-else-if="data?.sources.length" class="mt-4 grid gap-3 xl:grid-cols-2">
      <article
        v-for="source in data.sources"
        :key="source.platform"
        class="rounded-lg border border-default/70 bg-default p-3.5"
      >
        <div class="flex items-center gap-2">
          <UIcon :name="getPlatformIcon(source.platform)" class="size-4 text-muted" />
          <span class="text-sm font-semibold text-default">{{ getPlatformLabel(source.platform) }}</span>
          <UBadge
            class="ml-auto"
            size="xs"
            variant="subtle"
            :color="sourceState(source).color"
          >
            {{ sourceState(source).label }}
          </UBadge>
        </div>

        <div class="mt-3 grid grid-cols-3 gap-3">
          <div>
            <p class="text-[10px] uppercase tracking-wide text-muted">Spend</p>
            <p class="mt-0.5 text-sm font-semibold text-default">{{ fmtCurrency(source.spend) }}</p>
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-wide text-muted">Clicks</p>
            <p class="mt-0.5 text-sm font-semibold text-default">{{ fmtCompact(source.clicks) }}</p>
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-wide text-muted">Conversions</p>
            <p class="mt-0.5 text-sm font-semibold text-default">{{ fmtCompact(source.conversions) }}</p>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-default/60 pt-2.5 text-[11px] text-muted">
          <span>Source synced {{ timeAgo(source.lastSourceSyncAt) }}</span>
          <span>{{ source.campaignCount }} campaign{{ source.campaignCount === 1 ? '' : 's' }}</span>
          <span v-if="source.lastDetailSuccessAt">Details refreshed {{ timeAgo(source.lastDetailSuccessAt) }}</span>
        </div>

        <div v-if="source.delta" class="mt-2 text-[11px] text-muted">
          Since prior insight refresh:
          <span class="font-medium text-default">{{ signed(source.delta.spend, 'currency') }} spend</span>,
          <span class="font-medium text-default">{{ signed(source.delta.clicks, 'number') }} clicks</span>,
          <span class="font-medium text-default">{{ signed(source.delta.conversions, 'number') }} conversions</span>
          across {{ source.delta.campaignCoverage }} comparable campaign{{ source.delta.campaignCoverage === 1 ? '' : 's' }}.
        </div>
      </article>
    </div>
  </section>
</template>
