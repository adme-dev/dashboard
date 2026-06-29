<script setup lang="ts">
import { rollupSpendByClient, paceStatus } from '~/utils/spendRollup'

const now = new Date()
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
const dayOfMonth = now.getDate()
const monthProgress = dayOfMonth / daysInMonth
const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
const today = now.toISOString().slice(0, 10)

const { data, status } = await useFetch('/api/agency/social/spend/summary')
// MTD daily spend for the trend line (degrades to no chart if unavailable).
const { data: daily } = await useFetch('/api/agency/analytics/daily-spend', {
  query: { from: monthStart, to: today },
})

const CAP = 5
const rows = computed(() =>
  rollupSpendByClient((data.value as any)?.items || [])
    .map(r => ({ ...r, ...paceStatus(r.spend, r.budget, monthProgress) }))
    .filter(r => r.budget > 0), // pacing is only meaningful against a budget
)
const top = computed(() => rows.value.slice(0, CAP))
const overCount = computed(() => rows.value.filter(r => r.status === 'over').length)
const underCount = computed(() => rows.value.filter(r => r.status === 'under').length)

const badges = computed(() => {
  const out: { label: string, color?: any }[] = [{ label: `Day ${dayOfMonth}/${daysInMonth}` }]
  if (overCount.value) out.push({ label: `${overCount.value} over`, color: 'error' })
  if (underCount.value) out.push({ label: `${underCount.value} under`, color: 'warning' })
  return out
})

const STATUS: Record<string, { label: string, color: any, bar: string }> = {
  on_track: { label: 'On track', color: 'success', bar: 'bg-emerald-500' },
  over: { label: 'Over', color: 'error', bar: 'bg-red-500' },
  under: { label: 'Under', color: 'warning', bar: 'bg-amber-500' },
  no_budget: { label: '—', color: 'neutral', bar: 'bg-neutral-400' },
}

const totals = computed(() => (data.value as any)?.totals || { spend: 0, budget: 0 })

// MTD cumulative-spend curve vs a linear pace line to total budget.
const trend = computed(() => {
  const arr = (Array.isArray(daily.value) ? daily.value : []) as any[]
  const sorted = [...arr].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let cum = 0
  const pts = sorted.map((d) => { cum += Number(d.spend) || 0; return cum })
  const budget = totals.value.budget || 0
  const max = Math.max(cum, budget, 1)
  const n = Math.max(pts.length - 1, 1)
  const W = 220, H = 44
  const actual = pts.map((v, i) => `${(i / n) * W},${(H - (v / max) * H).toFixed(1)}`).join(' ')
  const paceY2 = H - (budget / max) * H
  return { actual, area: pts.length ? `0,${H} ${actual} ${W},${H}` : '', paceX2: W, paceY2, has: pts.length > 1 }
})

const PLATFORM_ICON: Record<string, { icon: string, color: string }> = {
  meta: { icon: 'i-lucide-facebook', color: 'text-blue-500' },
  google: { icon: 'i-lucide-chrome', color: 'text-red-500' },
  tiktok: { icon: 'i-lucide-music-2', color: 'text-[var(--ui-text-muted)]' },
  spotify: { icon: 'i-lucide-music', color: 'text-emerald-500' },
  other: { icon: 'i-lucide-megaphone', color: 'text-[var(--ui-text-muted)]' },
}
</script>

<template>
  <DashboardWidgetShell
    title="Spend Pacing"
    icon="i-lucide-gauge"
    :badges="badges"
    to="/agency/social/spend"
    view-all-label="Spend"
    :loading="status === 'pending'"
    :is-empty="!top.length"
    empty-text="No budgets to pace"
    empty-icon="i-lucide-gauge"
    :more-count="Math.max(rows.length - top.length, 0)"
  >
    <!-- MTD trend: spend curve vs pace line -->
    <div v-if="trend.has" class="mb-3">
      <svg width="100%" height="44" viewBox="0 0 220 44" preserveAspectRatio="none">
        <polygon :points="trend.area" fill="var(--ui-bg-elevated)" />
        <polyline :points="trend.actual" fill="none" stroke="#2563eb" stroke-width="2" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="44" :x2="trend.paceX2" :y2="trend.paceY2" stroke="var(--ui-text-muted)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="flex items-center justify-between text-[10px] text-[var(--ui-text-muted)] mt-0.5">
        <span class="flex items-center gap-1"><span class="w-2 h-0.5 bg-blue-600 inline-block" /> MTD spend</span>
        <span class="flex items-center gap-1"><span class="w-2 border-t border-dashed border-[var(--ui-text-muted)] inline-block" /> pace to budget</span>
      </div>
    </div>

    <!-- Per-client pacing -->
    <div class="space-y-2.5">
      <div v-for="row in top" :key="row.client" class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-0.5 shrink-0">
            <UIcon
              v-for="p in row.platforms"
              :key="p"
              :name="(PLATFORM_ICON[p] || PLATFORM_ICON.other).icon"
              class="w-3.5 h-3.5"
              :class="(PLATFORM_ICON[p] || PLATFORM_ICON.other).color"
            />
          </span>
          <span class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate flex-1">{{ row.client }}</span>
          <UBadge :color="(STATUS[row.status] || STATUS.no_budget).color" variant="subtle" size="xs">
            {{ (STATUS[row.status] || STATUS.no_budget).label }}
          </UBadge>
          <span class="text-xs font-medium text-[var(--ui-text-muted)] shrink-0 w-11 text-right">{{ row.pacing }}%</span>
        </div>
        <div class="h-1.5 bg-[var(--ui-bg-elevated)] rounded-full overflow-hidden">
          <div class="h-full rounded-full" :class="(STATUS[row.status] || STATUS.no_budget).bar" :style="{ width: `${Math.min(row.pacing, 100)}%` }" />
        </div>
      </div>
    </div>
  </DashboardWidgetShell>
</template>
