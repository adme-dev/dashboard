<script setup lang="ts">
const props = withDefaults(defineProps<{
  data?: any | null
  loading?: boolean
  managed?: boolean
}>(), {
  data: null,
  loading: false,
  managed: false,
})
const emit = defineEmits<{ refresh: [] }>()

const now = new Date()
const month = now.getMonth() + 1
const year = now.getFullYear()

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown>; retry?: number }
) => Promise<T>
const localData = ref<any | null>(null)
const localStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refresh() {
  if (props.managed) {
    emit('refresh')
    return
  }
  localStatus.value = 'pending'
  try {
    localData.value = await apiFetch('/api/xero/overheads', {
      query: { month, year },
      retry: 0,
    })
    localStatus.value = 'success'
  } catch (error) {
    console.error('Failed to load overheads', error)
    localStatus.value = 'error'
  }
}

onMounted(() => {
  if (!props.managed) refresh()
})

const status = computed(() => props.managed
  ? (props.loading ? 'pending' : props.data ? 'success' : 'error')
  : localStatus.value)
const overheads = computed(() => (props.managed ? props.data : localData.value) as any)
const totalFixed = computed(() => overheads.value?.totalFixed || 0)
const totalVariable = computed(() => overheads.value?.totalVariable || 0)
const overheadRatio = computed(() => overheads.value?.overheadRatio || 0)
const byCategory = computed(() => overheads.value?.byCategory || [])
const byDepartment = computed(() => overheads.value?.byDepartment || [])
const subscriptions = computed(() => overheads.value?.subscriptions || [])
const previousMonth = computed(() => overheads.value?.previousMonth || { total: 0, change: 0 })

const showDepartments = ref(false)

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

// Top 5 fixed cost categories sorted by amount
const topCategories = computed(() =>
  [...byCategory.value]
    .sort((a: any, b: any) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 5)
)

const maxCategoryAmount = computed(() =>
  Math.max(...topCategories.value.map((c: any) => c.amount || 0), 1)
)

