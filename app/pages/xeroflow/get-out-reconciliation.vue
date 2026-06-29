<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })

interface BucketTotal { exGst: number; contribution: number; codeCount: number }
interface CodeLine {
  code: string; name?: string; exGst: number; gst: number
  bucket: 'media' | 'printing' | 'owned' | 'excluded'; keepPct: number; contribution: number; unmapped: boolean
}
interface ReconResponse {
  month: { year: number; month: number; label: string }
  rulesUsed: { keepByBucket: Record<string, number>; bucketByCode: Record<string, string>; defaultBucket: string }
  invoiceCount: number
  truncated: boolean
  gross: { exGst: number; gst: number; inclGst: number }
  admeMargin: number
  byBucket: Record<'media' | 'printing' | 'owned' | 'excluded', BucketTotal>
  byCode: CodeLine[]
  topTrackingMedia: Array<{ option: string; exGst: number }>
  target: number
  position: number
  note: string
}

// ── Controls ──
function lastMonths(count: number): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1) // start at last complete month
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear(); const m = d.getMonth() + 1
    out.push({
      label: d.toLocaleString('en-AU', { month: 'long', year: 'numeric' }),
      value: `${y}-${String(m).padStart(2, '0')}`,
    })
    d.setMonth(d.getMonth() - 1)
  }
  return out
}
const monthOptions = lastMonths(12)
const month = ref(monthOptions[0]!.value)
const mediaKeepPct = ref(16)     // %
const printingKeepPct = ref(33)  // %

const query = computed(() => ({
  month: month.value,
  mediaKeep: (mediaKeepPct.value / 100).toString(),
  printingKeep: (printingKeepPct.value / 100).toString(),
}))

const { data, pending, error, refresh } = await useFetch<ReconResponse>(
  '/api/xero/get-out/revenue-reconciliation',
  { query, lazy: true, server: false },
)

// ── AGI (accurate model: Revenue − Direct Costs from cached lines) ──
interface AgiResponse {
  currentMon: string
  directCostCodes: string[]
  target: number
  headline: { agiTrailing3Avg: number; agiTrailing12Avg: number; marginPctTrailing12: number | null; currentMonthAgi: number | null; position: number }
  months: Array<{ mon: string; revenue: number; directCost: number; agi: number; marginPct: number | null }>
  trailing12: { avgAgi: number; avgMarginPct: number | null; totalRevenue: number; totalDirectCost: number; totalAgi: number; months: number }
  note: string
}
const { data: agi } = await useFetch<AgiResponse>('/api/xero/get-out/agi', {
  query: { months: 13 }, lazy: true, server: false,
})

const fmt = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)
const fmtc = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(v)

const bucketColor = (b: string) =>
  b === 'owned' ? 'success' : b === 'media' ? 'info' : b === 'printing' ? 'warning' : 'neutral'

const buckets = computed(() => {
  const bb = data.value?.byBucket
  if (!bb) return []
  return (['owned', 'media', 'printing', 'excluded'] as const).map(k => ({ bucket: k, ...bb[k] }))
})
</script>

