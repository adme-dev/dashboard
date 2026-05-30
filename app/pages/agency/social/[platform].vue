<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const route = useRoute()
const toast = useToast()
const platform = computed(() => route.params.platform as string)

const validPlatforms = ['meta', 'google', 'tiktok', 'linkedin', 'pinterest', 'snapchat', 'twitter', 'microsoft_ads']

const platformConfig = computed(() => {
  const configs: Record<string, { displayName: string; icon: string; bgColor: string; iconColor: string }> = {
    meta: { displayName: 'Meta Ads', icon: 'i-lucide-facebook', bgColor: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600' },
    google: { displayName: 'Google Ads', icon: 'i-lucide-chrome', bgColor: 'bg-red-100 dark:bg-red-900/30', iconColor: 'text-red-500' },
    tiktok: { displayName: 'TikTok Ads', icon: 'i-lucide-music', bgColor: 'bg-gray-100 dark:bg-gray-900/30', iconColor: 'text-gray-700' },
    linkedin: { displayName: 'LinkedIn Ads', icon: 'i-lucide-linkedin', bgColor: 'bg-blue-50 dark:bg-blue-950', iconColor: 'text-blue-600' },
    pinterest: { displayName: 'Pinterest Ads', icon: 'i-lucide-pin', bgColor: 'bg-red-50 dark:bg-red-950', iconColor: 'text-red-600' },
    snapchat: { displayName: 'Snapchat Ads', icon: 'i-lucide-ghost', bgColor: 'bg-yellow-50 dark:bg-yellow-950', iconColor: 'text-yellow-600' },
    twitter: { displayName: 'X (Twitter) Ads', icon: 'i-lucide-at-sign', bgColor: 'bg-gray-50 dark:bg-gray-950', iconColor: 'text-gray-800' },
    microsoft_ads: { displayName: 'Microsoft Ads', icon: 'i-lucide-search', bgColor: 'bg-cyan-50 dark:bg-cyan-950', iconColor: 'text-cyan-600' },
  }
  return configs[platform.value] || configs.meta
})

if (!validPlatforms.includes(platform.value)) {
  navigateTo('/agency/social')
}

const {
  loading, fetchConnections, disconnectConnection,
  syncSpend, fetchAccountSpend, fetchAccountCampaigns,
  updateCampaignBudget, fetchCampaignDailySpend, fetchBudgetHistory,
} = useSocialConnections()

// Client assignment — for linking ad accounts to agency clients
const { data: clientsList } = useLazyFetch('/api/agency/clients')
const clientOptions = computed(() => {
  const clients = (clientsList.value as any) || []
  return [
    { label: 'No client assigned', value: 'none' },
    ...clients.map((c: any) => ({ label: c.name, value: c.id })),
  ]
})

async function assignClient(connectionId: string, clientId: string) {
  try {
    await $fetch(`/api/agency/social/connections/${connectionId}`, {
      method: 'PATCH',
      body: { clientId: clientId === 'none' ? null : clientId },
    })
    // Update local data
    const acct = accountSpend.value.find(a => a.id === connectionId)
    if (acct) {
      acct.clientId = clientId === 'none' ? null : clientId
      const client = (clientsList.value as any)?.find((c: any) => c.id === clientId)
      acct.clientName = client?.name || null
    }
    toast.add({ title: 'Client assigned', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Failed to assign client', description: e.data?.statusMessage || e.message, color: 'error' })
  }
}

// Month/year selector
const now = new Date()
const selectedMonth = ref(now.getMonth() + 1)
const selectedYear = ref(now.getFullYear())

// Week filter (optional — narrows chart/table to a week within the month)
const weekFilter = ref<{ start: string; end: string } | null>(null)

// Account spend data
const accountSpend = ref<any[]>([])
const spendLoading = ref(false)
const syncing = ref(false)

// Bank charges data
const bankCharges = ref<any>(null)
const bankLoading = ref(false)

// Campaign daily spend chart data
const campaignDailyData = ref<{ campaigns: any[]; totals: any[] }>({ campaigns: [], totals: [] })
const chartLoading = ref(false)

// Expanded rows — tracks which account the chart is scoped to
const expandedAccounts = ref<Set<string>>(new Set())
const chartAccountId = ref<string | null>(null) // connectionId driving the chart
const chartAccountName = ref<string | null>(null)
const campaignData = ref<Record<string, any[]>>({})
const campaignLoading = ref<Record<string, boolean>>({})

// Inline budget editing
const editingBudget = ref<string | null>(null) // media_spend id currently editing
const editingBudgetValue = ref('')
const editingCommissionRate = ref('')
const editingRolling = ref(false)

// Budget history
const budgetHistoryId = ref<string | null>(null)
const budgetHistory = ref<any[]>([])
const budgetHistoryLoading = ref(false)

async function toggleBudgetHistory(spendId: string) {
  if (budgetHistoryId.value === spendId) {
    budgetHistoryId.value = null
    return
  }
  budgetHistoryId.value = spendId
  budgetHistoryLoading.value = true
  try {
    budgetHistory.value = await fetchBudgetHistory(spendId)
  } catch {
    budgetHistory.value = []
  } finally {
    budgetHistoryLoading.value = false
  }
}

function formatHistoryTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function startBudgetEdit(camp: any, e: MouseEvent) {
  e.stopPropagation()
  editingBudget.value = camp.id
  editingBudgetValue.value = camp.budget > 0 ? String(camp.budget) : ''
  editingCommissionRate.value = camp.commissionRate > 0 ? String(camp.commissionRate) : ''
  editingRolling.value = camp.rolling || false
  nextTick(() => {
    const input = document.querySelector(`[data-budget-id="${camp.id}"]`) as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

async function saveBudget(camp: any) {
  const val = parseFloat(editingBudgetValue.value)
  const budget = isNaN(val) || val < 0 ? 0 : val
  const commRate = editingCommissionRate.value ? parseFloat(editingCommissionRate.value) : null
  if (commRate != null && (isNaN(commRate) || commRate < 0 || commRate > 100)) {
    toast.add({ title: 'Invalid commission', description: 'Enter a percentage between 0 and 100', color: 'error' })
    return
  }
  editingBudget.value = null

  // Optimistic update
  const rolling = editingRolling.value
  camp.budget = budget
  camp.rolling = rolling
  if (commRate != null) camp.commissionRate = commRate
  try {
    const body: any = { spendIds: [camp.id], budgetAllocated: budget, rolling }
    if (commRate != null) body.commissionRate = commRate
    await $fetch('/api/agency/social/spend/bulk-budget', { method: 'PATCH', body })
  } catch (e: any) {
    toast.add({ title: 'Error saving budget', description: e.data?.statusMessage || e.message, color: 'error' })
    // Reload to revert
    const acctId = Object.keys(campaignData.value).find(k =>
      campaignData.value[k]?.some((c: any) => c.id === camp.id)
    )
    if (acctId) {
      campaignData.value[acctId] = await fetchAccountCampaigns(
        platform.value as 'meta' | 'google' | 'tiktok', acctId, selectedMonth.value, selectedYear.value
      )
    }
  }
}

function cancelBudgetEdit() {
  editingBudget.value = null
  editingCommissionRate.value = ''
  editingRolling.value = false
}

// Summary stats
const summaryStats = computed(() => {
  const data = accountSpend.value
  return {
    totalSpend: data.reduce((s, a) => s + a.totalSpend, 0),
    totalBudget: data.reduce((s, a) => s + (a.totalBudget || 0), 0),
    totalCommission: data.reduce((s, a) => s + (a.totalCommission || 0), 0),
    totalImpressions: data.reduce((s, a) => s + a.totalImpressions, 0),
    totalClicks: data.reduce((s, a) => s + a.totalClicks, 0),
    totalConversions: data.reduce((s, a) => s + a.totalConversions, 0),
  }
})

// Bank charge for this platform
const platformBankTotal = computed(() => {
  if (!bankCharges.value?.connected) return null
  const key = platform.value === 'google' ? 'google_ads' : platform.value
  const xeroTotal = bankCharges.value.byPlatform?.[key]?.total ?? 0
  if (xeroTotal > 0) return xeroTotal
  // Meta billing fallback
  if (key === 'meta' && bankCharges.value.metaBilling?.total) {
    return bankCharges.value.metaBilling.total
  }
  return xeroTotal > 0 ? xeroTotal : null
})

// Latest sync time across all accounts
const lastSyncedAt = computed(() => {
  const times = accountSpend.value
    .map(a => a.lastSyncedAt)
    .filter(Boolean)
    .map(t => new Date(t).getTime())
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null
})

// Week-filtered chart data for the SpendChart
const filteredChartData = computed(() => {
  if (!weekFilter.value) return campaignDailyData.value
  const { start, end } = weekFilter.value
  const filterDaily = (daily: any[]) => daily.filter(d => d.date >= start && d.date <= end)
  return {
    campaigns: campaignDailyData.value.campaigns?.map((c: any) => ({
      ...c,
      daily: filterDaily(c.daily || []),
    })) || [],
    totals: (campaignDailyData.value.totals || []).filter((t: any) => t.date >= start && t.date <= end),
    estimated: campaignDailyData.value.estimated,
  }
})

// Sorted accounts: non-zero spend first, then zero spend muted
const sortedAccounts = computed(() => {
  const withSpend = accountSpend.value.filter(a => a.totalSpend > 0)
  const noSpend = accountSpend.value.filter(a => a.totalSpend <= 0)
  return [...withSpend, ...noSpend]
})

async function loadBankCharges() {
  bankLoading.value = true
  try {
    bankCharges.value = await $fetch('/api/agency/social/spend/bank-charges', {
      query: { month: selectedMonth.value, year: selectedYear.value },
    })
  } catch {
    bankCharges.value = null
  } finally {
    bankLoading.value = false
  }
}

async function loadSpendData() {
  spendLoading.value = true
  chartLoading.value = true
  try {
    const [accounts, chartData] = await Promise.all([
      fetchAccountSpend(platform.value as 'meta' | 'google' | 'tiktok', selectedMonth.value, selectedYear.value),
      fetchCampaignDailySpend(platform.value as 'meta' | 'google' | 'tiktok', selectedMonth.value, selectedYear.value).catch((err) => {
        console.error('[CampaignDailySpend] fetch failed:', err)
        return { campaigns: [], totals: [] }
      }),
    ])
    accountSpend.value = accounts
    campaignDailyData.value = chartData
  } catch (e: any) {
    toast.add({ title: 'Error loading spend', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    spendLoading.value = false
    chartLoading.value = false
  }
}

async function handleSyncAll() {
  syncing.value = true
  try {
    await syncSpend(platform.value as 'meta' | 'google' | 'tiktok', selectedMonth.value, selectedYear.value)
    toast.add({
      title: 'Sync started',
      description: `${platformConfig.value.displayName} spend sync is running in the background.`,
      color: 'success',
    })
  } catch (e: any) {
    toast.add({ title: 'Sync failed', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    syncing.value = false
  }
}

async function toggleExpand(accountId: string) {
  if (expandedAccounts.value.has(accountId)) {
    expandedAccounts.value.delete(accountId)
    // If this was the chart account, revert to global
    if (chartAccountId.value === accountId) {
      chartAccountId.value = null
      chartAccountName.value = null
      loadChartData()
    }
    return
  }

  expandedAccounts.value.add(accountId)

  // Scope chart to this account
  const acct = accountSpend.value.find((a: any) => a.id === accountId)
  chartAccountId.value = accountId
  chartAccountName.value = acct?.accountName || null
  loadChartData(accountId)

  if (!campaignData.value[accountId]) {
    campaignLoading.value[accountId] = true
    try {
      campaignData.value[accountId] = await fetchAccountCampaigns(
        platform.value as 'meta' | 'google' | 'tiktok', accountId, selectedMonth.value, selectedYear.value
      )
    } catch (e: any) {
      toast.add({ title: 'Error', description: e.data?.statusMessage || e.message, color: 'error' })
      expandedAccounts.value.delete(accountId)
    } finally {
      campaignLoading.value[accountId] = false
    }
  }
}

async function loadChartData(connectionId?: string) {
  chartLoading.value = true
  try {
    campaignDailyData.value = await fetchCampaignDailySpend(
      platform.value as 'meta' | 'google' | 'tiktok', selectedMonth.value, selectedYear.value, connectionId
    )
  } catch (err) {
    console.error('[CampaignDailySpend] fetch failed:', err)
    campaignDailyData.value = { campaigns: [], totals: [] }
  } finally {
    chartLoading.value = false
  }
}

// Reload when month/year changes
watch([selectedMonth, selectedYear], () => {
  expandedAccounts.value.clear()
  campaignData.value = {}
  chartAccountId.value = null
  chartAccountName.value = null
  weekFilter.value = null
  loadSpendData()
  loadBankCharges()
})

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatNumber(val: number) {
  return val.toLocaleString('en-AU')
}

function formatSyncTime(syncedAt: string | null) {
  if (!syncedAt) return 'Never'
  const d = new Date(syncedAt)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(mins / 60)

  // Relative label
  let relative: string
  if (mins < 1) relative = 'Just now'
  else if (mins < 60) relative = `${mins}m ago`
  else if (hours < 24) relative = `${hours}h ${mins % 60}m ago`
  else relative = `${Math.floor(hours / 24)}d ago`

  // Exact time (HH:MM)
  const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${relative} (${time})`
}

function channelTypeBadge(type: string | null) {
  const map: Record<string, { label: string; color: string }> = {
    // Google Ads campaign types
    SEARCH: { label: 'Search', color: 'info' },
    PERFORMANCE_MAX: { label: 'PMax', color: 'primary' },
    VIDEO: { label: 'Video', color: 'error' },
    DISPLAY: { label: 'Display', color: 'success' },
    SHOPPING: { label: 'Shopping', color: 'warning' },
    DISCOVERY: { label: 'Discovery', color: 'neutral' },
    DEMAND_GEN: { label: 'Demand Gen', color: 'neutral' },
    // TikTok campaign types (objective-based)
    TRAFFIC: { label: 'Traffic', color: 'info' },
    CONVERSIONS: { label: 'Conversions', color: 'primary' },
    APP_INSTALL: { label: 'App Install', color: 'success' },
    REACH: { label: 'Reach', color: 'neutral' },
    VIDEO_VIEWS: { label: 'Video Views', color: 'error' },
    LEAD_GENERATION: { label: 'Lead Gen', color: 'warning' },
    CATALOG_SALES: { label: 'Catalog', color: 'warning' },
    ENGAGEMENT: { label: 'Engagement', color: 'success' },
  }
  if (!type) return null
  return map[type] || { label: type, color: 'neutral' }
}

function campaignStatusBadge(status: string | null) {
  const map: Record<string, { label: string; color: string }> = {
    // Google Ads statuses
    ENABLED: { label: 'Enabled', color: 'success' },
    PAUSED: { label: 'Paused', color: 'warning' },
    REMOVED: { label: 'Removed', color: 'error' },
    // Meta statuses
    ACTIVE: { label: 'Active', color: 'success' },
    ARCHIVED: { label: 'Archived', color: 'neutral' },
    CAMPAIGN_PAUSED: { label: 'Paused', color: 'warning' },
    ADSET_PAUSED: { label: 'Paused', color: 'warning' },
    IN_PROCESS: { label: 'In process', color: 'info' },
    WITH_ISSUES: { label: 'With issues', color: 'warning' },
    DISAPPROVED: { label: 'Disapproved', color: 'error' },
    // TikTok statuses
    CAMPAIGN_STATUS_ENABLE: { label: 'Enabled', color: 'success' },
    CAMPAIGN_STATUS_DISABLE: { label: 'Disabled', color: 'warning' },
    CAMPAIGN_STATUS_DELETE: { label: 'Deleted', color: 'error' },
    CAMPAIGN_STATUS_ADVERTISER_AUDIT_DENY: { label: 'Audit Denied', color: 'error' },
    CAMPAIGN_STATUS_ADVERTISER_AUDIT: { label: 'In Review', color: 'warning' },
  }
  if (!status) return null
  return map[status] || { label: status, color: 'neutral' }
}

onMounted(async () => {
  await fetchConnections()
  loadSpendData()
  loadBankCharges()
})

// Disconnect confirmation modal
const disconnectTarget = ref<{ id: string; name: string } | null>(null)
const disconnecting = ref(false)
const showDisconnectModal = computed({
  get: () => !!disconnectTarget.value,
  set: (val: boolean) => { if (!val) disconnectTarget.value = null },
})

function handleDisconnect(connectionId: string) {
  const acct = accountSpend.value.find(a => a.id === connectionId)
  disconnectTarget.value = { id: connectionId, name: acct?.accountName || 'this account' }
}

async function confirmDisconnect() {
  if (!disconnectTarget.value) return
  disconnecting.value = true
  try {
    await disconnectConnection(disconnectTarget.value.id)
    toast.add({ title: 'Disconnected', description: `${disconnectTarget.value.name} disconnected`, color: 'success' })
    disconnectTarget.value = null
    loadSpendData()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    disconnecting.value = false
  }
}

// ---------------------------- Lead webhooks (Google only) ----------------------------
interface LeadEndpoint {
  id: string
  client_id: string
  client_name: string
  url_token: string
  secret_key: string
  secret_key_grace_until: string | null
  rotated_at: string | null
  lead_count: string
}

const { data: endpointsData, refresh: refreshEndpoints } = useFetch<{ items: LeadEndpoint[] }>(
  '/api/leads/endpoints/list',
  { default: () => ({ items: [] }) },
)
const endpoints = computed(() => endpointsData.value?.items ?? [])
const revealed = reactive<Record<string, boolean>>({})

function urlFor(token: string): string {
  // Use window.location for the host on the client; fall back during SSR.
  const host = typeof window !== 'undefined'
    ? window.location.origin
    : (import.meta.env.VITE_PUBLIC_BASE_URL ?? '')
  return `${host}/api/leads/webhook/google/${token}`
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copied', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}

async function rotateEndpointKey(ep: LeadEndpoint) {
  await $fetch(`/api/leads/endpoints/${ep.id}/rotate`, { method: 'POST' })
  toast.add({ title: 'Key rotated — old key valid 30 more min', color: 'success' })
  await refreshEndpoints()
}
</script>

<template>
  <div class="flex-1 overflow-auto">
    <!-- Header -->
    <div class="border-b border-default bg-elevated/50 px-6 py-5">
      <div class="flex items-center gap-2 text-sm text-muted mb-3">
        <NuxtLink to="/agency/social" class="hover:text-default transition-colors">Connections</NuxtLink>
        <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5" />
        <span class="text-default font-medium">{{ platformConfig.displayName }}</span>
      </div>
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="platformConfig.bgColor">
          <UIcon :name="platformConfig.icon" class="w-5 h-5" :class="platformConfig.iconColor" />
        </div>
        <div>
          <h1 class="text-xl font-semibold">{{ platformConfig.displayName }}</h1>
          <p class="text-sm text-muted mt-0.5">
            {{ accountSpend.length }} ad account{{ accountSpend.length !== 1 ? 's' : '' }} connected
          </p>
        </div>
      </div>

      <!-- Period picker + week filter + sync -->
      <div class="flex items-center gap-2 flex-wrap">
        <SocialSpendPeriodPicker
          v-model:month="selectedMonth"
          v-model:year="selectedYear"
          v-model:week-filter="weekFilter"
          :last-synced-at="lastSyncedAt"
          :syncing="syncing"
          @sync="handleSyncAll"
        />
      </div>
    </div>

    <div class="p-6">
      <div v-if="loading || spendLoading" class="flex justify-center py-16">
        <XfLoader size="sm" />
      </div>

      <div v-else-if="accountSpend.length === 0" class="text-center py-16">
        <div class="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" :class="platformConfig.bgColor">
          <UIcon :name="platformConfig.icon" class="w-7 h-7" :class="platformConfig.iconColor" />
        </div>
        <p class="text-sm text-muted mb-4">No {{ platformConfig.displayName }} accounts connected.</p>
        <UButton color="primary" to="/agency/social">Go to Connections</UButton>
      </div>

      <template v-else>
        <!-- Daily Spend Chart -->
        <div class="mb-6">
          <SocialSpendChart :campaigns="filteredChartData.campaigns" :totals="filteredChartData.totals" :loading="chartLoading" :account-name="chartAccountName" :estimated="filteredChartData.estimated" />
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <div class="border border-default rounded-xl p-4 bg-elevated/30">
            <p class="text-xs text-muted uppercase tracking-wide">Total Spend</p>
            <p class="text-2xl font-semibold mt-1">{{ formatCurrency(summaryStats.totalSpend) }}</p>
          </div>
          <div class="border border-default rounded-xl p-4 bg-elevated/30">
            <p class="text-xs text-muted uppercase tracking-wide">Total Budget</p>
            <p class="text-2xl font-semibold mt-1">{{ summaryStats.totalBudget > 0 ? formatCurrency(summaryStats.totalBudget) : '-' }}</p>
          </div>
          <div v-if="platformBankTotal != null" class="border border-default rounded-xl p-4 bg-elevated/30">
            <p class="text-xs text-muted uppercase tracking-wide">Bank Charged</p>
            <p class="text-2xl font-semibold mt-1">{{ formatCurrency(platformBankTotal) }}</p>
            <p v-if="summaryStats.totalSpend > 0" class="text-xs mt-1" :class="Math.abs(platformBankTotal - summaryStats.totalSpend) > summaryStats.totalSpend * 0.05 ? 'text-amber-500' : 'text-green-500'">
              {{ platformBankTotal > summaryStats.totalSpend ? '+' : '' }}{{ formatCurrency(platformBankTotal - summaryStats.totalSpend) }} vs reported
            </p>
          </div>
          <div v-if="summaryStats.totalCommission > 0" class="border border-default rounded-xl p-4 bg-elevated/30">
            <p class="text-xs text-muted uppercase tracking-wide">Commission</p>
            <p class="text-2xl font-semibold mt-1">{{ formatCurrency(summaryStats.totalCommission) }}</p>
          </div>
          <div class="border border-default rounded-xl p-4 bg-elevated/30">
            <p class="text-xs text-muted uppercase tracking-wide">Impressions</p>
            <p class="text-2xl font-semibold mt-1">{{ formatNumber(summaryStats.totalImpressions) }}</p>
          </div>
          <div class="border border-default rounded-xl p-4 bg-elevated/30">
            <p class="text-xs text-muted uppercase tracking-wide">Clicks</p>
            <p class="text-2xl font-semibold mt-1">{{ formatNumber(summaryStats.totalClicks) }}</p>
          </div>
          <div class="border border-default rounded-xl p-4 bg-elevated/30">
            <p class="text-xs text-muted uppercase tracking-wide">Conversions</p>
            <p class="text-2xl font-semibold mt-1">{{ formatNumber(summaryStats.totalConversions) }}</p>
          </div>
        </div>

        <!-- Accounts Table -->
        <div class="border border-default rounded-xl overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-default bg-elevated/50">
                <th class="w-8 px-3 py-3"></th>
                <th class="text-left px-4 py-3 font-medium text-muted">Account Name</th>
                <th class="text-right px-4 py-3 font-medium text-muted">Campaigns</th>
                <th class="text-right px-4 py-3 font-medium text-muted">Spend</th>
                <th class="text-right px-4 py-3 font-medium text-muted">Budget</th>
                <th class="text-right px-4 py-3 font-medium text-muted">Commission</th>
                <th class="text-right px-4 py-3 font-medium text-muted">Impressions</th>
                <th class="text-right px-4 py-3 font-medium text-muted">Clicks</th>
                <th class="text-right px-4 py-3 font-medium text-muted">Conv.</th>
                <th class="text-left px-4 py-3 font-medium text-muted">Client</th>
                <th class="text-left px-4 py-3 font-medium text-muted">Last Synced</th>
                <th class="text-right px-4 py-3 font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="acct in sortedAccounts" :key="acct.id">
                <!-- Account row -->
                <tr
                  class="border-b border-default cursor-pointer hover:bg-elevated/30 transition-colors"
                  :class="{ 'opacity-40': acct.totalSpend <= 0 }"
                  @click="toggleExpand(acct.id)"
                >
                  <td class="px-3 py-3 text-center">
                    <UIcon
                      :name="expandedAccounts.has(acct.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                      class="w-4 h-4 text-muted transition-transform"
                    />
                  </td>
                  <td class="px-4 py-3">
                    <p class="font-medium">{{ acct.accountName || 'Unnamed' }}</p>
                    <p class="text-xs text-muted">{{ acct.accountId }}</p>
                  </td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ acct.campaignCount }}</td>
                  <td class="px-4 py-3 text-right tabular-nums font-medium">{{ formatCurrency(acct.totalSpend) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums text-muted">{{ acct.totalBudget > 0 ? formatCurrency(acct.totalBudget) : '-' }}</td>
                  <td class="px-4 py-3 text-right tabular-nums text-muted">
                    <template v-if="acct.totalCommission > 0">
                      {{ formatCurrency(acct.totalCommission) }}
                      <span v-if="acct.commissionRate" class="text-xs block">{{ acct.commissionRate }}%</span>
                    </template>
                    <span v-else>-</span>
                  </td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ formatNumber(acct.totalImpressions) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ formatNumber(acct.totalClicks) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ formatNumber(acct.totalConversions) }}</td>
                  <td class="px-4 py-3" @click.stop>
                    <USelectMenu
                      :model-value="acct.clientId || 'none'"
                      :items="clientOptions"
                      value-key="value"
                      class="w-44"
                      size="xs"
                      @update:model-value="(val: string) => assignClient(acct.id, val)"
                    />
                  </td>
                  <td class="px-4 py-3 text-muted">{{ formatSyncTime(acct.lastSyncedAt) }}</td>
                  <td class="px-4 py-3 text-right" @click.stop>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-unplug"
                      @click="handleDisconnect(acct.id)"
                    />
                  </td>
                </tr>

                <!-- Expanded campaigns sub-rows -->
                <tr v-if="expandedAccounts.has(acct.id)" :key="acct.id + '-campaigns'">
                  <td colspan="12" class="p-0">
                    <div class="bg-elevated/20 border-b border-default">
                      <div v-if="campaignLoading[acct.id]" class="flex justify-center py-6">
                        <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-muted" />
                      </div>
                      <div v-else-if="!campaignData[acct.id]?.length" class="text-center py-6 text-sm text-muted">
                        No campaign data for this period.
                      </div>
                      <table v-else class="w-full text-sm">
                        <thead>
                          <tr class="border-b border-default/50">
                            <th class="w-8"></th>
                            <th class="text-left px-4 py-2 font-medium text-muted text-xs">Campaign</th>
                            <th v-if="platform === 'google' || platform === 'tiktok'" class="text-left px-4 py-2 font-medium text-muted text-xs">Type</th>
                            <th v-if="platform === 'google' || platform === 'tiktok' || platform === 'meta'" class="text-left px-4 py-2 font-medium text-muted text-xs">Status</th>
                            <th v-if="platform === 'meta'" class="text-right px-4 py-2 font-medium text-muted text-xs">Health</th>
                            <th class="text-right px-4 py-2 font-medium text-muted text-xs">Spend</th>
                            <th class="text-right px-4 py-2 font-medium text-muted text-xs">Budget</th>
                            <th class="text-right px-4 py-2 font-medium text-muted text-xs">Variance</th>
                            <th class="text-right px-4 py-2 font-medium text-muted text-xs">Commission</th>
                            <th class="text-right px-4 py-2 font-medium text-muted text-xs">Impressions</th>
                            <th class="text-right px-4 py-2 font-medium text-muted text-xs">Clicks</th>
                            <th class="text-right px-4 py-2 font-medium text-muted text-xs">Conv.</th>
                            <th v-if="platform === 'meta'" class="text-right px-4 py-2 font-medium text-muted text-xs">Cost / result</th>
                            <th v-if="platform === 'meta'" class="text-right px-4 py-2 font-medium text-muted text-xs">Ends</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="camp in campaignData[acct.id]"
                            :key="camp.campaignId"
                            class="border-b border-default/30 last:border-b-0 hover:bg-elevated/40 transition-colors"
                          >
                            <td class="w-8"></td>
                            <td class="px-4 py-2">
                              <p class="font-medium text-sm">{{ camp.campaignName }}</p>
                              <p class="text-xs text-muted">{{ camp.campaignId }}</p>
                            </td>
                            <td v-if="platform === 'google' || platform === 'tiktok'" class="px-4 py-2">
                              <UBadge
                                v-if="channelTypeBadge(camp.campaignType)"
                                :color="channelTypeBadge(camp.campaignType)!.color as any"
                                variant="subtle"
                                size="xs"
                              >
                                {{ channelTypeBadge(camp.campaignType)!.label }}
                              </UBadge>
                              <span v-else class="text-xs text-muted">-</span>
                            </td>
                            <td v-if="platform === 'google' || platform === 'tiktok' || platform === 'meta'" class="px-4 py-2">
                              <UBadge
                                v-if="campaignStatusBadge(camp.campaignStatus)"
                                :color="campaignStatusBadge(camp.campaignStatus)!.color as any"
                                variant="subtle"
                                size="xs"
                              >
                                {{ campaignStatusBadge(camp.campaignStatus)!.label }}
                              </UBadge>
                              <span v-else class="text-xs text-muted">-</span>
                            </td>
                            <td v-if="platform === 'meta'" class="px-4 py-2 text-right">
                              <UTooltip v-if="(camp as any).health && (camp as any).health.verdict !== 'no-target'" :text="((camp as any).health.reasons || []).join(' · ') || healthLabel((camp as any).health.verdict)">
                                <UBadge variant="subtle" :color="healthColor((camp as any).health.verdict)" size="xs">
                                  <span v-if="(camp as any).health.score != null" class="tabular-nums mr-1">{{ (camp as any).health.score }}</span>{{ healthLabel((camp as any).health.verdict) }}
                                </UBadge>
                              </UTooltip>
                              <span v-else class="text-muted text-xs">{{ (camp as any).health ? healthLabel((camp as any).health.verdict) : '-' }}</span>
                            </td>
                            <td class="px-4 py-2 text-right tabular-nums">{{ formatCurrency(camp.spend) }}</td>
                            <!-- Budget (inline-editable) -->
                            <td class="px-4 py-2 text-right tabular-nums relative" @click.stop>
                              <div v-if="editingBudget === camp.id" class="flex flex-col items-end gap-1">
                                <div class="flex items-center gap-1">
                                  <input
                                    :data-budget-id="camp.id"
                                    v-model="editingBudgetValue"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    class="w-24 text-right text-sm border border-primary rounded px-2 py-0.5 bg-default tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                                    @keydown.enter.prevent="saveBudget(camp)"
                                    @keydown.escape.prevent="cancelBudgetEdit()"
                                  />
                                  <UButton size="xs" variant="soft" color="primary" icon="i-lucide-check" @click="saveBudget(camp)" />
                                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="cancelBudgetEdit()" />
                                </div>
                                <div class="flex items-center gap-1">
                                  <span class="text-xs text-muted">Comm.</span>
                                  <input
                                    v-model="editingCommissionRate"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.5"
                                    placeholder="0"
                                    class="w-16 text-right text-sm rounded border border-default bg-default px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                                    @keydown.enter.prevent="saveBudget(camp)"
                                    @keydown.escape.prevent="cancelBudgetEdit()"
                                  />
                                  <span class="text-xs text-muted">%</span>
                                </div>
                                <label class="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
                                  <UCheckbox v-model="editingRolling" />
                                  <span>Rolling</span>
                                </label>
                              </div>
                              <div v-else class="flex flex-col items-end gap-0.5">
                                <div class="flex items-center gap-1">
                                  <span
                                    class="cursor-pointer hover:text-primary transition-colors"
                                    :class="camp.budget > 0 ? '' : 'text-muted italic'"
                                    @click="startBudgetEdit(camp, $event)"
                                  >
                                    {{ camp.budget > 0 ? formatCurrency(camp.budget) : 'Set budget' }}
                                  </span>
                                  <button
                                    v-if="camp.budget > 0"
                                    class="p-0.5 rounded hover:bg-elevated/60 text-muted hover:text-default transition-colors"
                                    title="Budget history"
                                    @click="toggleBudgetHistory(camp.id)"
                                  >
                                    <UIcon name="i-lucide-history" class="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <UBadge v-if="camp.rolling" size="xs" color="info" variant="subtle" class="gap-0.5">
                                  <UIcon name="i-lucide-repeat" class="size-3" />
                                  Rolling
                                </UBadge>
                              </div>
                              <!-- Budget history dropdown -->
                              <div
                                v-if="budgetHistoryId === camp.id"
                                class="absolute right-0 mt-1 z-20 w-72 bg-elevated border border-default rounded-lg shadow-lg p-3 text-left"
                              >
                                <div class="flex items-center justify-between mb-2">
                                  <span class="text-xs font-medium">Budget History</span>
                                  <button class="text-muted hover:text-default" @click="budgetHistoryId = null">
                                    <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div v-if="budgetHistoryLoading" class="text-xs text-muted py-2 text-center">Loading...</div>
                                <div v-else-if="budgetHistory.length === 0" class="text-xs text-muted py-2 text-center">No changes recorded</div>
                                <div v-else class="space-y-2 max-h-48 overflow-y-auto">
                                  <div v-for="entry in budgetHistory" :key="entry.id" class="flex items-start gap-2 text-xs">
                                    <UAvatar v-if="entry.changedByAvatar" :src="entry.changedByAvatar" size="2xs" />
                                    <UIcon v-else name="i-lucide-user" class="w-4 h-4 text-muted mt-0.5 shrink-0" />
                                    <div class="min-w-0">
                                      <span class="font-medium">{{ entry.changedByName }}</span>
                                      <span class="text-muted"> changed </span>
                                      <span class="line-through text-muted">{{ formatCurrency(entry.previousBudget) }}</span>
                                      <span class="text-muted"> → </span>
                                      <span class="font-medium">{{ formatCurrency(entry.newBudget) }}</span>
                                      <div class="text-muted">{{ formatHistoryTime(entry.changedAt) }}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <!-- Variance (spend - budget) -->
                            <td class="px-4 py-2 text-right tabular-nums">
                              <template v-if="camp.budget > 0">
                                <span
                                  :class="camp.spend - camp.budget > 0 ? 'text-red-500' : 'text-green-500'"
                                  class="font-medium"
                                >
                                  {{ camp.spend - camp.budget > 0 ? '+' : '' }}{{ formatCurrency(camp.spend - camp.budget) }}
                                </span>
                              </template>
                              <span v-else class="text-muted">-</span>
                            </td>
                            <!-- Commission -->
                            <td class="px-4 py-2 text-right tabular-nums">
                              <template v-if="camp.commissionRate > 0">
                                <span class="font-medium">{{ formatCurrency(camp.spend * camp.commissionRate / 100) }}</span>
                                <span class="text-xs text-muted block">{{ camp.commissionRate }}%</span>
                              </template>
                              <span v-else class="text-muted">-</span>
                            </td>
                            <td class="px-4 py-2 text-right tabular-nums">{{ formatNumber(camp.impressions) }}</td>
                            <td class="px-4 py-2 text-right tabular-nums">{{ formatNumber(camp.clicks) }}</td>
                            <td class="px-4 py-2 text-right tabular-nums">
                              <div class="flex flex-col items-end leading-tight">
                                <span>{{ formatNumber(camp.conversions) }}</span>
                                <span v-if="platform === 'meta' && camp.resultType" class="text-[10px] text-muted">{{ camp.resultType }}</span>
                              </div>
                            </td>
                            <td v-if="platform === 'meta'" class="px-4 py-2 text-right tabular-nums">
                              {{ camp.costPerResult != null ? formatCurrency(camp.costPerResult) : '-' }}
                            </td>
                            <td v-if="platform === 'meta'" class="px-4 py-2 text-right tabular-nums">
                              <template v-if="camp.endDate">
                                <div class="flex flex-col items-end leading-tight">
                                  <span>{{ endDateInfo(camp.endDate).label }}</span>
                                  <span v-if="endDateInfo(camp.endDate).hint" class="text-[10px] font-medium" :class="endDateInfo(camp.endDate).tone === 'error' ? 'text-error' : 'text-warning'">{{ endDateInfo(camp.endDate).hint }}</span>
                                </div>
                              </template>
                              <span v-else class="text-muted">-</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- Lead webhooks (Google only) -->
    <section v-if="platform === 'google'" class="mt-8 border-t border-default pt-6 px-6 pb-6">
      <h2 class="text-base font-semibold mb-1">Lead webhooks</h2>
      <p class="text-sm text-muted mb-4">
        Per-client webhook URLs for Google Ads Lead Form integration.
        Paste these into the lead form asset's "Webhook integration" panel in Google Ads.
      </p>

      <div class="space-y-3">
        <UCard v-for="ep in endpoints" :key="ep.id">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-medium">{{ ep.client_name }}</h3>
              <UBadge variant="soft" size="sm" :color="Number(ep.lead_count) > 0 ? 'success' : 'neutral'">
                {{ Number(ep.lead_count) > 0 ? `${ep.lead_count} lead(s)` : 'no leads yet' }}
              </UBadge>
            </div>
          </template>
          <div class="space-y-3">
            <div>
              <label class="text-xs text-muted">Webhook URL</label>
              <div class="flex items-center gap-2">
                <UInput :model-value="urlFor(ep.url_token)" readonly class="font-mono text-xs flex-1" />
                <UButton size="xs" icon="i-lucide-copy" variant="ghost" @click="copyText(urlFor(ep.url_token))" />
              </div>
            </div>
            <div>
              <label class="text-xs text-muted">Webhook key</label>
              <div class="flex items-center gap-2">
                <UInput
                  :type="revealed[ep.id] ? 'text' : 'password'"
                  :model-value="ep.secret_key"
                  readonly
                  class="font-mono text-xs flex-1"
                />
                <UButton
                  size="xs"
                  :icon="revealed[ep.id] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  variant="ghost"
                  @click="revealed[ep.id] = !revealed[ep.id]"
                />
                <UButton size="xs" icon="i-lucide-copy" variant="ghost" @click="copyText(ep.secret_key)" />
              </div>
              <p
                v-if="ep.secret_key_grace_until && new Date(ep.secret_key_grace_until) > new Date()"
                class="text-xs text-warning mt-1"
              >
                Previous key still valid until {{ new Date(ep.secret_key_grace_until).toLocaleTimeString() }}.
              </p>
            </div>
            <div class="flex justify-end">
              <UButton size="xs" variant="ghost" icon="i-lucide-rotate-cw" @click="rotateEndpointKey(ep)">Rotate key</UButton>
            </div>
          </div>
        </UCard>
        <p v-if="!endpoints.length" class="text-sm text-muted">
          No webhook endpoints provisioned yet. Endpoints are created automatically when an admin adds a client.
        </p>
      </div>

      <UAlert
        class="mt-6"
        icon="i-lucide-info"
        title="How to wire this up"
        description="In Google Ads → Assets → Lead form → Webhook integration: paste the URL and Key above, then click 'Send test data'. The card's 'lead(s)' badge updates when traffic arrives."
        variant="soft"
        color="info"
      />
    </section>

    <!-- Disconnect Confirmation Modal -->
    <UModal v-model:open="showDisconnectModal">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-start gap-3">
            <div class="shrink-0 mt-0.5 w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
              <UIcon name="i-lucide-unplug" class="w-5 h-5 text-error" />
            </div>
            <div>
              <h3 class="text-lg font-semibold">Disconnect Account</h3>
              <p class="text-sm text-muted mt-1">
                Are you sure you want to disconnect <strong>{{ disconnectTarget?.name }}</strong>?
              </p>
            </div>
          </div>

          <div class="bg-default/50 rounded-lg px-4 py-3 text-sm text-muted flex items-start gap-2">
            <UIcon name="i-lucide-info" class="w-4 h-4 shrink-0 mt-0.5" />
            <span>Historical spend data will be preserved. You can reconnect this account later.</span>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="disconnectTarget = null">
              Cancel
            </UButton>
            <UButton
              color="error"
              :loading="disconnecting"
              icon="i-lucide-unplug"
              @click="confirmDisconnect"
            >
              Disconnect
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
