<script setup lang="ts">
// Shared internal-budget editor modal. Used by the spend variance table
// (per-client, aggregated spendIds) and the per-platform campaign pages
// (per-campaign, single spendId + budget history). Owns the bulk-budget PATCH
// and emits `saved` so the parent can refresh.

export interface SpendAlertLite {
  id: string
  severity: string
  title: string
  description: string
  recommendation?: string | null
}

export interface BudgetEditTarget {
  title: string
  subtitle?: string | null
  platform: string
  spendIds: string[]
  budget: number
  spend: number
  commission?: number
  commissionRate?: number | null
  rolling?: boolean
  lastSyncedAt?: string | null
  historySpendId?: string | null
  alerts?: SpendAlertLite[]
}

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  target: BudgetEditTarget | null
  monthProgress?: number | null
}>()
const emit = defineEmits<{ (e: 'saved'): void }>()

const toast = useToast()

const editBudget = ref('')
const editCommissionRate = ref('')
const editRolling = ref(false)
const saving = ref(false)

interface HistoryEntry {
  id: string
  previousBudget: number
  newBudget: number
  changedByName: string
  changedByAvatar: string | null
  changedAt: string
}
const history = ref<HistoryEntry[]>([])
const historyLoading = ref(false)

// Seed the form from the target each time the modal opens, and pull history
// when a single spend row is in scope.
watch(open, async (isOpen) => {
  if (!isOpen || !props.target) return
  const t = props.target
  editBudget.value = t.budget > 0 ? String(t.budget) : ''
  editCommissionRate.value = (t.commissionRate ?? 0) > 0 ? String(t.commissionRate) : ''
  editRolling.value = t.rolling ?? false
  history.value = []
  if (t.historySpendId) {
    historyLoading.value = true
    try {
      history.value = await $fetch<HistoryEntry[]>(`/api/agency/social/spend/${t.historySpendId}/history`)
    } catch {
      history.value = []
    } finally {
      historyLoading.value = false
    }
  }
})

