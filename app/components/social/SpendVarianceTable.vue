<script setup lang="ts">
import type { BudgetEditTarget } from './SpendBudgetEditModal.vue'

const props = defineProps<{
  items: Array<{
    platform: string
    clientName: string
    clientCode: string | null
    budget: number
    spend: number
    commission: number
    commissionRate?: number
    variance: number
    variancePercent: number
    impressions: number
    clicks: number
    conversions: number
    campaignCount: number
    spendIds?: string[]
    rolling?: boolean
    lastSyncedAt?: string | null
  }>
  totals: { budget: number; spend: number; commission: number; variance: number }
  search?: string
  monthProgress?: number
  bankCharges?: {
    byPlatform: Record<string, { total: number }>
    total: number
    connected: boolean
    metaBilling?: { total: number; accounts: Array<{ accountId: string; accountName: string; total: number }> } | null
  } | null
}>()

const emit = defineEmits<{
  (e: 'budget-updated'): void
}>()

const sortKey = ref<string>('spend')
const sortDir = ref<'asc' | 'desc'>('desc')

// Active pacing alerts, matched to rows by media_spend id.
const { alertsFor } = useSpendAlerts()

// Budget edit modal
const budgetModalOpen = ref(false)
const budgetModalTarget = ref<BudgetEditTarget | null>(null)

function openBudgetModal(item: typeof props.items[0]) {
  budgetModalTarget.value = {
    title: item.clientName,
    subtitle: platformLabel(item.platform),
    platform: item.platform,
    spendIds: item.spendIds ?? [],
    budget: item.budget,
    spend: item.spend,
    commission: item.commission,
    commissionRate: item.commissionRate ?? null,
    rolling: item.rolling ?? false,
    lastSyncedAt: item.lastSyncedAt ?? null,
    historySpendId: null, // aggregated per-client row — no single-row history
    alerts: alertsFor(item.spendIds)
  }
  budgetModalOpen.value = true
}

const hasBankData = computed(() => {
  if (!props.bankCharges?.connected) return false
  return props.bankCharges.total > 0 || (props.bankCharges.metaBilling?.total ?? 0) > 0
})

// Pre-compute platform spend totals for proportional bank charge calculation
const platformSpendTotals = computed(() => {
  const totals: Record<string, number> = {}
  for (const item of props.items) {
    const key = normalizePlatform(item.platform)
    totals[key] = (totals[key] || 0) + item.spend
  }
  return totals
})

function normalizePlatform(p: string): string {
  if (p === 'google') return 'google_ads'
  return p
}

/**
 * Calculate proportional bank charge for a row.
 * Sources: Xero bank/CC transactions (pattern-matched) + Meta Billing API (fallback for meta).
 * Bank charges are platform-level lump sums — distributed proportionally by client spend share.
 */
function bankChargeForItem(item: { platform: string; spend: number }): number | null {
  if (!props.bankCharges?.connected) return null
  const key = normalizePlatform(item.platform)

  // Try Xero bank/CC data first
  let platformBankTotal = props.bankCharges.byPlatform[key]?.total ?? 0

  // For Meta: if no Xero bank data, use Meta Billing API as fallback
  if (platformBankTotal <= 0 && key === 'meta' && props.bankCharges.metaBilling?.total) {
    platformBankTotal = props.bankCharges.metaBilling.total
  }

  if (platformBankTotal <= 0) return null
  const platformTotal = platformSpendTotals.value[key]
  if (!platformTotal || platformTotal <= 0) return null
  return Math.round(platformBankTotal * (item.spend / platformTotal) * 100) / 100
}

/** Returns 'xero' | 'meta_billing' | null to indicate charge data source */
function bankChargeSource(item: { platform: string }): string | null {
  if (!props.bankCharges?.connected) return null
  const key = normalizePlatform(item.platform)
  if ((props.bankCharges.byPlatform[key]?.total ?? 0) > 0) return 'xero'
  if (key === 'meta' && (props.bankCharges.metaBilling?.total ?? 0) > 0) return 'meta_billing'
  return null
}

