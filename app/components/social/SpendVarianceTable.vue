<script setup lang="ts">
const props = defineProps<{
  items: Array<{
    platform: string
    clientName: string
    clientCode: string | null
    budget: number
    spend: number
    commission: number
    variance: number
    variancePercent: number
    impressions: number
    clicks: number
    conversions: number
    campaignCount: number
  }>
  totals: { budget: number; spend: number; commission: number; variance: number }
}>()

const sortKey = ref<string>('spend')
const sortDir = ref<'asc' | 'desc'>('desc')

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

const sorted = computed(() => {
  const items = [...props.items]
  items.sort((a: any, b: any) => {
    const av = a[sortKey.value] ?? 0
    const bv = b[sortKey.value] ?? 0
    return sortDir.value === 'asc' ? av - bv : bv - av
  })
  return items
})

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val)
}

function varianceClass(pct: number) {
  if (Math.abs(pct) < 5) return 'text-muted'
  return pct > 0 ? 'text-error' : 'text-success'
}

function platformIcon(p: string) {
  return p === 'meta' ? 'i-lucide-facebook' : p === 'google' ? 'i-lucide-chrome' : 'i-lucide-globe'
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-default text-left">
          <th class="py-2 px-3 font-medium text-muted cursor-pointer" @click="toggleSort('clientName')">Client</th>
          <th class="py-2 px-3 font-medium text-muted">Platform</th>
          <th class="py-2 px-3 font-medium text-muted text-right cursor-pointer" @click="toggleSort('budget')">Budget</th>
          <th class="py-2 px-3 font-medium text-muted text-right cursor-pointer" @click="toggleSort('spend')">Spend</th>
          <th class="py-2 px-3 font-medium text-muted text-right cursor-pointer" @click="toggleSort('commission')">Commission</th>
          <th class="py-2 px-3 font-medium text-muted text-right cursor-pointer" @click="toggleSort('variance')">Variance</th>
          <th class="py-2 px-3 font-medium text-muted text-right">Var %</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in sorted" :key="`${item.platform}-${item.clientName}`" class="border-b border-default/50 hover:bg-elevated/50">
          <td class="py-2 px-3 font-medium">{{ item.clientName }}</td>
          <td class="py-2 px-3">
            <div class="flex items-center gap-1">
              <UIcon :name="platformIcon(item.platform)" class="w-4 h-4" />
              <span class="capitalize">{{ item.platform }}</span>
            </div>
          </td>
          <td class="py-2 px-3 text-right">{{ item.budget > 0 ? formatCurrency(item.budget) : '-' }}</td>
          <td class="py-2 px-3 text-right font-medium">{{ formatCurrency(item.spend) }}</td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(item.commission) }}</td>
          <td class="py-2 px-3 text-right" :class="varianceClass(item.variancePercent)">
            {{ item.budget > 0 ? formatCurrency(item.variance) : '-' }}
          </td>
          <td class="py-2 px-3 text-right" :class="varianceClass(item.variancePercent)">
            {{ item.budget > 0 ? `${item.variancePercent > 0 ? '+' : ''}${item.variancePercent}%` : '-' }}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="border-t-2 border-default font-semibold">
          <td class="py-2 px-3" colspan="2">Totals</td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(totals.budget) }}</td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(totals.spend) }}</td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(totals.commission) }}</td>
          <td class="py-2 px-3 text-right" :class="varianceClass(totals.budget > 0 ? ((totals.spend - totals.budget) / totals.budget) * 100 : 0)">
            {{ formatCurrency(totals.variance) }}
          </td>
          <td class="py-2 px-3 text-right"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