function fmt(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val)
}
function fmtTime(s: string) {
  const d = new Date(s)
  return `${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}
function platformLabel(p: string) {
  if (p === 'meta') return 'Meta'
  if (p === 'google' || p === 'google_ads') return 'Google Ads'
  if (p === 'tiktok') return 'TikTok'
  return p
}
function platformIcon(p: string) {
  if (p === 'meta') return 'i-lucide-facebook'
  if (p === 'google' || p === 'google_ads') return 'i-lucide-chrome'
  return 'i-lucide-globe'
}

function alertIcon(sev: string) {
  return sev === 'critical' ? 'i-lucide-octagon-alert' : 'i-lucide-triangle-alert'
}
function alertColor(sev: string) {
  return sev === 'critical' ? 'text-red-500' : 'text-amber-500'
}

const variance = computed(() => {
  const t = props.target
  if (!t || t.budget <= 0) return null
  const amount = t.spend - t.budget
  return { amount, percent: Math.round((amount / t.budget) * 1000) / 10 }
})

const pacing = computed(() => {
  const t = props.target
  if (!t || t.budget <= 0) return null
  const spentPct = Math.round((t.spend / t.budget) * 100)
  const mp = props.monthProgress ?? null
  let verdict = `${spentPct}% of budget spent.`
  let tone: 'over' | 'under' | 'on' = 'on'
  if (mp != null && mp > 0) {
    const diff = Math.round(spentPct - mp)
    if (diff > 5) {
      tone = 'over'
      verdict = `Tracking ${diff}% ahead of pace — ${spentPct}% spent with ${Math.round(mp)}% of the month elapsed.`
    } else if (diff < -5) {
      tone = 'under'
      verdict = `Tracking ${Math.abs(diff)}% behind pace — ${spentPct}% spent with ${Math.round(mp)}% of the month elapsed.`
    } else {
      verdict = `On pace — ${spentPct}% spent with ${Math.round(mp)}% of the month elapsed.`
    }
  }
  return { spentPct, monthProgress: mp, verdict, tone }
})

function paceBarColor(tone: string) {
  if (tone === 'over') return 'bg-red-500'
  if (tone === 'under') return 'bg-blue-500'
  return 'bg-emerald-500'
}
function paceTextColor(tone: string) {
  if (tone === 'over') return 'text-red-500'
  if (tone === 'under') return 'text-blue-500'
  return 'text-emerald-500'
}

async function save() {
  const t = props.target
  if (!t) return
  const budget = parseFloat(editBudget.value)
  if (isNaN(budget) || budget < 0) {
    toast.add({ title: 'Invalid budget', description: 'Enter a valid non-negative number', color: 'error' })
    return
  }
  const commRate = editCommissionRate.value ? parseFloat(editCommissionRate.value) : null
  if (commRate != null && (isNaN(commRate) || commRate < 0 || commRate > 100)) {
    toast.add({ title: 'Invalid commission rate', description: 'Enter a percentage between 0 and 100', color: 'error' })
    return
  }
  if (!t.spendIds?.length) {
    toast.add({ title: 'Cannot update', description: 'No spend records linked', color: 'error' })
    return
  }
  saving.value = true
  try {
    const body: Record<string, unknown> = { spendIds: t.spendIds, budgetAllocated: budget, rolling: editRolling.value }
    if (commRate != null) body.commissionRate = commRate
    await $fetch('/api/agency/social/spend/bulk-budget', { method: 'PATCH', body })
    toast.add({ title: 'Budget updated', description: `${t.title} budget set to ${fmt(budget)}`, color: 'success' })
    open.value = false
    emit('saved')
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-lg' }">
    <template #content>
      <div v-if="target" class="divide-y divide-default">
        <!-- Header -->
        <div class="flex items-start justify-between gap-3 p-4 sm:p-5">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <UIcon :name="platformIcon(target.platform)" class="size-4 text-muted shrink-0" />
              <h3 class="text-base font-semibold truncate">{{ target.title }}</h3>
            </div>
            <p class="mt-0.5 text-xs text-muted">
              {{ target.subtitle || platformLabel(target.platform) }} · internal budget
            </p>
          </div>
          <UButton color="neutral" variant="ghost" icon="i-lucide-x" size="xs" @click="open = false" />
        </div>

        <!-- Context strip -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-default">
          <div class="bg-elevated/30 px-4 py-3">
            <p class="text-[11px] uppercase tracking-wide text-muted">Spend MTD</p>
            <p class="mt-0.5 font-semibold tabular-nums">{{ fmt(target.spend) }}</p>
          </div>
          <div class="bg-elevated/30 px-4 py-3">
            <p class="text-[11px] uppercase tracking-wide text-muted">Budget</p>
            <p class="mt-0.5 font-semibold tabular-nums">{{ target.budget > 0 ? fmt(target.budget) : '—' }}</p>
          </div>
          <div class="bg-elevated/30 px-4 py-3">
            <p class="text-[11px] uppercase tracking-wide text-muted">Variance</p>
            <p
              v-if="variance"
              class="mt-0.5 font-semibold tabular-nums"
              :class="variance.amount > 0 ? 'text-red-500' : 'text-emerald-500'"
            >
              {{ variance.amount > 0 ? '+' : '' }}{{ fmt(variance.amount) }}
              <span class="text-[11px] font-normal">({{ variance.percent > 0 ? '+' : '' }}{{ variance.percent }}%)</span>
            </p>
            <p v-else class="mt-0.5 font-semibold text-muted">—</p>
          </div>
          <div class="bg-elevated/30 px-4 py-3">
            <p class="text-[11px] uppercase tracking-wide text-muted">Commission</p>
            <p class="mt-0.5 font-semibold tabular-nums">{{ (target.commission ?? 0) > 0 ? fmt(target.commission!) : '—' }}</p>
          </div>
        </div>

        <!-- Active alerts -->
        <div v-if="target.alerts?.length" class="px-4 sm:px-5 py-4">
          <p class="text-xs font-medium text-muted mb-2">Active alerts</p>
          <ul class="space-y-2.5">
            <li v-for="a in target.alerts" :key="a.id" class="flex items-start gap-2">
              <UIcon :name="alertIcon(a.severity)" class="size-4 mt-0.5 shrink-0" :class="alertColor(a.severity)" />
              <div class="min-w-0 text-xs">
                <p class="font-medium">{{ a.title }}</p>
                <p class="text-muted">{{ a.description }}</p>
                <p v-if="a.recommendation" class="text-muted/80 mt-0.5 italic">{{ a.recommendation }}</p>
              </div>
            </li>
          </ul>
        </div>

        <!-- Pacing -->
        <div v-if="pacing" class="px-4 sm:px-5 py-4">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-muted">Pacing</span>
            <span class="text-xs font-medium tabular-nums" :class="paceTextColor(pacing.tone)">{{ pacing.spentPct }}%</span>
          </div>
          <div class="h-2 bg-elevated rounded-full overflow-hidden relative">
            <div
              v-if="pacing.monthProgress != null"
              class="absolute inset-y-0 left-0 bg-muted/30"
              :style="{ width: `${pacing.monthProgress}%` }"
            />
            <div
              class="absolute inset-y-0 left-0 rounded-full transition-all"
              :class="paceBarColor(pacing.tone)"
              :style="{ width: `${Math.min(pacing.spentPct, 100)}%` }"
            />
          </div>
          <p class="mt-2 text-xs text-muted">{{ pacing.verdict }}</p>
        </div>

        <!-- Edit form -->
        <div class="px-4 sm:px-5 py-4 space-y-4">
          <UFormField label="Monthly budget" help="The internal budget you're pacing this campaign against.">
            <UInput
              v-model="editBudget"
              type="number"
              min="0"
              step="100"
              placeholder="0"
              autofocus
              class="w-full"
              @keydown.enter="save"
            >
              <template #leading>
                <span class="text-muted text-sm">$</span>
              </template>
            </UInput>
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Commission rate" help="Optional. 0–100%.">
              <UInput
                v-model="editCommissionRate"
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
                class="w-full"
                @keydown.enter="save"
              >
                <template #trailing>
                  <span class="text-muted text-sm">%</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField label="Rolling budget" help="Carries forward to future months automatically.">
              <USwitch v-model="editRolling" />
            </UFormField>
          </div>
        </div>

        <!-- Budget history -->
        <div v-if="target.historySpendId" class="px-4 sm:px-5 py-4">
          <p class="text-xs font-medium text-muted mb-2">Budget history</p>
          <div v-if="historyLoading" class="text-xs text-muted py-2">Loading…</div>
          <div v-else-if="history.length === 0" class="text-xs text-muted py-2">No changes recorded yet.</div>
          <ul v-else class="space-y-2 max-h-44 overflow-y-auto">
            <li v-for="entry in history" :key="entry.id" class="flex items-start gap-2 text-xs">
              <UAvatar v-if="entry.changedByAvatar" :src="entry.changedByAvatar" size="2xs" />
              <UIcon v-else name="i-lucide-user" class="size-4 text-muted mt-0.5 shrink-0" />
              <div class="min-w-0">
                <span class="font-medium">{{ entry.changedByName }}</span>
                <span class="text-muted"> changed </span>
                <span class="line-through text-muted tabular-nums">{{ fmt(entry.previousBudget) }}</span>
                <span class="text-muted"> → </span>
                <span class="font-medium tabular-nums">{{ fmt(entry.newBudget) }}</span>
                <div class="text-muted">{{ fmtTime(entry.changedAt) }}</div>
              </div>
            </li>
          </ul>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 p-4 sm:p-5">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" @click="save">Save budget</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
