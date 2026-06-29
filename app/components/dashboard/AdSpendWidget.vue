<script setup lang="ts">
import { rollupSpendByClient } from '~/utils/spendRollup'

const { data, status } = await useFetch('/api/agency/social/spend/summary')

const CAP = 5
const clientRows = computed(() => rollupSpendByClient((data.value as any)?.items || []))
const top = computed(() => clientRows.value.slice(0, CAP))
const totals = computed(() => (data.value as any)?.totals || { spend: 0, budget: 0 })
const pct = computed(() => totals.value.budget > 0 ? Math.round((totals.value.spend / totals.value.budget) * 100) : 0)

const badges = computed(() => {
  const out: { label: string, color?: any }[] = [{ label: `${fmt(totals.value.spend)} spent` }]
  if (totals.value.budget > 0) out.push({ label: `${pct.value}% of ${fmt(totals.value.budget)}`, color: pct.value > 100 ? 'error' : 'neutral' })
  return out
})

const PLATFORM_ICON: Record<string, { icon: string, color: string }> = {
  meta: { icon: 'i-lucide-facebook', color: 'text-blue-500' },
  google: { icon: 'i-lucide-chrome', color: 'text-red-500' },
  tiktok: { icon: 'i-lucide-music-2', color: 'text-[var(--ui-text-muted)]' },
  spotify: { icon: 'i-lucide-music', color: 'text-emerald-500' },
  other: { icon: 'i-lucide-megaphone', color: 'text-[var(--ui-text-muted)]' },
}

const palette = ['#2563eb', '#dc2626', '#7c3aed', '#16a34a', '#ea580c', '#0891b2']

// Donut segments by client spend share (top 5 clients + "Other").
const donut = computed(() => {
  const rows = clientRows.value.filter(r => r.spend > 0)
  const total = rows.reduce((s, r) => s + r.spend, 0)
  if (!total) return [] as Array<{ name: string, value: number, start: number, end: number, color: string }>
  const top5 = rows.slice(0, 5)
  const otherVal = rows.slice(5).reduce((s, r) => s + r.spend, 0)
  const segs: Array<{ client: string, spend: number }> = otherVal > 0 ? [...top5, { client: 'Other', spend: otherVal }] : top5
  let cum = 0
  return segs.map((r, i) => {
    const share = (r.spend / total) * 100
    const start = cum
    cum += share
    return { name: r.client, value: r.spend, start, end: cum, color: palette[i % palette.length] }
  })
})

function arc(startPct: number, endPct: number, inner = 26, outer = 40) {
  const cx = 48, cy = 48
  const a0 = (startPct / 100) * 2 * Math.PI - Math.PI / 2
  const a1 = (endPct / 100) * 2 * Math.PI - Math.PI / 2
  const x1 = cx + outer * Math.cos(a0), y1 = cy + outer * Math.sin(a0)
  const x2 = cx + outer * Math.cos(a1), y2 = cy + outer * Math.sin(a1)
  const x3 = cx + inner * Math.cos(a1), y3 = cy + inner * Math.sin(a1)
  const x4 = cx + inner * Math.cos(a0), y4 = cy + inner * Math.sin(a0)
  const large = (endPct - startPct) > 50 ? 1 : 0
  return `M${x1},${y1} A${outer},${outer} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`
}

function fmt(v: number) {
  if ((v || 0) >= 1000) return `$${((v || 0) / 1000).toFixed(1)}k`
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v || 0)
}
</script>

<template>
  <DashboardWidgetShell
    title="Ad Spend"
    icon="i-lucide-megaphone"
    :badges="badges"
    to="/agency/social/spend"
    view-all-label="Spend"
    :loading="status === 'pending'"
    :is-empty="!top.length"
    empty-text="No ad spend this period"
    empty-icon="i-lucide-megaphone"
    :more-count="Math.max(clientRows.length - top.length, 0)"
  >
    <div class="flex items-start gap-4">
      <!-- Spend-share donut -->
      <div v-if="donut.length" class="shrink-0 relative">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <path
            v-for="seg in donut"
            :key="seg.name"
            :d="arc(seg.start, seg.end)"
            :fill="seg.color"
            stroke="var(--ui-bg)"
            stroke-width="1.5"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span class="text-xs font-bold text-[var(--ui-text-highlighted)]">{{ fmt(totals.spend) }}</span>
          <span class="text-[9px] text-[var(--ui-text-muted)]">spent</span>
        </div>
      </div>

      <!-- Client rows -->
      <div class="flex-1 min-w-0 space-y-2.5">
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
            <span class="text-xs text-[var(--ui-text-muted)] shrink-0">
              {{ fmt(row.spend) }}<span v-if="row.budget"> / {{ fmt(row.budget) }}</span>
            </span>
          </div>
          <div v-if="row.budget" class="h-1.5 bg-[var(--ui-bg-elevated)] rounded-full overflow-hidden">
            <div
              class="h-full rounded-full"
              :class="row.pct > 100 ? 'bg-red-500' : row.pct >= 80 ? 'bg-emerald-500' : 'bg-amber-500'"
              :style="{ width: `${Math.min(row.pct, 100)}%` }"
            />
          </div>
        </div>
      </div>
    </div>
  </DashboardWidgetShell>
</template>
