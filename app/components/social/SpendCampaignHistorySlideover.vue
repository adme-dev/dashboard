<script setup lang="ts">
import {
  budgetHistoryDelta,
  budgetHistoryTone,
  formatBudgetHistoryTime,
  matchingPlannedBudgetAction,
  performanceSignalRows,
  pacingSignalRows,
  type BudgetHistoryTone,
} from '~/utils/socialSpendHistory'
import { useAuth } from '~/composables/useAuth'
import type { AnalysisResponse } from '~~/server/utils/spendAiAnalysis'
import { isDailyBudgetActionSupported as budgetTypeSupportsDailyAction } from '~~/shared/utils/campaignBudgetType'

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
  dailyBudgetActionSupported?: boolean
}

interface BudgetAuditEntry {
  id: string
  previousBudget: number
  newBudget: number
  changedBy: string
  changedByName: string
  changedByAvatar: string | null
  changedAt: string
  note: string | null
}

interface CampaignActionEntry {
  id: string
  mediaSpendId: string
  platform: string
  actionType: string
  actionStatus: string
  requestedBy: string | null
  requestedByName: string | null
  requestedByAvatar: string | null
  requestedAt: string
  approvedBy: string | null
  approvedByName: string | null
  approvedByAvatar: string | null
  approvedAt: string | null
  cancelledBy: string | null
  cancelledByName: string | null
  cancelledByAvatar: string | null
  cancelledAt: string | null
  executedAt: string | null
  previousValue: Record<string, unknown>
  newValue: Record<string, unknown>
  reason: string | null
  externalRequestId: string | null
  errorMessage: string | null
  metadata?: Record<string, unknown>
}

const props = defineProps<{
  item: PacingReviewItem | null
  latestSyncJobs?: Array<{
    platform: string
    status: 'running' | 'completed' | 'failed'
    syncedCount: number
    error: string | null
    startedAt: string
    finishedAt: string | null
    totalAccounts: number | null
    processedAccounts: number
    failures: Array<{ account: string; reason: string }>
  }>
}>()

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const { isAdmin } = useAuth()

// Live budget writes are restricted to admin/owner (PERMISSIONS.ADMIN).
const canApplyLive = computed(() => isAdmin.value)
const dailyBudgetActionSupported = computed(() => {
  if (!props.item) return false
  return props.item.dailyBudgetActionSupported
    ?? budgetTypeSupportsDailyAction(props.item.performance.budgetType)
})

const history = ref<BudgetAuditEntry[]>([])
const platformActions = ref<CampaignActionEntry[]>([])
const loading = ref(false)
const planning = ref(false)
const approvingActionId = ref<string | null>(null)
const cancellingActionId = ref<string | null>(null)
const applyingActionId = ref<string | null>(null)
const loadedSpendId = ref<string | null>(null)
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

type GoogleRecommendationsResponse = {
  optimizationScore: number | null
  recommendations: any[]
  campaignId: string | null
  error?: string | null
}

// Google optimization recommendations (Google rows only; fetched on open).
const googleRecs = ref<GoogleRecommendationsResponse>({ optimizationScore: null, recommendations: [], campaignId: null, error: null })
const applyingRec = ref<string | null>(null)

const signals = computed(() => props.item ? pacingSignalRows(props.item) : [])
const performanceSignals = computed(() => props.item ? performanceSignalRows(props.item.performance) : [])
const matchingPlannedAction = computed(() => props.item ? matchingPlannedBudgetAction(platformActions.value, props.item.recommendedDailyBudget) : null)
const matchingActionLabel = computed(() => matchingPlannedAction.value?.actionStatus === 'approved' ? 'Approved' : 'Planned')
const STALE_SYNC_MS = 24 * 60 * 60 * 1000

