<script setup lang="ts">
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'
import { formatTimeAgo } from '@vueuse/core'
import { format } from 'date-fns'

const props = defineProps<{
  data: { totals: any, daily: { day: string, scans: number, unique: number }[], countries: any[], devices: any[], os: any[], browsers: any[], cities?: any[], postcodes?: any[], points?: { lat: number, lng: number, scans: number, city: string | null, postcode: string | null }[], leads?: { total: number, withPostcode: number, postcodes: any[], points: { lat: number, lng: number, scans: number, city: string | null, postcode: string | null }[] } }
  rangeLabel?: string
}>()

const series = computed(() => props.data.daily.map((d, i) => ({ x: i, ...d })))
const x = (d: any) => d.x
const y = (d: any) => d.scans
const peak = computed(() => props.data.daily.reduce((best, d) => (d.scans > (best?.scans ?? 0) ? d : best), null as null | { day: string, scans: number }))

// Every ~6th tick on 30-day ranges keeps the axis readable; short ranges label every day.
const tickEvery = computed(() => Math.max(1, Math.ceil(series.value.length / 8)))
const tickValues = computed(() => series.value.map((_, i) => i).filter(i => i % tickEvery.value === 0))
const tickFormat = (i: number) => (series.value[i] ? format(new Date(series.value[i].day), 'd MMM') : '')

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const lists = computed(() => [
  { title: 'Suburbs', rows: props.data.cities ?? [], label: (k: string) => k, hint: 'Approximate — from the network location, not GPS' },
  { title: 'Postcodes', rows: props.data.postcodes ?? [], label: (k: string) => k, hint: 'Approximate — from the network location, not GPS' },
  { title: 'Countries', rows: props.data.countries, label: (k: string) => k },
  { title: 'Devices', rows: props.data.devices, label: titleCase },
  { title: 'Operating systems', rows: props.data.os, label: (k: string) => k },
  { title: 'Browsers', rows: props.data.browsers, label: (k: string) => k }
])
const pct = (n: number) => props.data.totals.scans ? Math.round((n / props.data.totals.scans) * 100) : 0

