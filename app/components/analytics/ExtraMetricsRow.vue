<script setup lang="ts">
/**
 * Compact row of platform-specific extra metrics.
 * Meta: frequency, reach, LPV, video views, quality rankings, engagement breakdown, video funnel
 * Google: impression share, lost IS breakdown, video views, engagements, interactions, video funnel
 */
const props = defineProps<{
  metrics: Record<string, any>
  platform: string
  clicks?: number
}>()

const { fmtCompact, fmtPercent, fmtCurrency } = useAnalytics()

const isMeta = computed(() => props.platform === 'meta')
const isGoogle = computed(() => props.platform === 'google_ads')

// Meta: frequency warning if > 3.0
const frequencyWarning = computed(() => {
  const f = props.metrics.frequency
  return f != null && f > 3.0
})

// Meta: LPV-to-click rate (clicks comes from campaign row, not extraMetrics)
const lpvRate = computed(() => {
  const lpv = props.metrics.landingPageViews
  if (lpv == null || !props.clicks) return null
  return ((lpv / props.clicks) * 100).toFixed(1)
})

// Ranking badge color
function rankColor(ranking: string | null): 'success' | 'warning' | 'error' | 'neutral' {
  if (!ranking) return 'neutral'
  const r = ranking.toUpperCase()
  // Order matters: check BELOW before AVERAGE (since BELOW_AVERAGE contains AVERAGE)
  if (r.includes('ABOVE_AVERAGE')) return 'success'
  if (r.includes('BELOW_AVERAGE')) return 'error'
  if (r.includes('AVERAGE')) return 'warning'
  return 'neutral'
}

