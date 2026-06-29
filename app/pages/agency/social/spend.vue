<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

const toast = useToast()
const route = useRoute()
const router = useRouter()
const {
  fetchSpendSummary,
  fetchSpendControlDiagnostics,
  fetchPacingReview,
  fetchBudgetControlSettings,
  updateBudgetControlSettings,
  syncSpend,
} = useSocialConnections()

const now = new Date()
const selectedMonth = ref(parseInt(String(route.query.month || now.getMonth() + 1), 10))
const selectedYear = ref(parseInt(String(route.query.year || now.getFullYear()), 10))
const selectedPlatform = ref(String(route.query.platform || 'all'))
const weekFilter = ref<{ start: string; end: string } | null>(null)
const loading = ref(false)
const syncing = ref(false)
const searchQuery = ref('')

const spendData = ref<any>(null)
const spendDiagnostics = ref<any>(null)
const bankCharges = ref<any>(null)
const pacingReview = ref<any>(null)
const pacingReviewLoading = ref(false)
const diagnosticsLoading = ref(false)
const budgetControlSettings = ref({
  liveBudgetChangesEnabled: false,
  metaBudgetWritesEnabled: false,
  googleBudgetWritesEnabled: false,
})
const budgetControlLoading = ref(false)
const budgetControlSaving = ref(false)
const bankLoading = ref(false)

const platformOptions = [
  { label: 'All', value: 'all' },
  { label: 'Meta', value: 'meta' },
  { label: 'Google', value: 'google' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Pinterest', value: 'pinterest' },
  { label: 'Snapchat', value: 'snapchat' },
  { label: 'X (Twitter)', value: 'twitter' },
  { label: 'Microsoft', value: 'microsoft_ads' },
]

const showImportModal = ref(false)
const showAccountMapping = ref(false)

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val)
}

