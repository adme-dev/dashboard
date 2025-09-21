<script setup lang="ts">
import type { Period, Range, Stat } from '~/types'

const props = defineProps<{
  period: Period
  range: Range
}>()

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  })
}

const baseStats = [{
  title: 'Revenue',
  icon: 'i-lucide-circle-dollar-sign',
  minValue: 200000,
  maxValue: 500000,
  minVariation: -20,
  maxVariation: 30,
  formatter: formatCurrency
}, {
  title: 'Expenses',
  icon: 'i-lucide-wallet',
  minValue: 120000,
  maxValue: 300000,
  minVariation: -15,
  maxVariation: 25,
  formatter: formatCurrency
}, {
  title: 'Profit',
  icon: 'i-lucide-piggy-bank',
  minValue: 50000,
  maxValue: 150000,
  minVariation: -20,
  maxVariation: 30,
  formatter: formatCurrency
}, {
  title: 'Profit Margin',
  icon: 'i-lucide-percent',
  minValue: 5,
  maxValue: 40,
  minVariation: -10,
  maxVariation: 10,
  formatter: (v: number) => `${v}%`
}]

const { data: stats } = await useAsyncData<Stat[]>('stats', async () => {
  try {
    const kpis = await $fetch<any[]>('/api/kpis')
    if (kpis?.length) {
      return kpis.map((k) => ({
        title: k.title,
        icon: k.icon,
        value: typeof k.value === 'number' && k.title.includes('Profit Margin') ? `${k.value}%` : (typeof k.value === 'number' ? formatCurrency(k.value) : k.value),
        variation: k.variation || 0
      }))
    }
  } catch {}

  return baseStats.map((stat) => {
    const value = randomInt(stat.minValue, stat.maxValue)
    const variation = randomInt(stat.minVariation, stat.maxVariation)

    return {
      title: stat.title,
      icon: stat.icon,
      value: stat.formatter ? stat.formatter(value) : value,
      variation
    }
  })
}, {
  watch: [() => props.period, () => props.range],
  default: () => []
})
</script>

<template>
  <UPageGrid class="lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-px">
    <UPageCard
      v-for="(stat, index) in stats"
      :key="index"
      :icon="stat.icon"
      :title="stat.title"
      to="/customers"
      variant="subtle"
      :ui="{
        container: 'gap-y-1.5',
        wrapper: 'items-start',
        leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
        title: 'font-normal text-muted text-xs uppercase'
      }"
      class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
    >
      <div class="flex items-center gap-2">
        <span class="text-2xl font-semibold text-highlighted">
          {{ stat.value }}
        </span>

        <UBadge
          :color="stat.variation > 0 ? 'success' : 'error'"
          variant="subtle"
          class="text-xs"
        >
          {{ stat.variation > 0 ? '+' : '' }}{{ stat.variation }}%
        </UBadge>
      </div>
    </UPageCard>
  </UPageGrid>
</template>