function bankDiff(item: { platform: string; spend: number }): number | null {
  const bank = bankChargeForItem(item)
  if (bank == null) return null
  return Math.round((bank - item.spend) * 100) / 100
}

function bankDiffClass(diff: number): string {
  if (Math.abs(diff) < 1) return 'text-muted'
  return diff > 0 ? 'text-amber-500' : 'text-emerald-500'
}

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

const filtered = computed(() => {
  let items = [...props.items]
  if (props.search) {
    const q = props.search.toLowerCase()
    items = items.filter(i =>
      i.clientName.toLowerCase().includes(q) ||
      (i.clientCode && i.clientCode.toLowerCase().includes(q)) ||
      platformLabel(i.platform).toLowerCase().includes(q)
    )
  }
  items.sort((a: any, b: any) => {
    const av = a[sortKey.value] ?? 0
    const bv = b[sortKey.value] ?? 0
    if (typeof av === 'string') return sortDir.value === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir.value === 'asc' ? av - bv : bv - av
  })
  return items
})

function itemKey(item: { platform: string; clientName: string }) {
  return `${item.platform}-${item.clientName}`
}

const STALE_MS = 24 * 60 * 60 * 1000

function isStale(lastSyncedAt: string | null | undefined): boolean {
  if (!lastSyncedAt) return false  // null is rendered as "Never synced" elsewhere; only flag rows with a real-but-old timestamp
  return Date.now() - new Date(lastSyncedAt).getTime() > STALE_MS
}