async function loadSpend(refresh = false) {
  loading.value = true
  try {
    spendData.value = await fetchSpendSummary(selectedMonth.value, selectedYear.value, selectedPlatform.value, refresh)
  } catch (e: any) {
    toast.add({ title: 'Error loading spend', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function loadPacingReview() {
  if (!showPacingReview.value) {
    pacingReview.value = null
    return
  }
  pacingReviewLoading.value = true
  try {
    pacingReview.value = await fetchPacingReview(selectedMonth.value, selectedYear.value, selectedPlatform.value)
  } catch (e: any) {
    pacingReview.value = null
    toast.add({ title: 'Error loading pacing review', description: e.message, color: 'error' })
  } finally {
    pacingReviewLoading.value = false
  }
}

async function loadSpendDiagnostics() {
  diagnosticsLoading.value = true
  try {
    spendDiagnostics.value = await fetchSpendControlDiagnostics(selectedMonth.value, selectedYear.value, selectedPlatform.value)
  } catch (e: any) {
    spendDiagnostics.value = null
    toast.add({ title: 'Error loading spend diagnostics', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    diagnosticsLoading.value = false
  }
}

async function loadBudgetControlSettings() {
  budgetControlLoading.value = true
  try {
    budgetControlSettings.value = await fetchBudgetControlSettings()
  } catch (e: any) {
    toast.add({ title: 'Error loading budget control', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    budgetControlLoading.value = false
  }
}

async function setLiveBudgetChanges(enabled: boolean) {
  const previous = { ...budgetControlSettings.value }
  budgetControlSaving.value = true
  budgetControlSettings.value = {
    liveBudgetChangesEnabled: enabled,
    metaBudgetWritesEnabled: enabled,
    googleBudgetWritesEnabled: enabled,
  }
  try {
    const result = await updateBudgetControlSettings(budgetControlSettings.value)
    budgetControlSettings.value = result.config
    toast.add({
      title: enabled ? 'Live budget changes armed' : 'Recommend-only mode enabled',
      description: enabled
        ? 'Meta and Google budget changes are armed, but platform execution still requires the server write layer.'
        : 'AI pacing recommendations will stay in review and audit history only.',
      color: enabled ? 'warning' : 'success',
    })
  } catch (e: any) {
    budgetControlSettings.value = previous
    toast.add({ title: 'Could not update budget control', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    budgetControlSaving.value = false
  }
}

// Debounce + in-flight cancellation: bank-charges hits Xero serially across
// every BANK + CREDITCARD account, so each call burns 5–20s. Without this,
// rapid platform-segment clicks fired 4× in parallel and the gateway returned
// 504 on each one (see console errors that prompted this fix).
let bankChargesDebounceTimer: ReturnType<typeof setTimeout> | null = null
let bankChargesAbort: AbortController | null = null

function loadBankCharges(refresh = false) {
  if (bankChargesDebounceTimer) clearTimeout(bankChargesDebounceTimer)
  bankChargesDebounceTimer = setTimeout(() => { void doLoadBankCharges(refresh) }, 300)
}

async function doLoadBankCharges(refresh = false) {
  if (bankChargesAbort) bankChargesAbort.abort()
  const ctrl = new AbortController()
  bankChargesAbort = ctrl
  bankLoading.value = true
  try {
    bankCharges.value = await $fetch('/api/agency/social/spend/bank-charges', {
      // refresh bypasses the KV cache after a sync.
      query: { month: selectedMonth.value, year: selectedYear.value, ...(refresh ? { refresh: 1 } : {}) },
      signal: ctrl.signal,
    })
  } catch (err: any) {
    // Aborted by a newer request — keep the previous value, don't clear.
    if (err?.name === 'AbortError' || ctrl.signal.aborted) return
    // Xero not connected or genuine error — silently degrade.
    bankCharges.value = null
  } finally {
    if (bankChargesAbort === ctrl) {
      bankChargesAbort = null
      bankLoading.value = false
    }
  }
}

const syncablePlatforms = ['meta', 'google', 'tiktok', 'linkedin', 'pinterest', 'snapchat', 'twitter', 'microsoft_ads'] as const

// Live multi-platform sync: fire every platform, then poll the job rows that
// support tracking (Meta + Google return a jobId) until they finish, keeping a
// progress bar up the whole time and refreshing content on completion — instead
// of guessing with fixed 30/60/120s refreshes that no longer match real
// durations (Meta on the queue can run several minutes).
const syncStatusLabel = ref('')
let syncPollTimer: ReturnType<typeof setTimeout> | null = null
const SYNC_POLL_INTERVAL = 4000
const SYNC_POLL_TIMEOUT = 16 * 60_000
type SyncablePlatform = typeof syncablePlatforms[number]

interface SyncStatusResponse {
  jobId: string
  platform: string
  status: 'running' | 'completed' | 'failed'
  syncedCount: number
  failures: Array<{ account: string; reason: string }>
  totalAccounts?: number | null
  processedAccounts?: number
}

async function handleSyncAll() {
  if (syncing.value) return
  syncing.value = true
  const platformsToSync: readonly SyncablePlatform[] = selectedPlatform.value === 'all'
    ? syncablePlatforms
    : syncablePlatforms.includes(selectedPlatform.value as SyncablePlatform)
      ? [selectedPlatform.value as SyncablePlatform]
      : syncablePlatforms
  syncStatusLabel.value = `Queueing ${platformsToSync.length === 1 ? platformLabel(platformsToSync[0]) : `${platformsToSync.length} platforms`}…`
  try {
    const results = await Promise.allSettled(
      platformsToSync.map(p => syncSpend(p as any, selectedMonth.value, selectedYear.value))
    )
    const jobIds: string[] = []
    let started = 0
    let failedToStart = 0
    for (const r of results) {
      if (r.status === 'fulfilled') {
        started++
        const jid = (r.value as any)?.jobId
        if (jid) jobIds.push(jid)
      } else {
        failedToStart++
      }
    }
    if (failedToStart > 0) {
      toast.add({ title: `${failedToStart} platform${failedToStart === 1 ? '' : 's'} failed to start`, color: 'warning' })
    }

    if (jobIds.length > 0) {
      // Tracked platforms (Meta/Google) — poll to real completion. The
      // untracked waitUntil platforms finish quickly and are picked up by the
      // final refresh.
      syncStatusLabel.value = `Sync queued for ${started} platform${started === 1 ? '' : 's'}…`
      pollSyncStatus(jobIds)
    } else {
      // No tracked jobs — fall back to a single delayed refresh.
      toast.add({ title: 'Sync started', description: `${started} platforms syncing in background.`, color: 'info' })
      setTimeout(() => loadSpend(true), 45_000)
      syncing.value = false
      syncStatusLabel.value = ''
    }
  } catch (e: any) {
    toast.add({ title: 'Sync error', description: e.message, color: 'error' })
    syncing.value = false
    syncStatusLabel.value = ''
  }
}

function platformLabel(platform: SyncablePlatform) {
  return platformOptions.find(option => option.value === platform)?.label || platform
}

function stopSyncPoll() {
  if (syncPollTimer) { clearTimeout(syncPollTimer); syncPollTimer = null }
}

function pollSyncStatus(jobIds: string[]) {
  const startedAt = Date.now()
  const tick = async () => {
    const statuses = (await Promise.all(
      jobIds.map(id =>
        $fetch<SyncStatusResponse>('/api/agency/social/spend/sync-status', { query: { jobId: id } }).catch(() => null)
      )
    )).filter(Boolean) as SyncStatusResponse[]

    const settled = statuses.filter(s => s.status !== 'running').length
    // If any tracked job is chunked per-account, surface account-level progress.
    const acctTotal = statuses.reduce((s, r) => s + (r.totalAccounts || 0), 0)
    const acctDone = statuses.reduce((s, r) => s + (r.processedAccounts || 0), 0)
    syncStatusLabel.value = acctTotal > 0
      ? `Syncing… ${acctDone}/${acctTotal} accounts (${settled}/${jobIds.length} platforms)`
      : `Syncing… ${settled}/${jobIds.length} platforms done`

    if (statuses.length === jobIds.length && settled === jobIds.length) {
      await finishSync(statuses)
      return
    }
    if (Date.now() - startedAt > SYNC_POLL_TIMEOUT) {
      stopSyncPoll()
      syncing.value = false
      syncStatusLabel.value = ''
      toast.add({ title: 'Still syncing', description: 'Some platforms are taking longer than expected — showing the latest data.', color: 'warning' })
      await refreshAfterSync()
      return
    }
    syncPollTimer = setTimeout(tick, SYNC_POLL_INTERVAL)
  }
  void tick()
}

async function finishSync(statuses: SyncStatusResponse[]) {
  stopSyncPoll()
  syncing.value = false
  syncStatusLabel.value = ''
  const totalSynced = statuses.reduce((s, r) => s + (r.syncedCount || 0), 0)
  const allFailures = statuses.flatMap(r => r.failures || [])
  const failedPlatforms = statuses.filter(r => r.status === 'failed').map(r => r.platform)

  if (failedPlatforms.length) {
    toast.add({ title: `Sync finished — ${failedPlatforms.length} platform${failedPlatforms.length === 1 ? '' : 's'} failed`, description: failedPlatforms.join(', '), color: 'warning' })
  } else if (allFailures.length) {
    const names = allFailures.slice(0, 3).map(f => f.account).join(', ')
    toast.add({ title: `Sync complete — ${allFailures.length} account issue${allFailures.length === 1 ? '' : 's'}`, description: `${totalSynced} campaigns updated. Couldn't sync: ${names}${allFailures.length > 3 ? ` +${allFailures.length - 3} more` : ''}.`, color: 'warning' })
  } else {
    toast.add({ title: 'Sync complete', description: `${totalSynced} campaigns updated.`, color: 'success' })
  }
  await refreshAfterSync()
}

// Re-fetch summary + bank charges, bypassing the KV cache.
async function refreshAfterSync() {
  await Promise.all([loadSpend(true), loadPacingReview(), loadSpendDiagnostics()])
  loadBankCharges(true)
}

onBeforeUnmount(() => stopSyncPoll())

function exportCSV() {
  if (!spendData.value?.items?.length) return
  const hasBankCol = hasBankData.value
  const headers = ['Client', 'Platform', 'Budget', 'Spend', ...(hasBankCol ? ['Bank Charged', 'Source'] : []), 'Commission', 'Variance', 'Variance %']
  const rows = spendData.value.items.map((i: any) => {
    const base = [i.clientName, i.platform, i.budget, i.spend]
    if (hasBankCol) {
      const key = i.platform === 'google' ? 'google_ads' : i.platform
      let platformBankTotal = bankCharges.value?.byPlatform?.[key]?.total || 0
      let source = 'xero'
      // Fallback to Meta billing for meta platform
      if (platformBankTotal <= 0 && key === 'meta' && bankCharges.value?.metaBilling?.total) {
        platformBankTotal = bankCharges.value.metaBilling.total
        source = 'meta_billing'
      }
      const platformTotal = spendData.value.items
        .filter((x: any) => (x.platform === 'google' ? 'google_ads' : x.platform) === key)
        .reduce((s: number, x: any) => s + x.spend, 0)
      const bankAmt = platformTotal > 0 ? Math.round(platformBankTotal * (i.spend / platformTotal) * 100) / 100 : 0
      base.push(bankAmt, bankAmt > 0 ? source : '')
    }
    return [...base, i.commission, i.variance, `${i.variancePercent}%`]
  })
  const csv = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spend-${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

watch([selectedMonth, selectedYear, selectedPlatform], () => {
  loadSpend()
  loadPacingReview()
  loadSpendDiagnostics()
  loadBankCharges()

  // Sync URL query string so the current view is linkable
  const q: Record<string, string> = {
    month: String(selectedMonth.value),
    year: String(selectedYear.value),
  }
  if (selectedPlatform.value !== 'all') q.platform = selectedPlatform.value
  router.replace({ query: q })
})

onMounted(() => {
  loadSpend()
  loadSpendDiagnostics()
  loadPacingReview()
  loadBudgetControlSettings()
  loadBankCharges()
})

const lastSyncedAt = computed(() => spendData.value?.lastSyncedAt || null)
const latestSyncJobs = computed(() => spendData.value?.latestSyncJobs || [])

const flaggedItems = computed(() => {
  if (!spendData.value?.items) return []
  return spendData.value.items.filter((i: any) => Math.abs(i.variancePercent) > 10)
})

// Pacing: what % of the month has elapsed vs % of budget spent
const monthProgress = computed(() => {
  const today = new Date()
  const m = selectedMonth.value
  const y = selectedYear.value
  // If viewing a past month, it's 100% elapsed
  if (y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth() + 1)) return 100
  // If viewing a future month, 0%
  if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth() + 1)) return 0
  // Current month
  const daysInMonth = new Date(y, m, 0).getDate()
  return Math.round((today.getDate() / daysInMonth) * 100)
})

const overallPacing = computed(() => {
  if (!spendData.value?.totals) return null
  const { budget, spend } = spendData.value.totals
  if (budget <= 0) return null
  const spentPct = (spend / budget) * 100
  const progress = monthProgress.value
  // Pacing ratio: >1 means overspending, <1 means underspending
  const ratio = progress > 0 ? spentPct / progress : 0
  return { spentPct: Math.round(spentPct), progress, ratio: Math.round(ratio * 100) / 100 }
})

const hasBankData = computed(() => {
  if (!bankCharges.value?.connected) return false
  return bankCharges.value.total > 0 || (bankCharges.value.metaBilling?.total ?? 0) > 0
})

const showPacingReview = computed(() => ['all', 'meta', 'google'].includes(selectedPlatform.value))
const liveBudgetChangesEnabled = computed(() => Boolean(budgetControlSettings.value.liveBudgetChangesEnabled))
const pacingReviewItems = computed(() => pacingReview.value?.items ?? [])
const pacingReviewSummary = computed(() => pacingReview.value?.summary ?? null)

/** Combined: Xero bank/CC + Meta billing (for platforms not matched in Xero) */
const combinedBankTotal = computed(() => {
  if (!bankCharges.value) return 0
  let total = bankCharges.value.total
  const metaXero = bankCharges.value.byPlatform?.['meta']?.total ?? 0
  if (metaXero <= 0 && bankCharges.value.metaBilling?.total) {
    total += bankCharges.value.metaBilling.total
  }
  return Math.round(total * 100) / 100
})

const bankDiscrepancy = computed(() => {
  if (!hasBankData.value || !spendData.value?.totals) return null
  const diff = combinedBankTotal.value - spendData.value.totals.spend
  const pct = spendData.value.totals.spend > 0
    ? Math.round((diff / spendData.value.totals.spend) * 1000) / 10
    : 0
  return { diff: Math.round(diff * 100) / 100, pct }
})

</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="p-6 lg:p-8 space-y-6">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Ad Spend</h1>
          <p class="text-sm text-muted mt-1">Track monthly spend across all connected ad platforms</p>
        </div>
        <div class="flex items-center gap-2">
          <!-- Platform Segmented Control -->
          <div class="inline-flex items-center p-0.5 rounded-lg bg-elevated/50 border border-default gap-0.5">
            <UButton
              v-for="opt in platformOptions"
              :key="opt.value"
              size="xs"
              :variant="selectedPlatform === opt.value ? 'soft' : 'ghost'"
              :color="selectedPlatform === opt.value ? 'primary' : 'neutral'"
              @click="selectedPlatform = opt.value"
            >
              {{ opt.label }}
            </UButton>
          </div>
          <div class="w-px h-6 bg-default hidden sm:block" />
          <UButton variant="ghost" icon="i-lucide-download" size="sm" @click="exportCSV" :disabled="!spendData?.items?.length">
            Export
          </UButton>
          <UButton variant="ghost" icon="i-lucide-upload" size="sm" @click="showImportModal = true">
            Import
          </UButton>
          <UButton variant="ghost" icon="i-lucide-link" size="sm" @click="showAccountMapping = true">
            Map accounts
          </UButton>
          <UButton to="/agency/social" variant="ghost" icon="i-lucide-plug" size="sm">
            Connections
          </UButton>
        </div>
      </div>

      <SocialSpendSectionNav />

      <!-- Period Picker -->
      <SocialSpendPeriodPicker
        :month="selectedMonth"
        :year="selectedYear"
        :week-filter="weekFilter"
        :last-synced-at="lastSyncedAt"
        :latest-sync-jobs="latestSyncJobs"
        :syncing="syncing"
        @update:month="selectedMonth = $event"
        @update:year="selectedYear = $event"
        @update:week-filter="weekFilter = $event"
        @sync="handleSyncAll"
      />

      <!-- Connection Health Strip -->
      <SocialConnectionHealthStrip />

      <SocialSpendControlRoom
        :diagnostics="spendDiagnostics"
        :diagnostics-loading="diagnosticsLoading"
        :pacing-summary="pacingReviewSummary"
        :bank-discrepancy="bankDiscrepancy"
        :has-bank-data="hasBankData"
        :live-budget-changes-enabled="liveBudgetChangesEnabled"
      />

      <SocialSpendControllerPanel
        v-if="showPacingReview"
        :month="selectedMonth"
        :year="selectedYear"
        :platform="selectedPlatform"
      />

      <!-- Summary Cards -->
      <div v-if="spendData" class="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <!-- Total Spend -->
        <div class="rounded-xl border border-default p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Total Spend</span>
            <div class="rounded-lg bg-blue-100 dark:bg-blue-950/40 p-1.5">
              <UIcon name="i-lucide-credit-card" class="size-4 text-blue-500" />
            </div>
          </div>
          <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(spendData.totals.spend) }}</p>
        </div>

        <!-- Bank Charged -->
        <div
          class="rounded-xl border border-default p-4 space-y-3"
          :class="bankDiscrepancy && Math.abs(bankDiscrepancy.pct) > 2 ? 'ring-1 ring-amber-500/20' : ''"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Bank Charged</span>
            <div class="rounded-lg p-1.5" :class="hasBankData ? 'bg-orange-100 dark:bg-orange-950/40' : 'bg-elevated'">
              <UIcon name="i-lucide-landmark" class="size-4" :class="hasBankData ? 'text-orange-500' : 'text-muted'" />
            </div>
          </div>
          <template v-if="hasBankData">
            <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(combinedBankTotal) }}</p>
            <div v-if="bankCharges?.partial" class="text-[10px] font-medium text-amber-500 flex items-center gap-1">
              <UIcon name="i-lucide-clock" class="size-3" />
              Partial: {{ bankCharges.accountsScanned }}/{{ bankCharges.accountsTotal }} bank accounts. Refresh to retry.
            </div>
            <div v-if="bankDiscrepancy && Math.abs(bankDiscrepancy.diff) >= 1" class="text-[10px] font-medium" :class="bankDiscrepancy.diff > 0 ? 'text-amber-500' : 'text-emerald-500'">
              {{ bankDiscrepancy.diff > 0 ? '+' : '' }}{{ formatCurrency(bankDiscrepancy.diff) }}
              ({{ bankDiscrepancy.pct > 0 ? '+' : '' }}{{ bankDiscrepancy.pct }}%)
              vs platform
            </div>
          </template>
          <template v-else-if="bankLoading">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-muted" />
              <span class="text-sm text-muted">Loading...</span>
            </div>
          </template>
          <template v-else-if="bankCharges?.connected">
            <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(0) }}</p>
            <p class="text-[10px] text-muted">No bank charges matched this period</p>
          </template>
          <template v-else>
            <p class="text-2xl font-bold tracking-tight text-muted">-</p>
            <p class="text-[10px] text-muted">Connect Xero to see bank charges</p>
          </template>
        </div>

        <!-- Total Budget -->
        <div class="rounded-xl border border-default p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Total Budget</span>
            <div class="rounded-lg bg-violet-100 dark:bg-violet-950/40 p-1.5">
              <UIcon name="i-lucide-target" class="size-4 text-violet-500" />
            </div>
          </div>
          <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(spendData.totals.budget) }}</p>
        </div>

        <!-- Commission -->
        <div class="rounded-xl border border-default p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Commission</span>
            <div class="rounded-lg bg-emerald-100 dark:bg-emerald-950/40 p-1.5">
              <UIcon name="i-lucide-percent" class="size-4 text-emerald-500" />
            </div>
          </div>
          <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(spendData.totals.commission) }}</p>
        </div>

        <!-- Pacing -->
        <div class="rounded-xl border border-default p-4 space-y-3" :class="overallPacing && overallPacing.ratio > 1.15 ? 'ring-1 ring-amber-500/20' : ''">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Pacing</span>
            <div class="rounded-lg p-1.5" :class="overallPacing && overallPacing.ratio > 1.15 ? 'bg-amber-100 dark:bg-amber-950/40' : 'bg-elevated'">
              <UIcon name="i-lucide-gauge" class="size-4" :class="overallPacing && overallPacing.ratio > 1.15 ? 'text-amber-500' : 'text-muted'" />
            </div>
          </div>
          <template v-if="overallPacing">
            <p class="text-2xl font-bold tracking-tight">{{ overallPacing.spentPct }}%</p>
            <div class="space-y-1">
              <div class="flex justify-between text-[10px] text-muted">
                <span>{{ monthProgress }}% through month</span>
                <span :class="overallPacing.ratio > 1.1 ? 'text-amber-500' : overallPacing.ratio < 0.85 ? 'text-blue-500' : 'text-emerald-500'">
                  {{ overallPacing.ratio > 1.05 ? 'Over-pacing' : overallPacing.ratio < 0.9 ? 'Under-pacing' : 'On track' }}
                </span>
              </div>
              <div class="h-1.5 bg-elevated rounded-full overflow-hidden relative">
                <div class="absolute inset-y-0 left-0 bg-muted/30 rounded-full" :style="{ width: `${monthProgress}%` }" />
                <div
                  class="absolute inset-y-0 left-0 rounded-full"
                  :class="overallPacing.ratio > 1.1 ? 'bg-amber-500' : overallPacing.ratio < 0.85 ? 'bg-blue-500' : 'bg-emerald-500'"
                  :style="{ width: `${Math.min(overallPacing.spentPct, 100)}%` }"
                />
              </div>
            </div>
          </template>
          <p v-else class="text-2xl font-bold tracking-tight text-muted">-</p>
        </div>

        <!-- Flagged -->
        <div class="rounded-xl border border-default p-4 space-y-3" :class="flaggedItems.length > 0 ? 'ring-1 ring-red-500/20' : ''">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Flagged (>10%)</span>
            <div class="rounded-lg p-1.5" :class="flaggedItems.length > 0 ? 'bg-red-100 dark:bg-red-950/40' : 'bg-elevated'">
              <UIcon name="i-lucide-alert-triangle" class="size-4" :class="flaggedItems.length > 0 ? 'text-red-500' : 'text-muted'" />
            </div>
          </div>
          <p class="text-2xl font-bold tracking-tight" :class="flaggedItems.length > 0 ? 'text-red-500' : ''">{{ flaggedItems.length }}</p>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-16">
        <div class="flex flex-col items-center gap-3">
          <XfLoader size="sm" />
          <span class="text-sm text-muted">Loading spend data...</span>
        </div>
      </div>

      <!-- Spend Table -->
      <div v-else-if="spendData?.items?.length" class="rounded-xl border border-default overflow-hidden">
        <div class="flex flex-col gap-3 px-4 py-3 border-b border-default bg-elevated/30">
          <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-sm font-semibold">Spend by Client / Account</h2>
                <UBadge v-if="showPacingReview" :color="liveBudgetChangesEnabled ? 'warning' : 'neutral'" variant="soft" size="xs">
                  {{ liveBudgetChangesEnabled ? 'Live budget changes armed' : 'Recommend only' }}
                </UBadge>
              </div>
              <p class="text-xs text-muted mt-0.5">
                {{ spendData.items.length }} {{ spendData.items.length === 1 ? 'spend group' : 'spend groups' }} this period
                <template v-if="showPacingReview"> · AI pacing merged into this view</template>
              </p>
            </div>
            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
              <div v-if="showPacingReview" class="flex items-center gap-2 rounded-lg border border-default bg-default/40 px-3 py-2">
                <div>
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="liveBudgetChangesEnabled ? 'i-lucide-zap' : 'i-lucide-shield-check'"
                      class="size-4"
                      :class="liveBudgetChangesEnabled ? 'text-warning' : 'text-muted'"
                    />
                    <span class="text-xs font-medium">Live budget changes</span>
                  </div>
                  <p class="text-[11px] text-muted">Meta and Google</p>
                </div>
                <USwitch
                  :model-value="liveBudgetChangesEnabled"
                  :loading="budgetControlLoading || budgetControlSaving"
                  :disabled="budgetControlLoading || budgetControlSaving"
                  @update:model-value="setLiveBudgetChanges(Boolean($event))"
                />
              </div>
              <UInput
                v-model="searchQuery"
                icon="i-lucide-search"
                placeholder="Search clients..."
                size="sm"
                class="w-full sm:w-56"
              />
            </div>
          </div>

          <div v-if="showPacingReview" class="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <div class="rounded-lg bg-default/40 px-3 py-2">
              <p class="text-[10px] uppercase text-muted font-medium">Critical</p>
              <p class="text-base font-semibold text-error">{{ pacingReviewLoading ? '-' : (pacingReview?.summary?.criticalCount ?? 0) }}</p>
            </div>
            <div class="rounded-lg bg-default/40 px-3 py-2">
              <p class="text-[10px] uppercase text-muted font-medium">Warnings</p>
              <p class="text-base font-semibold text-warning">{{ pacingReviewLoading ? '-' : (pacingReview?.summary?.warningCount ?? 0) }}</p>
            </div>
            <div class="rounded-lg bg-default/40 px-3 py-2">
              <p class="text-[10px] uppercase text-muted font-medium">Recommendations</p>
              <p class="text-base font-semibold">{{ pacingReviewLoading ? '-' : pacingReviewItems.length }}</p>
            </div>
            <div class="rounded-lg bg-default/40 px-3 py-2">
              <p class="text-[10px] uppercase text-muted font-medium">Projected over</p>
              <p class="text-base font-semibold">{{ pacingReviewLoading ? '-' : formatCurrency(pacingReview?.summary?.projectedOverspend ?? 0) }}</p>
            </div>
            <div class="rounded-lg bg-default/40 px-3 py-2">
              <p class="text-[10px] uppercase text-muted font-medium">Projected under</p>
              <p class="text-base font-semibold">{{ pacingReviewLoading ? '-' : formatCurrency(pacingReview?.summary?.projectedUnderspend ?? 0) }}</p>
            </div>
          </div>

          <div v-if="showPacingReview && pacingReview?.aiSummary" class="rounded-lg bg-primary/5 px-3 py-2 text-xs text-default">
            {{ pacingReview.aiSummary }}
          </div>
        </div>
        <SocialSpendAutoActionSettings v-if="showPacingReview" class="mb-3" />
        <SocialSpendVarianceTable
          :items="spendData.items"
          :totals="spendData.totals"
          :search="searchQuery"
          :month-progress="monthProgress"
        :pacing-review-items="pacingReviewItems"
        :latest-sync-jobs="latestSyncJobs"
        :budget-control-settings="budgetControlSettings"
          :bank-charges="bankCharges"
          @budget-updated="loadSpend"
        />
      </div>

      <!-- Empty State -->
      <div v-else-if="spendData && !spendData.items?.length" class="flex flex-col items-center justify-center py-16 gap-4">
        <div class="rounded-full bg-elevated p-4">
          <UIcon name="i-lucide-bar-chart-3" class="size-8 text-muted" />
        </div>
        <div class="text-center">
          <p class="font-medium">No spend data</p>
          <p class="text-sm text-muted mt-1">No data found for this period. Try syncing your ad accounts.</p>
        </div>
        <UButton variant="soft" icon="i-lucide-refresh-cw" @click="handleSyncAll" :loading="syncing">
          Sync Accounts
        </UButton>
      </div>

    </div>

    <!-- Import Modal -->
    <SocialSpendImportModal v-model:open="showImportModal" @imported="loadSpend" />

    <!-- Account → client mapping -->
    <SocialSpendAccountMappingManager v-model:open="showAccountMapping" @mapped="loadSpend(true)" />

    <!-- Background sync progress bar — stays up for the whole multi-platform run
         and refreshes the page when the tracked syncs finish. -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-full"
        leave-active-class="transition-all duration-200 ease-in"
        leave-to-class="opacity-0 translate-y-full"
      >
        <div v-if="syncing" class="fixed inset-x-0 bottom-0 z-50">
          <div class="flex items-center gap-3 px-6 py-2.5 bg-elevated/95 backdrop-blur border-t border-default shadow-lg">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-primary shrink-0" />
            <span class="text-sm font-medium text-default">{{ syncStatusLabel || 'Syncing…' }}</span>
            <span class="text-xs text-muted hidden sm:inline">Updates automatically when finished</span>
          </div>
          <UProgress size="sm" class="block" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