const avgPerDay = computed(() => {
  const days = props.data.daily.length || 1
  const avg = Number(props.data.totals.scans ?? 0) / days
  return avg >= 10 ? Math.round(avg).toLocaleString() : avg.toFixed(1)
})
const lastScanned = computed(() => props.data.totals.lastScannedAt ? new Date(props.data.totals.lastScannedAt) : null)
const kpis = computed(() => [
  { label: props.rangeLabel ? `Scans · ${props.rangeLabel.toLowerCase()}` : 'Scans in range', value: Number(props.data.totals.scans ?? 0).toLocaleString() },
  { label: 'Unique (est.)', value: Number(props.data.totals.unique ?? 0).toLocaleString(), hint: 'Approximate — distinct devices in this range' },
  { label: 'Avg per day', value: avgPerDay.value, hint: `${props.data.daily.length} days in range` },
  {
    label: 'Last scanned',
    value: lastScanned.value ? formatTimeAgo(lastScanned.value) : 'Never',
    hint: lastScanned.value ? format(lastScanned.value, 'd MMM yyyy, h:mm a') : undefined
  }
])
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <UCard v-for="k in kpis" :key="k.label" :ui="{ body: 'p-4' }">
        <p class="truncate text-xs text-muted">
          {{ k.label }}
        </p>
        <UTooltip :text="k.hint" :disabled="!k.hint">
          <p class="mt-1 truncate text-xl font-semibold tabular-nums">
            {{ k.value }}
          </p>
        </UTooltip>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-sm font-medium">Scans per day</span>
          <span v-if="peak?.scans" class="text-xs text-muted">Peak {{ peak.scans }} on {{ format(new Date(peak.day), 'd MMM') }}</span>
        </div>
      </template>
      <VisXYContainer
        v-if="series.some(d => d.scans)"
        :data="series"
        :height="220"
        :margin="{ top: 8, right: 8, bottom: 4, left: 4 }"
      >
        <VisArea
          :x="x"
          :y="y"
          color="var(--ui-primary)"
          :opacity="0.12"
        />
        <VisLine
          :x="x"
          :y="y"
          color="var(--ui-primary)"
          :line-width="2"
        />
        <VisAxis
          type="x"
          :tick-values="tickValues"
          :tick-format="tickFormat"
          :grid-line="false"
          :domain-line="false"
        />
        <VisAxis
          type="y"
          :num-ticks="4"
          :domain-line="false"
          :tick-format="(v: number) => (Number.isInteger(v) ? String(v) : '')"
        />
        <VisCrosshair :template="(d: any) => `${format(new Date(d.day), 'EEE d MMM')}: ${d.scans} ${d.scans === 1 ? 'scan' : 'scans'} (${d.unique} unique)`" />
        <VisTooltip />
      </VisXYContainer>
      <div v-else class="py-10 text-center">
        <UIcon name="i-lucide-scan-line" class="mx-auto mb-2 size-6 text-muted" />
        <p class="text-sm text-muted">
          No scans in this range.
        </p>
        <p v-if="data.totals.scans" class="mt-1 text-xs text-muted">
          Widen the range to see earlier activity.
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-medium">Where it's scanned</span>
            <UTooltip text="Approximate — each point is the network's city centroid, not the scanner's exact position">
              <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
            </UTooltip>
          </div>
        </div>
      </template>
      <QrScanMap v-if="data.points?.length" :points="data.points" />
      <div v-else class="py-10 text-center">
        <UIcon name="i-lucide-map-pin-off" class="mx-auto mb-2 size-6 text-muted" />
        <p class="text-sm text-muted">
          No mapped scans in this range.
        </p>
        <p class="mt-1 text-xs text-muted">
          Locations are captured for new scans.
        </p>
      </div>
    </UCard>

    <UCard v-if="data.leads">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-medium">Where leads live</span>
            <UTooltip text="Postcode given by the lead on the form — actual home area, unlike scan location">
              <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
            </UTooltip>
          </div>
          <span class="text-xs text-muted tabular-nums">{{ data.leads.total }} {{ data.leads.total === 1 ? 'lead' : 'leads' }}<template v-if="data.leads.total"> · {{ data.leads.withPostcode }} with postcode</template></span>
        </div>
      </template>
      <div v-if="data.leads.points.length" class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <QrScanMap :points="data.leads.points" noun="lead" />
        <ul class="space-y-2.5">
          <li v-for="r in data.leads.postcodes" :key="r.key" class="text-sm">
            <div class="flex justify-between gap-3">
              <span class="truncate">{{ r.key }}</span>
              <span class="shrink-0 tabular-nums text-muted">{{ r.scans }}</span>
            </div>
            <div class="mt-1 h-1.5 rounded bg-elevated">
              <div class="h-full rounded bg-primary" :style="{ width: Math.round((r.scans / Math.max(1, data.leads.withPostcode)) * 100) + '%' }" />
            </div>
          </li>
        </ul>
      </div>
      <div v-else class="py-10 text-center">
        <UIcon name="i-lucide-users" class="mx-auto mb-2 size-6 text-muted" />
        <p class="text-sm text-muted">
          {{ data.leads.total ? 'Leads matched, but none included a postcode.' : 'No leads matched to this code in this range.' }}
        </p>
        <p class="mt-1 text-xs text-muted">
          Leads match when their form carries the xf_qr click id or the utm tags from the scan.
        </p>
      </div>
    </UCard>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UCard v-for="l in lists" :key="l.title">
        <template #header>
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-medium">{{ l.title }}</span>
            <UTooltip v-if="l.hint" :text="l.hint">
              <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
            </UTooltip>
          </div>
        </template>
        <ul v-if="l.rows.length" class="space-y-2.5">
          <li v-for="r in l.rows" :key="r.key" class="text-sm">
            <div class="flex justify-between gap-3">
              <span class="truncate">{{ l.label(r.key) || 'Unknown' }}</span>
              <span class="shrink-0 tabular-nums text-muted">{{ r.scans }} <span class="text-dimmed">·</span> {{ pct(r.scans) }}%</span>
            </div>
            <div class="mt-1 h-1.5 rounded bg-elevated">
              <div class="h-full rounded bg-primary transition-[width]" :style="{ width: pct(r.scans) + '%' }" />
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          {{ l.hint ? 'No location data yet — captured for new scans.' : 'Nothing yet.' }}
        </p>
      </UCard>
    </div>
  </div>
</template>
