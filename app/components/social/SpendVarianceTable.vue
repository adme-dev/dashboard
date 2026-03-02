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
    spendIds?: string[]
    rolling?: boolean
  }>
  totals: { budget: number; spend: number; commission: number; variance: number }
  search?: string
  monthProgress?: number
}>()

const emit = defineEmits<{
  (e: 'budget-updated'): void
}>()

const toast = useToast()
const sortKey = ref<string>('spend')
const sortDir = ref<'asc' | 'desc'>('desc')

// Inline budget editing
const editingKey = ref<string | null>(null)
const editBudget = ref('')
const editRolling = ref(false)
const saving = ref(false)

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

function startEdit(item: typeof props.items[0]) {
  editingKey.value = itemKey(item)
  editBudget.value = item.budget > 0 ? String(item.budget) : ''
  editRolling.value = item.rolling || false
  nextTick(() => {
    const el = document.querySelector(`input[data-budget-edit="${editingKey.value}"]`) as HTMLInputElement
    el?.select()
  })
}

function cancelEdit() {
  editingKey.value = null
  editBudget.value = ''
  editRolling.value = false
}

async function saveBudget(item: typeof props.items[0]) {
  const budget = parseFloat(editBudget.value)
  if (isNaN(budget) || budget < 0) {
    toast.add({ title: 'Invalid budget', description: 'Enter a valid non-negative number', color: 'error' })
    return
  }

  const ids = item.spendIds
  if (!ids?.length) {
    toast.add({ title: 'Cannot update', description: 'No spend records linked', color: 'error' })
    return
  }

  saving.value = true
  try {
    await $fetch('/api/agency/social/spend/bulk-budget', {
      method: 'PATCH',
      body: { spendIds: ids, budgetAllocated: budget, rolling: editRolling.value },
    })
    toast.add({ title: 'Budget updated', description: `${item.clientName} budget set to ${formatCurrency(budget)}`, color: 'success' })
    editingKey.value = null
    emit('budget-updated')
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    saving.value = false
  }
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
          <td class="py-2 px-3 font-medium">{{ item.clientName }}</td>
          <td class="py-2 px-3">
            <div class="flex items-center gap-1">
              <UIcon :name="platformIcon(item.platform)" class="w-4 h-4" />
              <span>{{ platformLabel(item.platform) }}</span>
            </div>
          </td>
          <!-- Budget cell — click to edit -->
          <td class="py-2 px-3 text-right">
            <div v-if="editingKey === itemKey(item)" class="flex flex-col items-end gap-1">
              <div class="flex items-center gap-1">
                <input
                  v-model="editBudget"
                  :data-budget-edit="itemKey(item)"
                  type="number"
                  min="0"
                  step="100"
                  class="w-24 text-right text-sm rounded border border-default bg-default px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                  @keydown.enter="saveBudget(item)"
                  @keydown.escape="cancelEdit"
                />
                <UButton size="xs" variant="soft" color="primary" icon="i-lucide-check" :loading="saving" @click="saveBudget(item)" />
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="cancelEdit" />
              </div>
              <label class="flex items-center gap-1 text-[10px] text-muted cursor-pointer">
                <input type="checkbox" v-model="editRolling" class="rounded border-default size-3" />
                Rolling
              </label>
            </div>
            <button
              v-else
              class="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
              @click="startEdit(item)"
            >
              <UIcon v-if="item.rolling" name="i-lucide-repeat" class="size-3 text-primary" />
              <span>{{ item.budget > 0 ? formatCurrency(item.budget) : '-' }}</span>
              <UIcon name="i-lucide-pencil" class="size-3 opacity-0 group-hover:opacity-50" />
            </button>
          </td>
          <td class="py-2 px-3 text-right font-medium">{{ formatCurrency(item.spend) }}</td>
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
          <td class="py-2 px-3 text-right">{{ formatCurrency(item.commission) }}</td>
          <td class="py-2 px-3 text-right" :class="varianceClass(item.variancePercent)">
            {{ item.budget > 0 ? formatCurrency(item.variance) : '-' }}
          </td>
          <td class="py-2 px-3 text-right" :class="varianceClass(item.variancePercent)">
            {{ item.budget > 0 ? `${item.variancePercent > 0 ? '+' : ''}${item.variancePercent}%` : '-' }}
          </td>
        </tr>
        <tr v-if="filtered.length === 0">
          <td colspan="8" class="py-6 text-center text-muted text-sm">No matching results</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="border-t-2 border-default font-semibold">
          <td class="py-2 px-3" colspan="2">Totals</td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(totals.budget) }}</td>
          <td class="py-2 px-3 text-right">{{ formatCurrency(totals.spend) }}</td>
          <td class="py-2 px-3"></td>
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