function staleTooltip(lastSyncedAt: string | null | undefined): string {
  if (!lastSyncedAt) return 'Never synced'
  return `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val)
}

function varianceClass(pct: number) {
  if (Math.abs(pct) < 5) return 'text-muted'
  return pct > 0 ? 'text-error' : 'text-success'
}

function platformIcon(p: string) {
  if (p === 'meta') return 'i-lucide-facebook'
  if (p === 'google' || p === 'google_ads') return 'i-lucide-chrome'
  return 'i-lucide-globe'
}

function platformLabel(p: string) {
  if (p === 'meta') return 'Meta'
  if (p === 'google' || p === 'google_ads') return 'Google Ads'
  return p
}

function pacingInfo(item: { budget: number; spend: number }) {
  if (item.budget <= 0 || props.monthProgress == null) return null
  const spentPct = (item.spend / item.budget) * 100
  const progress = props.monthProgress
  const ratio = progress > 0 ? spentPct / progress : 0
  return { spentPct: Math.round(spentPct), ratio: Math.round(ratio * 100) / 100 }
}

function pacingColor(ratio: number) {
  if (ratio > 1.15) return 'bg-red-500'
  if (ratio > 1.05) return 'bg-amber-500'
  if (ratio < 0.8) return 'bg-blue-500'
  return 'bg-emerald-500'
}

function pacingTextColor(ratio: number) {
  if (ratio > 1.15) return 'text-red-500'
  if (ratio > 1.05) return 'text-amber-500'
  if (ratio < 0.8) return 'text-blue-500'
  return 'text-emerald-500'
}

/** Combined bank total: Xero bank/CC + Meta billing (for platforms not already in Xero) */
const combinedBankTotal = computed(() => {
  if (!props.bankCharges) return 0
  let total = props.bankCharges.total // Xero-matched total
  // Add Meta billing only if Meta wasn't already matched in Xero
  const metaXero = props.bankCharges.byPlatform['meta']?.total ?? 0
  if (metaXero <= 0 && props.bankCharges.metaBilling?.total) {
    total += props.bankCharges.metaBilling.total
  }
  return Math.round(total * 100) / 100
})

const totalColSpan = computed(() => hasBankData.value ? 9 : 8)
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-default text-left">
          <th class="py-2 px-3 font-medium text-muted cursor-pointer" @click="toggleSort('clientName')">
            Client
            <UIcon v-if="sortKey === 'clientName'" :name="sortDir === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3 ml-0.5 inline" />
          </th>
          <th class="py-2 px-3 font-medium text-muted">Platform</th>
          <th class="py-2 px-3 font-medium text-muted text-right cursor-pointer" @click="toggleSort('budget')">
            Budget
            <UIcon v-if="sortKey === 'budget'" :name="sortDir === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3 ml-0.5 inline" />
          </th>
          <th class="py-2 px-3 font-medium text-muted text-right cursor-pointer" @click="toggleSort('spend')">
            Spend
            <UIcon v-if="sortKey === 'spend'" :name="sortDir === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3 ml-0.5 inline" />
          </th>
          <!-- Bank Charged column -->
          <th v-if="hasBankData" class="py-2 px-3 font-medium text-muted text-right">
            <UTooltip text="Actual charges from Xero bank/CC transactions + Meta Billing API, proportionally split by client spend share">
              <span class="border-b border-dashed border-current cursor-help">Bank Charged</span>
            </UTooltip>
          </th>
          <th class="py-2 px-3 font-medium text-muted text-center w-28">Pacing</th>
          <th class="py-2 px-3 font-medium text-muted text-right cursor-pointer" @click="toggleSort('commission')">
            Commission
            <UIcon v-if="sortKey === 'commission'" :name="sortDir === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3 ml-0.5 inline" />
          </th>
          <th class="py-2 px-3 font-medium text-muted text-right cursor-pointer" @click="toggleSort('variance')">
            Variance
            <UIcon v-if="sortKey === 'variance'" :name="sortDir === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3 ml-0.5 inline" />
          </th>
          <th class="py-2 px-3 font-medium text-muted text-right">Var %</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in filtered" :key="itemKey(item)" class="border-b border-default/50 hover:bg-elevated/50 group">
          <td class="py-2 px-3 font-medium">
            <span>{{ item.clientName }}</span>
            <UTooltip v-if="isStale(item.lastSyncedAt)" :text="staleTooltip(item.lastSyncedAt)">
              <UBadge color="warning" variant="subtle" size="xs" icon="i-lucide-clock" class="ml-2 align-middle">
                stale
              </UBadge>
            </UTooltip>
            <SocialSpendAlertBadge :alerts="alertsFor(item.spendIds)" class="ml-2" />
          </td>
          <td class="py-2 px-3">
            <div class="flex items-center gap-1">
              <UIcon :name="platformIcon(item.platform)" class="w-4 h-4" />
              <span>{{ platformLabel(item.platform) }}</span>
            </div>
          </td>
          <!-- Budget cell — click to open the budget editor modal -->
          <td class="py-2 px-3 text-right">
            <div class="flex flex-col items-end gap-0.5">
              <button
                class="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                @click="openBudgetModal(item)"
              >
                <span v-if="item.budget > 0">{{ formatCurrency(item.budget) }}</span>
                <span v-else class="text-muted/50 text-xs">Set budget</span>
                <UIcon name="i-lucide-pencil" class="size-3 opacity-0 group-hover:opacity-50" />
              </button>
              <UBadge v-if="item.rolling" size="xs" color="info" variant="subtle" class="gap-0.5">
                <UIcon name="i-lucide-repeat" class="size-3" />
                Rolling
              </UBadge>
            </div>
          </td>
          <td class="py-2 px-3 text-right font-medium">{{ formatCurrency(item.spend) }}</td>
          <!-- Bank Charged cell -->
          <td v-if="hasBankData" class="py-2 px-3 text-right">
            <template v-if="bankChargeForItem(item) != null">
              <div class="flex flex-col items-end gap-0.5">
                <div class="flex items-center gap-1 justify-end">
                  <span class="font-medium">{{ formatCurrency(bankChargeForItem(item)!) }}</span>
                  <UTooltip :text="bankChargeSource(item) === 'meta_billing' ? 'Source: Meta Billing API' : 'Source: Xero bank/CC'">
                    <UIcon
                      :name="bankChargeSource(item) === 'meta_billing' ? 'i-lucide-facebook' : 'i-lucide-landmark'"
                      class="size-3 text-muted"
                    />
                  </UTooltip>
                </div>
                <span
                  v-if="bankDiff(item) != null && Math.abs(bankDiff(item)!) >= 1"
                  class="text-[10px] font-medium"
                  :class="bankDiffClass(bankDiff(item)!)"
                >
                  {{ bankDiff(item)! > 0 ? '+' : '' }}{{ formatCurrency(bankDiff(item)!) }}
                </span>
              </div>
            </template>
            <span v-else class="text-muted">-</span>
          </td>
          <!-- Pacing cell -->
          <td class="py-2 px-3">
            <template v-if="pacingInfo(item)">
              <div class="flex flex-col items-center gap-0.5">
                <span class="text-[10px] font-medium" :class="pacingTextColor(pacingInfo(item)!.ratio)">
                  {{ pacingInfo(item)!.spentPct }}%
                </span>
                <div class="w-full h-1.5 bg-elevated rounded-full overflow-hidden relative">
                  <div class="absolute inset-y-0 left-0 bg-muted/30 rounded-full" :style="{ width: `${monthProgress}%` }" />
                  <div
                    class="absolute inset-y-0 left-0 rounded-full transition-all"
                    :class="pacingColor(pacingInfo(item)!.ratio)"
                    :style="{ width: `${Math.min(pacingInfo(item)!.spentPct, 100)}%` }"
                  />
                </div>
              </div>
            </template>
            <span v-else class="text-muted text-center block">-</span>
          </td>
          <td class="py-2 px-3 text-right">
            <div class="flex flex-col items-end gap-0.5">
              <span v-if="item.commission > 0">{{ formatCurrency(item.commission) }}</span>
              <span v-else class="text-muted">-</span>
              <span v-if="(item.commissionRate ?? 0) > 0" class="text-[10px] text-muted">{{ item.commissionRate }}%</span>
            </div>
          </td>
          <td class="py-2 px-3 text-right" :class="varianceClass(item.variancePercent)">
            {{ item.budget > 0 ? formatCurrency(item.variance) : '-' }}
          </td>
          <td class="py-2 px-3 text-right" :class="varianceClass(item.variancePercent)">
            {{ item.budget > 0 ? `${item.variancePercent > 0 ? '+' : ''}${item.variancePercent}%` : '-' }}
          </td>
        </tr>
        <tr v-if="filtered.length === 0">
          <td :colspan="totalColSpan" class="py-6 text-center text-muted text-sm">No matching results</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="border-t-2 border-default font-semibold">
          <td class="py-2 px-3" colspan="2">Totals</td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(totals.budget) }}</td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(totals.spend) }}</td>
          <td v-if="hasBankData" class="py-2 px-3 text-right">
            <div class="flex flex-col items-end gap-0.5">
              <span>{{ formatCurrency(combinedBankTotal) }}</span>
              <span
                v-if="Math.abs(combinedBankTotal - totals.spend) >= 1"
                class="text-[10px] font-medium"
                :class="bankDiffClass(combinedBankTotal - totals.spend)"
              >
                {{ combinedBankTotal - totals.spend > 0 ? '+' : '' }}{{ formatCurrency(combinedBankTotal - totals.spend) }}
              </span>
            </div>
          </td>
          <td class="py-2 px-3"></td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(totals.commission) }}</td>
          <td class="py-2 px-3 text-right" :class="varianceClass(totals.budget > 0 ? ((totals.spend - totals.budget) / totals.budget) * 100 : 0)">
            {{ formatCurrency(totals.variance) }}
          </td>
          <td class="py-2 px-3 text-right"></td>
        </tr>
      </tfoot>
    </table>

    <SocialSpendBudgetEditModal
      v-model:open="budgetModalOpen"
      :target="budgetModalTarget"
      :month-progress="monthProgress"
      @saved="$emit('budget-updated')"
    />
  </div>
</template>