function ratioColor(ratio: number) {
  if (ratio <= 30) return 'text-emerald-600 dark:text-emerald-400'
  if (ratio <= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function ratioBg(ratio: number) {
  if (ratio <= 30) return 'bg-emerald-50 dark:bg-emerald-500/10'
  if (ratio <= 50) return 'bg-amber-50 dark:bg-amber-500/10'
  return 'bg-red-50 dark:bg-red-500/10'
}

function changeColor(change: number) {
  if (change < 0) return 'text-emerald-600 dark:text-emerald-400'
  if (change > 0) return 'text-red-600 dark:text-red-400'
  return 'text-[var(--ui-text-muted)]'
}

function changeBg(change: number) {
  if (change < 0) return 'bg-emerald-50 dark:bg-emerald-500/10'
  if (change > 0) return 'bg-red-50 dark:bg-red-500/10'
  return 'bg-[var(--ui-bg-elevated)]'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-building" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Overheads</h3>
        </div>
        <UButton to="/expenses" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <!-- Loading state -->
    <div v-if="status === 'pending'" class="space-y-3">
      <div class="grid grid-cols-3 gap-2">
        <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
      </div>
      <USkeleton v-for="i in 3" :key="'bar-' + i" class="h-8 rounded" />
    </div>

    <!-- Error state -->
    <div v-else-if="status === 'error'" class="text-center py-6">
      <UIcon name="i-lucide-alert-circle" class="w-8 h-8 mx-auto mb-2 text-red-500 opacity-60" />
      <p class="text-sm text-[var(--ui-text-muted)] mb-2">Failed to load overheads</p>
      <UButton variant="soft" color="neutral" size="xs" @click="refresh()">
        Retry
      </UButton>
    </div>

    <!-- Data loaded -->
    <div v-else>
      <!-- Stats row: 3 columns -->
      <div class="grid grid-cols-3 gap-2 mb-4">
        <!-- Total Fixed -->
        <div class="bg-[var(--ui-bg-elevated)] rounded-lg p-3">
          <p class="text-[10px] text-[var(--ui-text-muted)] uppercase tracking-wide">Fixed</p>
          <p class="text-sm font-semibold text-[var(--ui-text-highlighted)] mt-0.5">{{ formatCurrency(totalFixed) }}</p>
        </div>

        <!-- Overhead Ratio -->
        <div class="rounded-lg p-3" :class="ratioBg(overheadRatio)">
          <p class="text-[10px] text-[var(--ui-text-muted)] uppercase tracking-wide">Ratio</p>
          <p class="text-sm font-semibold mt-0.5" :class="ratioColor(overheadRatio)">{{ overheadRatio.toFixed(1) }}%</p>
        </div>

        <!-- MoM Change -->
        <div class="rounded-lg p-3" :class="changeBg(previousMonth.change)">
          <p class="text-[10px] text-[var(--ui-text-muted)] uppercase tracking-wide">MoM</p>
          <p class="text-sm font-semibold mt-0.5" :class="changeColor(previousMonth.change)">
            {{ previousMonth.change > 0 ? '+' : '' }}{{ previousMonth.change.toFixed(1) }}%
          </p>
        </div>
      </div>

      <!-- Top 5 fixed cost categories -->
      <div v-if="topCategories.length" class="space-y-2.5 mb-4">
        <p class="text-xs font-medium text-[var(--ui-text-muted)] uppercase tracking-wide">Top Fixed Costs</p>
        <div v-for="cat in topCategories" :key="cat.name || cat.accountCode" class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm text-[var(--ui-text-highlighted)] truncate flex-1">{{ cat.name }}</span>
            <span class="text-xs font-medium text-[var(--ui-text-muted)] shrink-0 ml-2 tabular-nums">
              {{ formatCurrency(cat.amount || 0) }}
            </span>
          </div>
          <div class="h-1.5 bg-[var(--ui-bg-elevated)] rounded-full overflow-hidden">
            <div
              class="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all duration-500"
              :style="{ width: `${Math.max(((cat.amount || 0) / maxCategoryAmount) * 100, 2)}%` }"
            />
          </div>
        </div>
      </div>

      <!-- Subscriptions count -->
      <div v-if="subscriptions.length" class="flex items-center gap-2 py-2 border-t border-[var(--ui-border)]">
        <UIcon name="i-lucide-repeat" class="w-3.5 h-3.5 text-[var(--ui-text-muted)]" />
        <span class="text-xs text-[var(--ui-text-muted)]">
          {{ subscriptions.length }} recurring subscription{{ subscriptions.length !== 1 ? 's' : '' }}
        </span>
        <UBadge variant="subtle" color="neutral" size="xs" class="ml-auto">
          {{ formatCurrency(subscriptions.reduce((s: number, sub: any) => s + (sub.amount || 0), 0)) }}/mo
        </UBadge>
      </div>

      <!-- Department breakdown (collapsible) -->
      <div v-if="byDepartment.length" class="border-t border-[var(--ui-border)] pt-2 mt-2">
        <button
          class="flex items-center gap-1.5 text-xs font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text-highlighted)] transition-colors w-full"
          @click="showDepartments = !showDepartments"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="w-3.5 h-3.5 transition-transform duration-200"
            :class="showDepartments ? 'rotate-90' : ''"
          />
          By Department
        </button>
        <div v-if="showDepartments" class="mt-2 space-y-2">
          <div v-for="dept in byDepartment" :key="dept.department" class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-[var(--ui-text-highlighted)]">{{ dept.department }}</span>
              <span class="text-xs font-medium text-[var(--ui-text-muted)] tabular-nums">{{ formatCurrency(dept.total || 0) }}</span>
            </div>
            <div v-for="item in (dept.items || []).slice(0, 3)" :key="item.name" class="flex items-center justify-between pl-3">
              <span class="text-xs text-[var(--ui-text-muted)] truncate flex-1">{{ item.name }}</span>
              <span class="text-xs text-[var(--ui-text-muted)] shrink-0 ml-2 tabular-nums">{{ formatCurrency(item.amount || 0) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
