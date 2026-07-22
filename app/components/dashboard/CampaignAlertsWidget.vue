<script setup lang="ts">
import { buildCampaignAlerts } from '~/utils/campaignAlerts'

// Fetch campaigns from all 8 platforms using the new analytics endpoint
const now = new Date()
const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

const campaignData = ref<any | null>(null)
const metaData = ref<any | null>(null)
const googleData = ref<any | null>(null)
const campaignStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const metaStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const googleStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshCampaignAlerts() {
  campaignStatus.value = 'pending'
  metaStatus.value = 'pending'
  googleStatus.value = 'pending'

  const [campaignResult, metaResult, googleResult] = await Promise.allSettled([
    apiFetch('/api/agency/analytics/campaigns', {
      query: { startDate, endDate, limit: '100', sortBy: 'spend', sortDir: 'desc' },
    }),
    apiFetch('/api/agency/social/campaign-daily-spend', { query: { platform: 'meta' } }),
    apiFetch('/api/agency/social/campaign-daily-spend', { query: { platform: 'google' } }),
  ])

  if (campaignResult.status === 'fulfilled') {
    campaignData.value = campaignResult.value
    campaignStatus.value = 'success'
  } else {
    console.error('Failed to load campaign analytics alerts', campaignResult.reason)
    campaignStatus.value = 'error'
  }

  if (metaResult.status === 'fulfilled') {
    metaData.value = metaResult.value
    metaStatus.value = 'success'
  } else {
    console.error('Failed to load Meta campaign alerts', metaResult.reason)
    metaStatus.value = 'error'
  }

  if (googleResult.status === 'fulfilled') {
    googleData.value = googleResult.value
    googleStatus.value = 'success'
  } else {
    console.error('Failed to load Google campaign alerts', googleResult.reason)
    googleStatus.value = 'error'
  }
}

// Fallback to old per-platform fetch
await refreshCampaignAlerts()

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
    }))
  }

  // Fallback: merge Meta + Google
  const metaCampaigns = ((metaData.value as any)?.campaigns || []).map((c: any) => ({ ...c, platform: 'meta' }))
  const googleCampaigns = ((googleData.value as any)?.campaigns || []).map((c: any) => ({ ...c, platform: 'google' }))
  return [...metaCampaigns, ...googleCampaigns]
})

const alerts = computed(() => {
  return buildCampaignAlerts(campaigns.value, { now, windowStart: startDate, windowEnd: endDate }).slice(0, 8)
})

type UiColor = 'error' | 'info' | 'success' | 'primary' | 'secondary' | 'warning' | 'neutral'

const severityColors: Record<string, UiColor> = {
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
          <div v-if="alert.spendAmount !== undefined && alert.budgetAmount" class="text-xs text-[var(--ui-text-muted)] mt-0.5">
            <template v-if="alert.budgetScope === 'campaign_total'">
              {{ formatCurrency(alert.spendAmount) }} MTD of {{ formatCurrency(alert.budgetAmount) }} campaign total
            </template>
            <template v-else>
              {{ formatCurrency(alert.spendAmount) }} avg/day · {{ formatCurrency(alert.budgetAmount) }} pacing target
            </template>
          </div>
        </div>
        <UBadge :color="severityColors[alert.severity] || 'neutral'" variant="subtle" size="xs">
          {{ alert.alertType }}
        </UBadge>
      </div>
    </div>
  </UCard>
</template>
