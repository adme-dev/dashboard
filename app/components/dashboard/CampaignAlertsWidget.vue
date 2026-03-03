<script setup lang="ts">
// Fetch campaigns from all 8 platforms using the new analytics endpoint
const now = new Date()
const sevenDaysAgo = new Date(now)
sevenDaysAgo.setDate(now.getDate() - 7)
const startDate = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`
const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const { data: campaignData, status: campaignStatus } = await useFetch('/api/agency/analytics/campaigns', {
  query: { startDate, endDate, limit: '100', sortBy: 'spend', sortDir: 'desc' },
})

// Fallback to old per-platform fetch
const { data: metaData, status: metaStatus } = await useFetch('/api/agency/social/campaign-daily-spend', { query: { platform: 'meta' } })
const { data: googleData, status: googleStatus } = await useFetch('/api/agency/social/campaign-daily-spend', { query: { platform: 'google' } })

const status = computed(() => {
  if (campaignStatus.value === 'pending') return 'pending'
  if (metaStatus.value === 'pending' || googleStatus.value === 'pending') return 'pending'
  return 'success'
})

const campaigns = computed(() => {
  // Try the new analytics endpoint first
  const analyticsResult = campaignData.value as any
  if (analyticsResult?.campaigns?.length) {
    return analyticsResult.campaigns.map((c: any) => ({
      ...c,
      name: c.campaignName,
      dailySpend: c.spend,
      dailyBudget: c.budget,
    }))
  }

  // Fallback: merge Meta + Google
  const metaCampaigns = ((metaData.value as any)?.campaigns || []).map((c: any) => ({ ...c, platform: 'meta' }))
  const googleCampaigns = ((googleData.value as any)?.campaigns || []).map((c: any) => ({ ...c, platform: 'google' }))
  return [...metaCampaigns, ...googleCampaigns]
})

const alerts = computed(() => {
  const result: any[] = []

  for (const c of campaigns.value) {
    const dailyBudget = c.dailyBudget || c.budget || 0
    const dailySpend = c.dailySpend || c.spend || 0
    const zeroDays = c.zeroDays || 0

    if (dailyBudget > 0) {
      const ratio = dailySpend / dailyBudget
      if (ratio > 1.2) {
        result.push({ ...c, alertType: 'overspend', severity: 'error', message: `${((ratio - 1) * 100).toFixed(0)}% over daily budget` })
      } else if (ratio < 0.7 && dailySpend > 0) {
        result.push({ ...c, alertType: 'underspend', severity: 'warning', message: `${((1 - ratio) * 100).toFixed(0)}% under daily budget` })
      }
    }

    if (zeroDays >= 2) {
      result.push({ ...c, alertType: 'inactive', severity: 'error', message: `$0 spend for ${zeroDays} days` })
    }
  }

  return result.slice(0, 8)
})

const severityColors: Record<string, string> = {
  error: 'error',
  warning: 'warning',
}

const alertIcons: Record<string, string> = {
  overspend: 'i-lucide-trending-up',
  underspend: 'i-lucide-trending-down',
  inactive: 'i-lucide-pause-circle',
}

const platformIcons: Record<string, string> = {
  meta: 'i-lucide-facebook',
  google: 'i-lucide-chrome',
  google_ads: 'i-lucide-chrome',
  facebook: 'i-lucide-facebook',
  tiktok: 'i-lucide-music',
  linkedin: 'i-lucide-linkedin',
  pinterest: 'i-lucide-pin',
  snapchat: 'i-lucide-ghost',
  twitter: 'i-lucide-twitter',
  microsoft_ads: 'i-lucide-monitor',
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 text-amber-500" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Campaign Alerts</h3>
          <UBadge v-if="alerts.length" color="error" variant="subtle" size="xs">{{ alerts.length }}</UBadge>
        </div>
        <UButton to="/agency/analytics" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-12 w-full rounded" />
    </div>
    <div v-else-if="!alerts.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
      <p class="text-sm">All campaigns on track</p>
    </div>
    <div v-else class="space-y-2">
      <div v-for="(alert, idx) in alerts" :key="idx" class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-[var(--ui-bg-elevated)] transition-colors">
        <UIcon :name="alertIcons[alert.alertType] || 'i-lucide-alert-triangle'" class="w-4 h-4 shrink-0 mt-0.5" :class="alert.severity === 'error' ? 'text-red-500' : 'text-amber-500'" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <p class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate">{{ alert.campaignName || alert.name }}</p>
            <UIcon v-if="alert.platform" :name="platformIcons[alert.platform?.toLowerCase()] || 'i-lucide-globe'" class="w-3 h-3 text-[var(--ui-text-muted)] shrink-0" />
          </div>
          <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">{{ alert.message }}</p>
          <div v-if="alert.dailySpend !== undefined && alert.dailyBudget" class="text-xs text-[var(--ui-text-muted)] mt-0.5">
            {{ formatCurrency(alert.dailySpend) }} / {{ formatCurrency(alert.dailyBudget) }} daily
          </div>
        </div>
        <UBadge :color="severityColors[alert.severity] || 'neutral'" variant="subtle" size="xs">
          {{ alert.alertType }}
        </UBadge>
      </div>
    </div>
  </UCard>
</template>