const platformSyncKey = computed(() => props.item?.platform === 'google' ? 'google' : props.item?.platform)
const latestPlatformSyncJob = computed(() => {
  if (!platformSyncKey.value) return null
  return [...(props.latestSyncJobs || [])]
    .filter(job => job.platform === platformSyncKey.value)
    .sort((a, b) => new Date(b.finishedAt || b.startedAt).getTime() - new Date(a.finishedAt || a.startedAt).getTime())[0] || null
})
const itemSyncIsStale = computed(() => {
  if (!props.item?.syncedAt) return true
  return Date.now() - new Date(props.item.syncedAt).getTime() > STALE_SYNC_MS
})
const syncHealthRows = computed(() => {
  if (!props.item) return []
  const job = latestPlatformSyncJob.value
  const rows = [
    {
      label: 'Last successful data sync',
      value: props.item.syncedAt ? formatBudgetHistoryTime(props.item.syncedAt) : 'Not synced',
      tone: itemSyncIsStale.value ? 'warning' : 'success',
      detail: itemSyncIsStale.value ? 'Refresh before approving spend changes' : 'Campaign metrics are recent enough for review',
    },
  ]
  if (job) {
    rows.push({
      label: 'Latest platform sync attempt',
      value: actionLabel(job.status),
      tone: job.status === 'failed' ? 'error' : job.status === 'running' ? 'warning' : 'success',
      detail: job.status === 'failed'
        ? (job.error || `${job.failures.length} account issue${job.failures.length === 1 ? '' : 's'} recorded`)
        : `${job.processedAccounts || 0}/${job.totalAccounts || 0} accounts processed`,
    })
  }
  if (googleRecs.value.error) {
    rows.push({
      label: 'Google recommendations',
      value: 'Unavailable',
      tone: 'warning',
      detail: googleRecs.value.error,
    })
  }
  return rows
})
const assistanceOpportunities = computed(() => {
  if (!props.item) return []
  const opportunities: Array<{ label: string; detail: string; icon: string; tone: 'neutral' | 'warning' | 'info' }> = []
  if (itemSyncIsStale.value) {
    opportunities.push({
      label: 'Require fresh data before approval',
      detail: 'Gate approvals when platform data is older than 24 hours or the latest sync failed.',
      icon: 'i-lucide-shield-alert',
      tone: 'warning',
    })
  }
  if (!props.item.performance.conversions || props.item.performance.conversionRate == null) {
    opportunities.push({
      label: 'Add lead quality context',
      detail: 'Connect GA4/CRM conversions so pacing recommendations consider lead volume and quality, not only spend.',
      icon: 'i-lucide-route',
      tone: 'info',
    })
  }
  if (props.item.platform === 'meta' && latestPlatformSyncJob.value?.status === 'failed') {
    opportunities.push({
      label: 'Surface Meta permission repair',
      detail: 'Show the exact ad account permission issue and link operators to reconnect or grant ads_read access.',
      icon: 'i-lucide-key-round',
      tone: 'warning',
    })
  }
  if (props.item.platform === 'google' && googleRecs.value.error) {
    opportunities.push({
      label: 'Repair Google recommendation access',
      detail: 'Expose OAuth/developer-token failures so operators know whether native Google recommendations are available.',
      icon: 'i-lucide-wrench',
      tone: 'warning',
    })
  }
  if (!platformActions.value.length) {
    opportunities.push({
      label: 'Start an auditable action trail',
      detail: 'Save the recommendation as a planned action so approval, cancellation, and platform writes are visible later.',
      icon: 'i-lucide-clipboard-check',
      tone: 'neutral',
    })
  }
  return opportunities.slice(0, 4)
})

watch(
  () => [open.value, props.item?.mediaSpendId] as const,
  async ([isOpen, spendId]) => {
    if (!isOpen || !spendId || loadedSpendId.value === spendId) return
    await loadHistory(spendId)
  },
  { immediate: true }
)