function rankLabel(ranking: string | null): string {
  if (!ranking) return '-'
  return ranking.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Google: impression share bar width
function isPercent(val: number | null): string {
  if (val == null) return '0%'
  return `${Math.min(val, 100).toFixed(1)}%`
}

// Check if engagement data exists
const hasEngagement = computed(() => {
  const m = props.metrics
  if (isMeta.value) {
    return m.engagements != null || m.postReactions != null || m.postComments != null || m.postShares != null || m.linkClicks != null || m.postSaves != null
  }
  if (isGoogle.value) {
    return m.engagements != null || m.interactions != null
  }
  return false
})

// Check if video funnel data exists
const hasVideoFunnel = computed(() => {
  const m = props.metrics
  return m.videoP25Rate != null || m.videoP50Rate != null || m.videoP75Rate != null || m.videoP100Rate != null
})

// Cost per result
const hasCostPerResult = computed(() => props.metrics.costPerResult != null && props.metrics.resultType)

// Check if any metrics are actually populated
const hasAnyMetric = computed(() => {
  const m = props.metrics
  if (hasCostPerResult.value) return true
  if (isMeta.value) {
    return m.frequency != null || m.reach != null || m.landingPageViews != null || m.videoViews != null ||
           m.qualityRanking != null || m.engagementRateRanking != null || m.conversionRateRanking != null ||
           hasEngagement.value || hasVideoFunnel.value
  }
  if (isGoogle.value) {
    return m.impressionShare != null || m.videoViews != null || m.searchAbsoluteTopIs != null || m.searchClickShare != null || hasEngagement.value || hasVideoFunnel.value
  }
  return false
})
</script>

<template>
  <div v-if="hasAnyMetric" class="space-y-2">
    <!-- Row 1: Platform metrics -->
    <div class="flex flex-wrap items-center gap-2">
      <!-- Cost per Result (both platforms) -->
      <div v-if="hasCostPerResult" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary/10 border border-primary/30">
        <UIcon name="i-lucide-target" class="w-3 h-3 text-primary shrink-0" />
        <span class="text-[10px] text-primary/80 font-medium">{{ metrics.resultType }}</span>
        <span class="text-xs font-bold tabular-nums text-primary">{{ fmtCurrency(metrics.costPerResult, 2) }}</span>
      </div>

      <!-- Meta metrics -->
      <template v-if="isMeta">
        <!-- Frequency -->
        <div v-if="metrics.frequency != null" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-repeat" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">Freq</span>
          <span class="text-xs font-bold tabular-nums" :class="frequencyWarning ? 'text-warning' : 'text-default'">
            {{ metrics.frequency.toFixed(2) }}
          </span>
          <UIcon v-if="frequencyWarning" name="i-lucide-triangle-alert" class="w-3 h-3 text-warning" title="High frequency (>3.0)" />
        </div>

        <!-- Reach -->
        <div v-if="metrics.reach != null" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-users" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">Reach</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.reach) }}</span>
        </div>

        <!-- Landing Page Views -->
        <div v-if="metrics.landingPageViews != null" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-mouse-pointer-click" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">LPV</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.landingPageViews) }}</span>
          <span v-if="lpvRate" class="text-[10px] text-muted">({{ lpvRate }}%)</span>
        </div>

        <!-- Video Views -->
        <div v-if="metrics.videoViews != null && metrics.videoViews > 0" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-play" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">Views</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.videoViews) }}</span>
          <template v-if="metrics.videoThruplay != null && metrics.videoThruplay > 0">
            <span class="text-[10px] text-muted">/</span>
            <span class="text-xs tabular-nums text-muted">{{ fmtCompact(metrics.videoThruplay) }} TP</span>
          </template>
        </div>

        <!-- Quality Rankings -->
        <div v-if="metrics.qualityRanking || metrics.engagementRateRanking || metrics.conversionRateRanking" class="flex items-center gap-1.5">
          <UBadge v-if="metrics.qualityRanking" variant="subtle" :color="rankColor(metrics.qualityRanking)" size="xs" :title="`Quality: ${rankLabel(metrics.qualityRanking)}`">
            Q: {{ rankLabel(metrics.qualityRanking) }}
          </UBadge>
          <UBadge v-if="metrics.engagementRateRanking" variant="subtle" :color="rankColor(metrics.engagementRateRanking)" size="xs" :title="`Engagement: ${rankLabel(metrics.engagementRateRanking)}`">
            E: {{ rankLabel(metrics.engagementRateRanking) }}
          </UBadge>
          <UBadge v-if="metrics.conversionRateRanking" variant="subtle" :color="rankColor(metrics.conversionRateRanking)" size="xs" :title="`Conversion: ${rankLabel(metrics.conversionRateRanking)}`">
            C: {{ rankLabel(metrics.conversionRateRanking) }}
          </UBadge>
        </div>
      </template>

      <!-- Google metrics -->
      <template v-if="isGoogle">
        <!-- Impression Share -->
        <div v-if="metrics.impressionShare != null" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-eye" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">IS</span>
          <div class="flex items-center gap-1.5">
            <div class="w-16 h-1.5 rounded-full bg-default/20 overflow-hidden">
              <div class="h-full rounded-full bg-primary" :style="{ width: isPercent(metrics.impressionShare) }" />
            </div>
            <span class="text-xs font-bold tabular-nums text-default">{{ metrics.impressionShare.toFixed(1) }}%</span>
          </div>
        </div>

        <!-- Lost IS Breakdown -->
        <div v-if="metrics.lostImpressionShareBudget != null || metrics.lostImpressionShareRank != null" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-trending-down" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">Lost IS</span>
          <div class="flex items-center gap-2 text-xs tabular-nums">
            <span v-if="metrics.lostImpressionShareBudget != null" class="text-warning" title="Lost to budget">
              {{ metrics.lostImpressionShareBudget.toFixed(1) }}% budget
            </span>
            <span v-if="metrics.lostImpressionShareRank != null" class="text-error" title="Lost to rank">
              {{ metrics.lostImpressionShareRank.toFixed(1) }}% rank
            </span>
          </div>
        </div>

        <!-- Search Absolute Top IS -->
        <div v-if="metrics.searchAbsoluteTopIs != null" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-arrow-up-to-line" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">Abs Top IS</span>
          <div class="flex items-center gap-1.5">
            <div class="w-12 h-1.5 rounded-full bg-default/20 overflow-hidden">
              <div class="h-full rounded-full bg-success" :style="{ width: isPercent(metrics.searchAbsoluteTopIs) }" />
            </div>
            <span class="text-xs font-bold tabular-nums text-default">{{ metrics.searchAbsoluteTopIs.toFixed(1) }}%</span>
          </div>
        </div>

        <!-- Search Click Share -->
        <div v-if="metrics.searchClickShare != null" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-mouse-pointer-click" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">Click Share</span>
          <div class="flex items-center gap-1.5">
            <div class="w-12 h-1.5 rounded-full bg-default/20 overflow-hidden">
              <div class="h-full rounded-full bg-info" :style="{ width: isPercent(metrics.searchClickShare) }" />
            </div>
            <span class="text-xs font-bold tabular-nums text-default">{{ metrics.searchClickShare.toFixed(1) }}%</span>
          </div>
        </div>

        <!-- Video Views -->
        <div v-if="metrics.videoViews != null && metrics.videoViews > 0" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-elevated/40 border border-default/30">
          <UIcon name="i-lucide-play" class="w-3 h-3 text-muted shrink-0" />
          <span class="text-[10px] text-muted font-medium">Video Views</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.videoViews) }}</span>
        </div>
      </template>
    </div>

    <!-- Row 2: Engagement metrics -->
    <div v-if="hasEngagement" class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1 mr-1">
        <UIcon name="i-lucide-heart" class="w-3 h-3 text-muted" />
        <span class="text-[10px] text-muted font-semibold uppercase tracking-wider">Engagement</span>
      </div>

      <!-- Meta engagement breakdown -->
      <template v-if="isMeta">
        <div v-if="metrics.engagements != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Total</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.engagements) }}</span>
        </div>
        <div v-if="metrics.postReactions != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Reactions</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.postReactions) }}</span>
        </div>
        <div v-if="metrics.postComments != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Comments</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.postComments) }}</span>
        </div>
        <div v-if="metrics.postShares != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Shares</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.postShares) }}</span>
        </div>
        <div v-if="metrics.linkClicks != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Link Clicks</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.linkClicks) }}</span>
        </div>
        <div v-if="metrics.postSaves != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Saves</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.postSaves) }}</span>
        </div>
      </template>

      <!-- Google engagement -->
      <template v-if="isGoogle">
        <div v-if="metrics.engagements != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Engagements</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.engagements) }}</span>
        </div>
        <div v-if="metrics.interactions != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Interactions</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ fmtCompact(metrics.interactions) }}</span>
        </div>
        <div v-if="metrics.interactionRate != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
          <span class="text-[10px] text-muted">Int. Rate</span>
          <span class="text-xs font-bold tabular-nums text-default">{{ metrics.interactionRate.toFixed(2) }}%</span>
        </div>
      </template>
    </div>

    <!-- Row 3: Video funnel -->
    <div v-if="hasVideoFunnel" class="flex items-center gap-2">
      <div class="flex items-center gap-1 mr-1">
        <UIcon name="i-lucide-film" class="w-3 h-3 text-muted" />
        <span class="text-[10px] text-muted font-semibold uppercase tracking-wider">Video Funnel</span>
      </div>
      <div class="flex items-center gap-1">
        <template v-for="(step, idx) in [
          { label: '25%', value: metrics.videoP25Rate },
          { label: '50%', value: metrics.videoP50Rate },
          { label: '75%', value: metrics.videoP75Rate },
          { label: '100%', value: metrics.videoP100Rate },
        ]" :key="step.label">
          <div v-if="step.value != null" class="flex items-center gap-1 px-2 py-1 rounded bg-elevated/40 border border-default/30">
            <span class="text-[10px] text-muted">{{ step.label }}</span>
            <span class="text-xs font-bold tabular-nums text-default">{{ step.value.toFixed(1) }}%</span>
          </div>
          <UIcon
            v-if="step.value != null && idx < 3 && [metrics.videoP25Rate, metrics.videoP50Rate, metrics.videoP75Rate, metrics.videoP100Rate][idx + 1] != null"
            name="i-lucide-chevron-right"
            class="w-3 h-3 text-muted/50"
          />
        </template>
      </div>
    </div>
  </div>
</template>
