<script setup lang="ts">
interface PacingReviewItem {
  mediaSpendId: string
  clientName: string
  platform: 'meta' | 'google'
  campaignName: string
  campaignStatus: string | null
  issueType: string
  severity: 'critical' | 'warning' | 'info'
  budget: number
  mtdSpend: number
  expectedToDate: number
  projectedMonthEnd: number
  currentDailyBudget: number
  recommendedDailyBudget: number
  pacingRatio: number
  performance: {
    impressions: number
    clicks: number
    conversions: number
    ctr: number | null
    cpc: number | null
    costPerConversion: number | null
    conversionRate: number | null
    reach: number | null
    frequency: number | null
    impressionShare: number | null
    lostImpressionShareBudget: number | null
    lostImpressionShareRank: number | null
    bidStrategy: string | null
    budgetType: string | null
  }
  syncedAt: string | null
  recommendedAction: string
}

interface PacingReviewSummary {
  criticalCount: number
  warningCount: number
  staleCount: number
  projectedOverspend: number
  projectedUnderspend: number
}

interface PacingReview {
  period: string
  generatedAt: string
  items: PacingReviewItem[]
  summary: PacingReviewSummary
  aiSummary: string | null
}

const props = defineProps<{
  review: PacingReview | null
  loading?: boolean
}>()

const emit = defineEmits<{
  sync: []
}>()

const severityFilter = ref<'all' | 'critical' | 'warning'>('all')
const platformFilter = ref<'all' | 'meta' | 'google'>('all')
const historyOpen = ref(false)
const selectedHistoryItem = ref<PacingReviewItem | null>(null)
const severityOptions = ['all', 'critical', 'warning'] as const
const platformOptions = ['all', 'meta', 'google'] as const

const filteredItems = computed(() => {
  const items = props.review?.items || []
  return items.filter((item) => {
    if (severityFilter.value !== 'all' && item.severity !== severityFilter.value) return false
    if (platformFilter.value !== 'all' && item.platform !== platformFilter.value) return false
    return true
  })
})

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(value || 0)
}

function issueLabel(issue: string) {
  return issue.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function severityColor(severity: string) {
  if (severity === 'critical') return 'error'
  if (severity === 'warning') return 'warning'
  return 'info'
}

function openHistory(item: PacingReviewItem) {
  selectedHistoryItem.value = item
  historyOpen.value = true
}
</script>

<template>
  <div class="rounded-xl border border-default overflow-hidden">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-default bg-elevated/30">
      <div>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
          <h2 class="text-sm font-semibold">AI pacing review</h2>
        </div>
        <p class="text-xs text-muted mt-0.5">Recommend-only checks for Meta and Google. No platform changes are made.</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          @click="emit('sync')"
        >
          Sync before acting
        </UButton>
      </div>
    </div>

    <div v-if="loading" class="flex items-center gap-2 p-4 text-sm text-muted">
      <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
      Reviewing pacing...
    </div>

    <template v-else-if="review">
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4 border-b border-default">
        <div class="rounded-lg bg-elevated/40 p-3">
          <p class="text-[11px] uppercase text-muted font-medium">Critical</p>
          <p class="text-xl font-semibold text-error mt-1">{{ review.summary.criticalCount }}</p>
        </div>
        <div class="rounded-lg bg-elevated/40 p-3">
          <p class="text-[11px] uppercase text-muted font-medium">Warnings</p>
          <p class="text-xl font-semibold text-warning mt-1">{{ review.summary.warningCount }}</p>
        </div>
        <div class="rounded-lg bg-elevated/40 p-3">
          <p class="text-[11px] uppercase text-muted font-medium">Stale syncs</p>
          <p class="text-xl font-semibold mt-1">{{ review.summary.staleCount }}</p>
        </div>
        <div class="rounded-lg bg-elevated/40 p-3">
          <p class="text-[11px] uppercase text-muted font-medium">Projected over</p>
          <p class="text-xl font-semibold mt-1">{{ formatCurrency(review.summary.projectedOverspend) }}</p>
        </div>
        <div class="rounded-lg bg-elevated/40 p-3">
          <p class="text-[11px] uppercase text-muted font-medium">Projected under</p>
          <p class="text-xl font-semibold mt-1">{{ formatCurrency(review.summary.projectedUnderspend) }}</p>
        </div>
      </div>

      <div v-if="review.aiSummary" class="px-4 py-3 border-b border-default bg-primary/5">
        <p class="text-sm text-default">{{ review.aiSummary }}</p>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-default">
        <div class="text-xs text-muted">
          {{ review.items.length }} recommendation{{ review.items.length === 1 ? '' : 's' }} generated for {{ review.period }}
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-for="value in severityOptions"
            :key="value"
            size="xs"
            :variant="severityFilter === value ? 'soft' : 'ghost'"
            :color="severityFilter === value ? 'primary' : 'neutral'"
            @click="severityFilter = value"
          >
            {{ issueLabel(value) }}
          </UButton>
          <div class="w-px h-5 bg-default" />
          <UButton
            v-for="value in platformOptions"
            :key="value"
            size="xs"
            :variant="platformFilter === value ? 'soft' : 'ghost'"
            :color="platformFilter === value ? 'primary' : 'neutral'"
            @click="platformFilter = value"
          >
            {{ value === 'all' ? 'All' : value === 'meta' ? 'Meta' : 'Google' }}
          </UButton>
        </div>
      </div>

      <div v-if="filteredItems.length" class="divide-y divide-default">
        <div
          v-for="item in filteredItems"
          :key="`${item.mediaSpendId}-${item.issueType}`"
          class="p-4 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="severityColor(item.severity) as any" variant="soft" size="sm">
                {{ issueLabel(item.issueType) }}
              </UBadge>
              <UBadge color="neutral" variant="subtle" size="sm">
                {{ item.platform === 'meta' ? 'Meta' : 'Google' }}
              </UBadge>
              <span v-if="item.campaignStatus" class="text-xs text-muted">{{ item.campaignStatus }}</span>
            </div>
            <p class="font-medium mt-2 truncate">{{ item.clientName }} · {{ item.campaignName }}</p>
            <p class="text-sm text-muted mt-1">{{ item.recommendedAction }}</p>
            <div class="mt-3">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-history"
                @click="openHistory(item)"
              >
                History
              </UButton>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right shrink-0">
            <div>
              <p class="text-[11px] uppercase text-muted font-medium">Spend</p>
              <p class="text-sm font-semibold tabular-nums">{{ formatCurrency(item.mtdSpend) }}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase text-muted font-medium">Budget</p>
              <p class="text-sm font-semibold tabular-nums">{{ formatCurrency(item.budget) }}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase text-muted font-medium">Projected</p>
              <p class="text-sm font-semibold tabular-nums">{{ formatCurrency(item.projectedMonthEnd) }}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase text-muted font-medium">New/day</p>
              <p class="text-sm font-semibold tabular-nums">{{ formatCurrency(item.recommendedDailyBudget) }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="p-4 text-sm text-muted">
        No recommendations match the selected filters.
      </div>
    </template>

    <div v-else class="p-4 text-sm text-muted">
      No pacing review is available yet. Sync Meta and Google spend to refresh the review.
    </div>

    <SocialSpendCampaignHistorySlideover v-model:open="historyOpen" :item="selectedHistoryItem" />
  </div>
</template>
