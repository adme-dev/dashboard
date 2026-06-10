<script setup lang="ts">
import {
  budgetHistoryDelta,
  budgetHistoryTone,
  formatBudgetHistoryTime,
  performanceSignalRows,
  pacingSignalRows,
  type BudgetHistoryTone,
} from '~/app/utils/socialSpendHistory'

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

const props = defineProps<{
  item: PacingReviewItem | null
}>()

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

const history = ref<BudgetAuditEntry[]>([])
const loading = ref(false)
const loadedSpendId = ref<string | null>(null)

const signals = computed(() => props.item ? pacingSignalRows(props.item) : [])
const performanceSignals = computed(() => props.item ? performanceSignalRows(props.item.performance) : [])

watch(
  () => [open.value, props.item?.mediaSpendId] as const,
  async ([isOpen, spendId]) => {
    if (!isOpen || !spendId || loadedSpendId.value === spendId) return
    await loadHistory(spendId)
  },
  { immediate: true }
)

async function loadHistory(spendId: string) {
  loading.value = true
  try {
    history.value = await $fetch<BudgetAuditEntry[]>(`/api/agency/social/spend/${spendId}/history`)
    loadedSpendId.value = spendId
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
            <h3 class="mt-2 truncate text-base font-semibold">{{ item.campaignName }}</h3>
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
            <div class="mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold">Current recommendation</h4>
            </div>
            <p class="text-sm text-default">{{ item.recommendedAction }}</p>
          </section>

          <section class="p-4 sm:p-5">
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

          <div class="border-t border-default bg-elevated/20 px-4 py-3 text-xs text-muted sm:px-5">
            Platform-side Meta and Google adjustment history will appear here once approved write actions are enabled.
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