async function loadHistory(spendId: string, force = false) {
  if (!force && loadedSpendId.value === spendId) return
  loading.value = true
  try {
    history.value = []
    platformActions.value = []
    // Reset AI-analysis state so a stale card can't bleed into a different campaign.
    aiAnalysis.value = null
    chosenSource.value = 'ai'
    refreshFromPlatform.value = false
    const [budgetHistory, actionHistory] = await Promise.all([
      apiFetch<BudgetAuditEntry[]>(`/api/agency/social/spend/${spendId}/history`),
      apiFetch<CampaignActionEntry[]>(`/api/agency/social/spend/${spendId}/actions`),
    ])
    history.value = budgetHistory
    platformActions.value = actionHistory
    loadedSpendId.value = spendId
    // Non-blocking: surface Google's native recommendations for this campaign.
    void loadGoogleRecs(spendId)
  } catch (e: any) {
    toast.add({
      title: 'History unavailable',
      description: e.data?.statusMessage || e.message || 'Could not load campaign history',
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}

async function planCurrentRecommendation() {
  if (!props.item || !dailyBudgetActionSupported.value || planning.value || matchingPlannedAction.value) return
  planning.value = true
  try {
    await apiFetch(`/api/agency/social/spend/${props.item.mediaSpendId}/actions/plan`, {
      method: 'POST',
      body: {
        currentDailyBudget: props.item.currentDailyBudget,
        recommendedDailyBudget: props.item.recommendedDailyBudget,
        reason: props.item.recommendedAction,
        issueType: props.item.issueType,
        pacingRatio: props.item.pacingRatio,
        projectedMonthEnd: props.item.projectedMonthEnd,
        budget: props.item.budget,
      },
    })
    toast.add({
      title: 'Planned action saved',
      description: 'The recommendation is now recorded for review before any platform change.',
      color: 'success',
    })
    await loadHistory(props.item.mediaSpendId, true)
  } catch (e: any) {
    toast.add({
      title: 'Could not save planned action',
      description: e.data?.statusMessage || e.message || 'The recommendation was not recorded',
      color: 'error',
    })
  } finally {
    planning.value = false
  }
}

async function loadGoogleRecs(spendId: string) {
  if (props.item?.platform !== 'google' || !canApplyLive.value) {
    googleRecs.value = { optimizationScore: null, recommendations: [], campaignId: null, error: null }
    return
  }
  try {
    googleRecs.value = await apiFetch<GoogleRecommendationsResponse>(`/api/agency/social/spend/${spendId}/google-recommendations`)
  } catch {
    googleRecs.value = { optimizationScore: null, recommendations: [], campaignId: null, error: 'Could not load Google recommendations' }
  }
}

async function applyGoogleRec(rec: any) {
  const spendId = props.item?.mediaSpendId
  if (!spendId || !dailyBudgetActionSupported.value || rec?.recommendedDailyMajor == null || applyingRec.value) return
  applyingRec.value = rec.resourceName
  try {
    const planned = await apiFetch(`/api/agency/social/spend/${spendId}/actions/plan`, {
      method: 'POST',
      body: {
        currentDailyBudget: rec.currentDailyMajor ?? props.item?.currentDailyBudget ?? 0,
        recommendedDailyBudget: rec.recommendedDailyMajor,
        source: 'google_recommendation',
        recommendationResourceName: rec.resourceName,
        reason: rec.title,
      },
    }) as any
    const action = planned?.action
    if (!action?.id) throw new Error('Could not record the recommendation')
    // The plan endpoint dedupes on planned-OR-approved, so a repeat click (common
    // while the write flags are OFF — execute returns 'blocked' without consuming
    // the approval) returns an already-approved action. approve only matches
    // 'planned', so re-approving would 404 — only approve when not yet approved.
    if (action.actionStatus !== 'approved') {
      await apiFetch(`/api/agency/social/spend/${spendId}/actions/${action.id}/approve`, { method: 'POST' })
    }
    const res = await apiFetch<{ status: string; appliedDailyBudget?: number; clamped?: boolean; clampReasons?: string[]; reason?: string; adSetCount?: number; message?: string }>(
      `/api/agency/social/spend/${spendId}/actions/${action.id}/execute`, { method: 'POST', body: {} })
    if (res.status === 'applied') {
      toast.add({ title: `Applied ${formatCurrency(res.appliedDailyBudget || 0)}/day`, description: res.clamped ? `Clamped: ${(res.clampReasons || []).join(', ')}` : 'Live budget updated', color: 'success' })
    } else if (res.status === 'blocked') {
      toast.add({ title: 'Blocked by guardrail', description: res.reason === 'writes_disabled' ? 'Live budget changes are off (recommend-only).' : res.reason, color: 'warning' })
    } else if (res.status === 'skipped') {
      toast.add({ title: 'Manual change needed', description: `ABO campaign with ${res.adSetCount} active ad sets — adjust each ad set manually.`, color: 'info' })
    } else {
      toast.add({ title: 'Apply failed', description: res.message || res.reason || 'Platform write failed', color: 'error' })
    }
    await loadHistory(spendId, true)
  } catch (e: any) {
    toast.add({ title: 'Apply failed', description: e?.data?.statusMessage || e?.message || 'Error', color: 'error' })
  } finally {
    applyingRec.value = null
  }
}

async function cancelPlannedAction(action: CampaignActionEntry) {
  if (!props.item || !isCancellableAction(action) || cancellingActionId.value) return
  cancellingActionId.value = action.id
  try {
    await apiFetch(`/api/agency/social/spend/${props.item.mediaSpendId}/actions/${action.id}/cancel`, {
      method: 'POST',
    })
    toast.add({
      title: action.actionStatus === 'approved' ? 'Approved action cancelled' : 'Planned action cancelled',
      description: 'The recommendation remains in history with a cancelled status.',
      color: 'success',
    })
    await loadHistory(props.item.mediaSpendId, true)
  } catch (e: any) {
    toast.add({
      title: 'Could not cancel planned action',
      description: e.data?.statusMessage || e.message || 'The planned action was not updated',
      color: 'error',
    })
  } finally {
    cancellingActionId.value = null
  }
}

function isCancellableAction(action: CampaignActionEntry) {
  return action.actionStatus === 'planned' || action.actionStatus === 'approved'
}

function actionDisplayTime(action: CampaignActionEntry) {
  return action.executedAt || action.cancelledAt || action.approvedAt || action.requestedAt
}

async function approvePlannedAction(action: CampaignActionEntry) {
  if (!props.item || !dailyBudgetActionSupported.value || action.actionStatus !== 'planned' || approvingActionId.value) return
  approvingActionId.value = action.id
  try {
    await apiFetch(`/api/agency/social/spend/${props.item.mediaSpendId}/actions/${action.id}/approve`, {
      method: 'POST',
    })
    toast.add({
      title: 'Planned action approved',
      description: 'The action is approved for a future platform write.',
      color: 'success',
    })
    await loadHistory(props.item.mediaSpendId, true)
  } catch (e: any) {
    toast.add({
      title: 'Could not approve planned action',
      description: e.data?.statusMessage || e.message || 'The planned action was not updated',
      color: 'error',
    })
  } finally {
    approvingActionId.value = null
  }
}

async function applyApprovedAction(action: CampaignActionEntry) {
  if (!props.item || !dailyBudgetActionSupported.value || action.actionStatus !== 'approved' || applyingActionId.value) return
  applyingActionId.value = action.id
  try {
    const res = await apiFetch<{
      status: 'applied' | 'blocked' | 'skipped' | 'failed'
      appliedDailyBudget?: number
      clamped?: boolean
      clampReasons?: string[]
      reason?: string
      adSetCount?: number
      message?: string
    }>(`/api/agency/social/spend/${props.item.mediaSpendId}/actions/${action.id}/execute`, {
      method: 'POST',
    })
    if (res.status === 'applied') {
      toast.add({
        title: `Applied ${formatCurrency(res.appliedDailyBudget || 0)}/day`,
        description: res.clamped ? `Clamped: ${(res.clampReasons || []).join(', ')}` : 'Live budget updated',
        color: 'success',
      })
    } else if (res.status === 'blocked') {
      toast.add({ title: 'Blocked by guardrail', description: res.reason, color: 'warning' })
    } else if (res.status === 'skipped') {
      toast.add({
        title: 'Manual change needed',
        description: `ABO campaign with ${res.adSetCount} active ad sets — adjust each ad set manually.`,
        color: 'info',
      })
    } else {
      toast.add({ title: 'Apply failed', description: res.message || res.reason || 'Platform write failed', color: 'error' })
    }
    await loadHistory(props.item.mediaSpendId, true)
  } catch (e: any) {
    toast.add({
      title: 'Apply failed',
      description: e.data?.statusMessage || e.message || 'The budget change could not be applied',
      color: 'error',
    })
  } finally {
    applyingActionId.value = null
  }
}

const analyzing = ref(false)
const refreshFromPlatform = ref(false)
const aiAnalysis = ref<AnalysisResponse | null>(null)
const chosenSource = ref<'ai' | 'deterministic'>('ai')
const approvingAdjustment = ref(false)

const chosenDailyBudget = computed(() => {
  if (!aiAnalysis.value) return props.item?.recommendedDailyBudget ?? 0
  if (chosenSource.value === 'ai' && aiAnalysis.value.ai) return aiAnalysis.value.ai.proposedDailyBudget
  return aiAnalysis.value.deterministic.dailyBudget
})

function freshnessLabel(syncedAt: string | null) {
  if (!syncedAt) return 'no sync timestamp'
  return `synced ${formatBudgetHistoryTime(syncedAt)}`
}

async function analyzeWithAi() {
  if (!props.item || !dailyBudgetActionSupported.value || analyzing.value) return
  analyzing.value = true
  try {
    const res = await apiFetch<AnalysisResponse>(`/api/agency/social/spend/${props.item.mediaSpendId}/ai-analysis`, {
      method: 'POST',
      body: { issueType: props.item.issueType, refresh: refreshFromPlatform.value },
    })
    aiAnalysis.value = res
    chosenSource.value = res.ai ? 'ai' : 'deterministic'
    if (!res.ai) {
      toast.add({ title: 'AI analysis unavailable', description: 'Showing the deterministic recommendation only.', color: 'warning' })
    }
  } catch (e: any) {
    toast.add({ title: 'Analysis failed', description: e.data?.statusMessage || e.message || 'Could not analyze this campaign', color: 'error' })
  } finally {
    analyzing.value = false
  }
}

async function approveAdjustment() {
  if (!props.item || !dailyBudgetActionSupported.value || approvingAdjustment.value || !aiAnalysis.value) return
  approvingAdjustment.value = true
  try {
    const chosen = chosenDailyBudget.value
    const plan = await apiFetch<{ action: { id: string, actionStatus: string } }>(`/api/agency/social/spend/${props.item.mediaSpendId}/actions/plan`, {
      method: 'POST',
      body: {
        currentDailyBudget: props.item.currentDailyBudget,
        recommendedDailyBudget: chosen,
        reason: aiAnalysis.value.ai?.rationale || props.item.recommendedAction,
        issueType: props.item.issueType,
        pacingRatio: props.item.pacingRatio,
        projectedMonthEnd: props.item.projectedMonthEnd,
        budget: props.item.budget,
        aiProposedDaily: aiAnalysis.value.ai?.proposedDailyBudget ?? null,
        deterministicDaily: aiAnalysis.value.deterministic.dailyBudget,
        chosenSource: chosenSource.value,
        confidence: aiAnalysis.value.ai?.confidence ?? null,
        riskFlags: aiAnalysis.value.ai?.riskFlags ?? [],
        modelId: aiAnalysis.value.modelId,
      },
    })
    if (plan?.action?.id && plan.action.actionStatus === 'planned') {
      await apiFetch(`/api/agency/social/spend/${props.item.mediaSpendId}/actions/${plan.action.id}/approve`, { method: 'POST' })
    }
    toast.add({ title: 'Adjustment approved', description: 'Ready for an admin to apply to the platform.', color: 'success' })
    aiAnalysis.value = null
    await loadHistory(props.item.mediaSpendId, true)
  } catch (e: any) {
    toast.add({ title: 'Could not approve adjustment', description: e.data?.statusMessage || e.message || 'The adjustment was not recorded', color: 'error' })
  } finally {
    approvingAdjustment.value = false
  }
}

function confidenceColor(c: 'low' | 'medium' | 'high') {
  return c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'neutral'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatSignedCurrency(value: number) {
  const formatted = formatCurrency(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

function issueLabel(issue: string) {
  return issue.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function platformLabel(platform: string) {
  return platform === 'meta' ? 'Meta' : 'Google'
}

function toneClass(tone: BudgetHistoryTone) {
  if (tone === 'increase') return 'text-emerald-500'
  if (tone === 'decrease') return 'text-red-500'
  return 'text-muted'
}

function actionLabel(value: string) {
  return value.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function actionStatusColor(value: string) {
  if (value === 'applied') return 'success'
  if (value === 'failed' || value === 'cancelled') return 'error'
  if (value === 'approved' || value === 'pending') return 'warning'
  return 'neutral'
}

function healthToneColor(value: string) {
  if (value === 'success') return 'success'
  if (value === 'error') return 'error'
  if (value === 'warning') return 'warning'
  return 'neutral'
}

function summarizeValue(value: Record<string, unknown>) {
  const entries = Object.entries(value || {})
  if (!entries.length) return '-'
  return entries
    .slice(0, 2)
    .map(([key, val]) => `${actionLabel(key)}: ${String(val)}`)
    .join(' · ')
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div v-if="item" class="flex h-full flex-col">
        <div class="flex items-start justify-between gap-3 border-b border-default p-4 sm:p-5">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="neutral" variant="subtle" size="sm">{{ platformLabel(item.platform) }}</UBadge>
              <UBadge color="primary" variant="soft" size="sm">{{ issueLabel(item.issueType) }}</UBadge>
              <span v-if="item.campaignStatus" class="text-xs text-muted">{{ item.campaignStatus }}</span>
            </div>
            <h3 class="mt-2 line-clamp-2 max-w-md text-base font-semibold leading-snug">{{ item.campaignName }}</h3>
            <p class="mt-0.5 text-xs text-muted">{{ item.clientName }} · campaign history</p>
          </div>
          <UButton color="neutral" variant="ghost" icon="i-lucide-x" size="xs" @click="open = false" />
        </div>

        <div class="grid grid-cols-2 gap-px bg-default sm:grid-cols-4">
          <div class="bg-elevated/30 px-4 py-3">
            <p class="text-[11px] uppercase text-muted font-medium">Spend MTD</p>
            <p class="mt-0.5 font-semibold tabular-nums">{{ formatCurrency(item.mtdSpend) }}</p>
          </div>
          <div class="bg-elevated/30 px-4 py-3">
            <p class="text-[11px] uppercase text-muted font-medium">Budget</p>
            <p class="mt-0.5 font-semibold tabular-nums">{{ formatCurrency(item.budget) }}</p>
          </div>
          <div class="bg-elevated/30 px-4 py-3">
            <p class="text-[11px] uppercase text-muted font-medium">Projected</p>
            <p class="mt-0.5 font-semibold tabular-nums">{{ formatCurrency(item.projectedMonthEnd) }}</p>
          </div>
          <div class="bg-elevated/30 px-4 py-3">
            <p class="text-[11px] uppercase text-muted font-medium">New/day</p>
            <p class="mt-0.5 font-semibold tabular-nums">{{ formatCurrency(item.recommendedDailyBudget) }}</p>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <section class="border-b border-default p-4 sm:p-5">
            <div class="mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-activity" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold">Data health</h4>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <div v-for="row in syncHealthRows" :key="row.label" class="rounded-lg bg-elevated/40 p-3">
                <div class="flex items-start justify-between gap-3">
                  <p class="text-xs font-medium text-muted">{{ row.label }}</p>
                  <UBadge :color="healthToneColor(row.tone) as any" variant="subtle" size="xs">
                    {{ row.value }}
                  </UBadge>
                </div>
                <p class="mt-1 text-xs text-muted">{{ row.detail }}</p>
              </div>
            </div>
          </section>

          <section v-if="assistanceOpportunities.length" class="border-b border-default p-4 sm:p-5">
            <div class="mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-lightbulb" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold">Assistance opportunities</h4>
            </div>
            <div class="space-y-2">
              <div
                v-for="opportunity in assistanceOpportunities"
                :key="opportunity.label"
                class="flex items-start gap-3 rounded-lg bg-elevated/40 p-3"
              >
                <UIcon :name="opportunity.icon" class="mt-0.5 size-4 shrink-0" :class="opportunity.tone === 'warning' ? 'text-warning' : 'text-primary'" />
                <div class="min-w-0">
                  <p class="text-sm font-medium">{{ opportunity.label }}</p>
                  <p class="mt-0.5 text-xs text-muted">{{ opportunity.detail }}</p>
                </div>
              </div>
            </div>
          </section>

          <section class="border-b border-default p-4 sm:p-5">
            <div class="mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-chart-no-axes-combined" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold">Pacing signals</h4>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <div v-for="signal in signals" :key="signal.label" class="rounded-lg bg-elevated/40 p-3">
                <div class="flex items-start justify-between gap-3">
                  <p class="text-xs font-medium text-muted">{{ signal.label }}</p>
                  <p class="shrink-0 text-sm font-semibold tabular-nums">{{ signal.value }}</p>
                </div>
                <p class="mt-1 text-xs text-muted">{{ signal.detail }}</p>
              </div>
            </div>
          </section>

          <section v-if="performanceSignals.length" class="border-b border-default p-4 sm:p-5">
            <div class="mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-gauge" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold">Performance signals</h4>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <div v-for="signal in performanceSignals" :key="signal.label" class="rounded-lg bg-elevated/40 p-3">
                <div class="flex items-start justify-between gap-3">
                  <p class="text-xs font-medium text-muted">{{ signal.label }}</p>
                  <p class="shrink-0 text-sm font-semibold tabular-nums">{{ signal.value }}</p>
                </div>
                <p class="mt-1 text-xs text-muted">{{ signal.detail }}</p>
              </div>
            </div>
          </section>

          <section class="border-b border-default p-4 sm:p-5">
            <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
                <h4 class="text-sm font-semibold">Current recommendation</h4>
              </div>
              <UButton
                v-if="dailyBudgetActionSupported"
                size="xs"
                variant="soft"
                color="primary"
                :icon="matchingPlannedAction ? 'i-lucide-check' : 'i-lucide-clipboard-check'"
                :loading="planning"
                :disabled="!!matchingPlannedAction"
                @click="planCurrentRecommendation"
              >
                {{ matchingPlannedAction ? matchingActionLabel : 'Save as planned action' }}
              </UButton>
              <UBadge v-else color="neutral" variant="soft" size="sm">
                Campaign-total budget · daily write unavailable
              </UBadge>
            </div>
            <p class="text-sm text-default">{{ item.recommendedAction }}</p>
            <p v-if="!dailyBudgetActionSupported" class="mt-2 text-xs text-warning">
              The daily figure is a pacing benchmark only. Review feed coverage, assets, bidding, targeting, final URLs and conversion tracking instead of applying it as a Google budget.
            </p>

          <div v-if="dailyBudgetActionSupported" class="mt-3">
            <UButton
              size="xs"
              variant="soft"
              color="primary"
              icon="i-lucide-sparkles"
              :loading="analyzing"
              @click="analyzeWithAi"
            >
              Analyze with AI
            </UButton>
          </div>

          <UCheckbox
            v-if="dailyBudgetActionSupported"
            v-model="refreshFromPlatform"
            label="Refresh from platform first"
            size="xs"
            class="mt-2"
          />

          <div v-if="dailyBudgetActionSupported && aiAnalysis" class="mt-3 rounded-lg border border-default p-3">
            <p class="mb-2 text-[11px] uppercase text-muted font-medium">
              Recommended daily budget · {{ freshnessLabel(aiAnalysis.dataFreshness.syncedAt) }}
            </p>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-lg border p-3 text-left transition"
                :class="chosenSource === 'deterministic' ? 'border-primary bg-primary/5' : 'border-default'"
                @click="chosenSource = 'deterministic'"
              >
                <p class="text-xs text-muted">Rule-based</p>
                <p class="mt-0.5 text-base font-semibold tabular-nums">{{ formatCurrency(aiAnalysis.deterministic.dailyBudget) }}/day</p>
              </button>
              <button
                v-if="aiAnalysis.ai"
                type="button"
                class="rounded-lg border p-3 text-left transition"
                :class="chosenSource === 'ai' ? 'border-primary bg-primary/5' : 'border-default'"
                @click="chosenSource = 'ai'"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs text-muted">AI proposed</p>
                  <UBadge :color="confidenceColor(aiAnalysis.ai.confidence) as any" variant="subtle" size="xs">
                    {{ aiAnalysis.ai.confidence }}
                  </UBadge>
                </div>
                <p class="mt-0.5 text-base font-semibold tabular-nums">{{ formatCurrency(aiAnalysis.ai.proposedDailyBudget) }}/day</p>
              </button>
              <div v-else class="rounded-lg border border-dashed border-default p-3 text-xs text-muted">
                AI analysis unavailable
              </div>
            </div>

            <p v-if="aiAnalysis.ai" class="mt-2 text-xs text-muted">{{ aiAnalysis.ai.rationale }}</p>
            <div v-if="aiAnalysis.ai && aiAnalysis.ai.riskFlags.length" class="mt-2 flex flex-wrap gap-1">
              <UBadge v-for="flag in aiAnalysis.ai.riskFlags" :key="flag" color="warning" variant="subtle" size="xs">
                {{ flag }}
              </UBadge>
            </div>
            <p v-if="aiAnalysis.dataFreshness.refreshError" class="mt-2 text-xs text-amber-500">
              Live refresh failed — using last-synced data.
            </p>

            <div class="mt-3 flex justify-end">
              <UButton
                size="xs"
                color="primary"
                icon="i-lucide-clipboard-check"
                :loading="approvingAdjustment"
                @click="approveAdjustment"
              >
                Approve {{ formatCurrency(chosenDailyBudget) }}/day adjustment
              </UButton>
            </div>
          </div>
          </section>

          <section
            v-if="googleRecs.recommendations.length || googleRecs.optimizationScore != null"
            class="border-b border-default p-4 sm:p-5"
          >
            <SpendGoogleRecommendations
              :optimization-score="googleRecs.optimizationScore"
              :recommendations="googleRecs.recommendations"
              :campaign-id="googleRecs.campaignId"
              :armed="canApplyLive && dailyBudgetActionSupported"
              :applying="applyingRec"
              @apply="applyGoogleRec"
            />
          </section>

          <section class="border-b border-default p-4 sm:p-5">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-history" class="size-4 text-primary" />
                <h4 class="text-sm font-semibold">Budget adjustments</h4>
              </div>
              <UBadge color="neutral" variant="subtle" size="sm">{{ history.length }} recorded</UBadge>
            </div>

            <div v-if="loading" class="flex items-center gap-2 py-5 text-sm text-muted">
              <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
              Loading campaign history...
            </div>

            <div v-else-if="history.length" class="space-y-3">
              <div v-for="entry in history" :key="entry.id" class="rounded-lg border border-default p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">
                      {{ formatCurrency(entry.previousBudget) }} to {{ formatCurrency(entry.newBudget) }}
                    </p>
                    <p class="mt-0.5 text-xs text-muted">
                      {{ entry.changedByName }} · {{ formatBudgetHistoryTime(entry.changedAt) }}
                    </p>
                  </div>
                  <p class="shrink-0 text-sm font-semibold tabular-nums" :class="toneClass(budgetHistoryTone(entry))">
                    {{ formatSignedCurrency(budgetHistoryDelta(entry)) }}
                  </p>
                </div>
                <p v-if="entry.note" class="mt-2 text-xs text-muted">{{ entry.note }}</p>
              </div>
            </div>

            <div v-else class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">
              No internal budget adjustments have been recorded for this campaign yet.
            </div>
          </section>

          <section class="p-4 sm:p-5">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-send" class="size-4 text-primary" />
                <h4 class="text-sm font-semibold">Platform actions</h4>
              </div>
              <UBadge color="neutral" variant="subtle" size="sm">{{ platformActions.length }} recorded</UBadge>
            </div>

            <div v-if="loading" class="flex items-center gap-2 py-5 text-sm text-muted">
              <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
              Loading platform actions...
            </div>

            <div v-else-if="platformActions.length" class="space-y-3">
              <div v-for="action in platformActions" :key="action.id" class="rounded-lg border border-default p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="text-sm font-medium">{{ actionLabel(action.actionType) }}</p>
                      <UBadge :color="actionStatusColor(action.actionStatus) as any" variant="soft" size="sm">
                        {{ actionLabel(action.actionStatus) }}
                      </UBadge>
                      <UBadge v-if="(action as any).metadata?.source === 'auto_action'" color="info" variant="subtle" size="xs">
                        Auto-proposed
                      </UBadge>
                    </div>
                    <p class="mt-0.5 text-xs text-muted">
                      {{ action.requestedByName || 'System' }} · {{ formatBudgetHistoryTime(actionDisplayTime(action)) }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <UBadge color="neutral" variant="subtle" size="sm">
                      {{ platformLabel(action.platform) }}
                    </UBadge>
                    <UButton
                      v-if="dailyBudgetActionSupported && action.actionStatus === 'planned'"
                      size="xs"
                      variant="soft"
                      color="primary"
                      icon="i-lucide-check"
                      :loading="approvingActionId === action.id"
                      @click="approvePlannedAction(action)"
                    >
                      Approve
                    </UButton>
                    <UButton
                      v-if="canApplyLive && dailyBudgetActionSupported && action.actionStatus === 'approved'"
                      size="xs"
                      variant="solid"
                      color="warning"
                      icon="i-lucide-zap"
                      :loading="applyingActionId === action.id"
                      @click="applyApprovedAction(action)"
                    >
                      Apply to {{ platformLabel(action.platform) }}
                    </UButton>
                    <UButton
                      v-if="isCancellableAction(action)"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-x"
                      :loading="cancellingActionId === action.id"
                      @click="cancelPlannedAction(action)"
                    >
                      {{ action.actionStatus === 'approved' ? 'Cancel approval' : 'Cancel plan' }}
                    </UButton>
                  </div>
                </div>
                <div class="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-2">
                  <p>From {{ summarizeValue(action.previousValue) }}</p>
                  <p>To {{ summarizeValue(action.newValue) }}</p>
                </div>
                <p v-if="action.approvedAt" class="mt-2 text-xs text-muted">
                  Approved by {{ action.approvedByName || 'Team member' }} · {{ formatBudgetHistoryTime(action.approvedAt) }}
                </p>
                <p v-if="action.cancelledAt" class="mt-2 text-xs text-muted">
                  Cancelled by {{ action.cancelledByName || 'Team member' }} · {{ formatBudgetHistoryTime(action.cancelledAt) }}
                </p>
                <p v-if="action.reason" class="mt-2 text-xs text-muted">{{ action.reason }}</p>
                <p v-if="action.errorMessage" class="mt-2 text-xs text-red-500">{{ action.errorMessage }}</p>
              </div>
            </div>

            <div v-else class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">
              No Meta or Google write actions have been recorded for this campaign yet.
            </div>
          </section>
        </div>
      </div>
    </template>
  </USlideover>
</template>