<template>
  <UDashboardPanel id="get-out-reconciliation">
    <template #header>
      <UDashboardNavbar title="Get Out — Revenue Reconciliation">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="pending" @click="refresh()" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UAlert
          icon="i-lucide-flask-conical"
          color="info"
          variant="subtle"
          title="Read-only accuracy harness"
          description="Reconciles live Xero invoicing to ADME net revenue. Dial the media/printing rates until ADME margin matches your spreadsheet total, then we lock them in."
        />

        <!-- ═══ AGI — accurate model (Revenue − Direct Costs from cached lines) ═══ -->
        <UCard v-if="agi" class="ring-1 ring-primary/30">
          <template #header>
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 class="font-semibold flex items-center gap-2">
                  <UIcon name="i-lucide-trending-up" class="text-primary" />
                  Agency Gross Income (AGI) — accurate model
                </h3>
                <p class="text-sm text-muted">
                  Revenue − direct costs (Xero DIRECTCOSTS), {{ agi.trailing12.months }} months of cached lines · no guessed rates
                </p>
              </div>
              <UBadge :color="agi.headline.position >= 0 ? 'success' : 'error'" variant="subtle" size="lg">
                {{ agi.headline.position >= 0 ? '+' : '' }}{{ fmt(agi.headline.position) }} vs target
              </UBadge>
            </div>
          </template>

          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p class="text-xs uppercase text-muted">AGI · trailing 3mo avg</p>
              <p class="text-2xl font-bold tabular-nums text-primary">{{ fmt(agi.headline.agiTrailing3Avg) }}</p>
            </div>
            <div>
              <p class="text-xs uppercase text-muted">Gross margin · 12mo</p>
              <p class="text-2xl font-bold tabular-nums">{{ agi.headline.marginPctTrailing12 ?? '—' }}%</p>
            </div>
            <div>
              <p class="text-xs uppercase text-muted">Target (configured)</p>
              <p class="text-2xl font-bold tabular-nums">{{ fmt(agi.target) }}</p>
              <p class="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">⚠ still includes direct costs — reconfigure to overheads-only</p>
            </div>
            <div>
              <p class="text-xs uppercase text-muted">12-mo total AGI</p>
              <p class="text-2xl font-bold tabular-nums">{{ fmt(agi.trailing12.totalAgi) }}</p>
            </div>
          </div>

          <div class="mt-4 overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-xs uppercase text-muted border-b border-default">
                <tr>
                  <th class="text-left font-medium py-1.5">Month</th>
                  <th class="text-right font-medium">Revenue</th>
                  <th class="text-right font-medium">Direct cost</th>
                  <th class="text-right font-medium">AGI</th>
                  <th class="text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="m in agi.months" :key="m.mon" :class="m.mon === agi.currentMon ? 'text-muted italic' : ''">
                  <td class="py-1.5">{{ m.mon }}<span v-if="m.mon === agi.currentMon"> (partial)</span></td>
                  <td class="text-right tabular-nums">{{ fmt(m.revenue) }}</td>
                  <td class="text-right tabular-nums text-muted">{{ fmt(m.directCost) }}</td>
                  <td class="text-right tabular-nums font-medium">{{ fmt(m.agi) }}</td>
                  <td class="text-right tabular-nums">{{ m.marginPct ?? '—' }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-xs text-muted italic mt-2">{{ agi.note }}</p>
        </UCard>

        <!-- Controls -->
        <UCard>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UFormField label="Month">
              <USelectMenu v-model="month" :items="monthOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Media keep %" help="Commission on traditional media (code 220)">
              <UInput v-model.number="mediaKeepPct" type="number" :min="0" :max="100" class="w-full" />
            </UFormField>
            <UFormField label="Printing keep %" help="Commission on printing (code 205)">
              <UInput v-model.number="printingKeepPct" type="number" :min="0" :max="100" class="w-full" />
            </UFormField>
          </div>
        </UCard>

        <div v-if="pending && !data" class="space-y-4">
          <USkeleton class="h-24" />
          <USkeleton class="h-64" />
        </div>

        <UAlert
          v-else-if="error"
          icon="i-lucide-alert-octagon" color="error" variant="subtle"
          title="Could not load reconciliation"
          :description="(error as any)?.statusMessage || 'Make sure a Xero org is connected.'"
        />

        <template v-else-if="data">
          <!-- Headline reconciliation -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <UCard :ui="{ body: '!p-4' }">
              <p class="text-xs text-muted uppercase tracking-wide">Gross billings (ex-GST)</p>
              <p class="text-2xl font-bold tabular-nums">{{ fmt(data.gross.exGst) }}</p>
              <p class="text-xs text-muted mt-1">{{ fmt(data.gross.inclGst) }} inc · {{ data.invoiceCount }} invoices</p>
            </UCard>
            <UCard :ui="{ body: '!p-4' }" class="bg-primary/5">
              <p class="text-xs text-muted uppercase tracking-wide">ADME net revenue</p>
              <p class="text-2xl font-bold tabular-nums text-primary">{{ fmt(data.admeMargin) }}</p>
              <p class="text-xs text-muted mt-1">{{ data.month.label }}</p>
            </UCard>
            <UCard :ui="{ body: '!p-4' }">
              <p class="text-xs text-muted uppercase tracking-wide">Get Out target</p>
              <p class="text-2xl font-bold tabular-nums">{{ fmt(data.target) }}</p>
            </UCard>
            <UCard :ui="{ body: '!p-4' }" :class="data.position >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'">
              <p class="text-xs text-muted uppercase tracking-wide">Position</p>
              <p class="text-2xl font-bold tabular-nums" :class="data.position >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'">
                {{ data.position >= 0 ? '+' : '' }}{{ fmt(data.position) }}
              </p>
              <p class="text-xs text-muted mt-1">ADME revenue − target</p>
            </UCard>
          </div>

          <UAlert v-if="data.truncated" color="warning" variant="subtle" icon="i-lucide-alert-triangle"
            title="Page cap hit" description="More than 1,500 invoices in this month — totals may be incomplete." />

          <!-- By bucket -->
          <UCard :ui="{ body: '!p-0' }">
            <template #header><h3 class="font-semibold">By bucket</h3></template>
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 text-xs uppercase text-muted">
                <tr>
                  <th class="text-left font-medium px-4 py-2">Bucket</th>
                  <th class="text-right font-medium px-4 py-2">Revenue (ex-GST)</th>
                  <th class="text-right font-medium px-4 py-2">ADME keeps</th>
                  <th class="text-right font-medium px-4 py-2">Contribution</th>
                  <th class="text-right font-medium px-4 py-2">Codes</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="b in buckets" :key="b.bucket">
                  <td class="px-4 py-2"><UBadge :color="bucketColor(b.bucket) as any" variant="subtle" size="sm" class="capitalize">{{ b.bucket }}</UBadge></td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ fmt(b.exGst) }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ Math.round((data.rulesUsed.keepByBucket[b.bucket] ?? 0) * 100) }}%</td>
                  <td class="px-4 py-2 text-right tabular-nums font-medium">{{ fmt(b.contribution) }}</td>
                  <td class="px-4 py-2 text-right tabular-nums text-muted">{{ b.codeCount }}</td>
                </tr>
              </tbody>
              <tfoot class="border-t-2 border-default font-semibold">
                <tr>
                  <td class="px-4 py-2">ADME net revenue</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ fmt(data.gross.exGst) }}</td>
                  <td />
                  <td class="px-4 py-2 text-right tabular-nums text-primary">{{ fmt(data.admeMargin) }}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </UCard>

          <!-- By account code -->
          <UCard :ui="{ body: '!p-0' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">By Xero account code</h3>
                <p class="text-sm text-muted">{{ data.byCode.length }} codes · unmapped flagged</p>
              </div>
            </template>
            <div class="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted sticky top-0">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Code</th>
                    <th class="text-left font-medium px-4 py-2">Name</th>
                    <th class="text-left font-medium px-4 py-2">Bucket</th>
                    <th class="text-right font-medium px-4 py-2">Ex-GST</th>
                    <th class="text-right font-medium px-4 py-2">GST</th>
                    <th class="text-right font-medium px-4 py-2">Keep</th>
                    <th class="text-right font-medium px-4 py-2">Contribution</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="c in data.byCode" :key="c.code" :class="c.unmapped ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''">
                    <td class="px-4 py-2 font-mono">{{ c.code }}</td>
                    <td class="px-4 py-2 max-w-xs truncate">
                      {{ c.name }}
                      <UBadge v-if="c.unmapped" color="warning" variant="subtle" size="sm" class="ml-1">unmapped</UBadge>
                    </td>
                    <td class="px-4 py-2"><UBadge :color="bucketColor(c.bucket) as any" variant="subtle" size="sm" class="capitalize">{{ c.bucket }}</UBadge></td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ fmtc(c.exGst) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums text-muted">{{ fmtc(c.gst) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ Math.round(c.keepPct * 100) }}%</td>
                    <td class="px-4 py-2 text-right tabular-nums font-medium">{{ fmtc(c.contribution) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <!-- Top media tracking options -->
          <UCard v-if="data.topTrackingMedia.length" :ui="{ body: '!p-0' }">
            <template #header>
              <h3 class="font-semibold">Top "Media" tracking options (ex-GST)</h3>
            </template>
            <div class="overflow-x-auto max-h-80 overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted sticky top-0">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Tracking option</th>
                    <th class="text-right font-medium px-4 py-2">Ex-GST</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="t in data.topTrackingMedia" :key="t.option">
                    <td class="px-4 py-2">{{ t.option }}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ fmt(t.exGst) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <p class="text-xs text-muted italic">{{ data.note }}</p>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
