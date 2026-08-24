<script setup lang="ts">
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'

const props = defineProps<{ data: { totals: any, daily: { day: string, scans: number, unique: number }[], countries: any[], devices: any[], os: any[], browsers: any[] } }>()

const series = computed(() => props.data.daily.map((d, i) => ({ x: i, ...d })))
const x = (d: any) => d.x
const y = (d: any) => d.scans
const lists = computed(() => [
  { title: 'Countries', rows: props.data.countries },
  { title: 'Devices', rows: props.data.devices },
  { title: 'Operating systems', rows: props.data.os },
  { title: 'Browsers', rows: props.data.browsers },
])
const pct = (n: number) => props.data.totals.scans ? Math.round((n / props.data.totals.scans) * 100) : 0
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard
        v-for="k in [
          ['Total scans', data.totals.scans],
          ['Unique (est.)', data.totals.unique],
          ['Last 7 days', data.totals.last7],
          ['Last scanned', data.totals.lastScannedAt ? new Date(data.totals.lastScannedAt).toLocaleString() : '—'],
        ]"
        :key="k[0]"
        :ui="{ body: 'p-4' }"
      >
        <p class="text-xs text-muted">
          {{ k[0] }}
        </p>
        <p class="text-xl font-semibold tabular-nums mt-1">
          {{ k[1] }}
        </p>
      </UCard>
    </div>
    <UCard>
      <template #header>
        <span class="text-sm font-medium">Scans per day</span>
      </template>
      <VisXYContainer v-if="series.some(d => d.scans)" :data="series" :height="220">
        <VisArea :x="x" :y="y" color="var(--ui-primary)" :opacity="0.1" />
        <VisLine :x="x" :y="y" color="var(--ui-primary)" />
        <VisAxis type="x" :tick-format="(i: number) => series[i]?.day?.slice(5) ?? ''" />
        <VisAxis type="y" />
        <VisCrosshair :template="(d: any) => `${d.day}: ${d.scans} scans (${d.unique} unique)`" />
        <VisTooltip />
      </VisXYContainer>
      <p v-else class="text-sm text-muted text-center py-8">
        No scans in this range.
      </p>
    </UCard>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <UCard v-for="l in lists" :key="l.title">
        <template #header>
          <span class="text-sm font-medium">{{ l.title }}</span>
        </template>
        <ul v-if="l.rows.length" class="space-y-2">
          <li v-for="r in l.rows" :key="r.key" class="text-sm">
            <div class="flex justify-between">
              <span>{{ r.key }}</span>
              <span class="tabular-nums text-muted">{{ r.scans }} · {{ pct(r.scans) }}%</span>
            </div>
            <div class="h-1.5 rounded bg-elevated mt-1">
              <div class="h-full rounded bg-primary" :style="{ width: pct(r.scans) + '%' }" />
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          No data.
        </p>
      </UCard>
    </div>
  </div>
</template>
