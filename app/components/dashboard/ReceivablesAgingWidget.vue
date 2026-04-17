<script setup lang="ts">
const { data, status } = useLazyFetch('/api/xero/reports/aging', { server: false })

const agingData = computed(() => data.value as any)
const totalOutstanding = computed(() => agingData.value?.totalOutstanding || 0)
const agingSummary = computed(() => agingData.value?.agingSummary || [])
const topContacts = computed(() => (agingData.value?.topContacts || []).slice(0, 3))

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

const bucketColors: Record<string, string> = {
  current: 'bg-emerald-500',
  '30': 'bg-amber-500',
  '60': 'bg-orange-500',
  '90': 'bg-red-500',
}
const bucketLabels: Record<string, string> = {
  current: 'Current',
  '30': '30 days',
  '60': '60 days',
  '90': '90+ days',
}

const bucketWidths = computed(() => {
  const total = totalOutstanding.value || 1
  return agingSummary.value.map((b: any) => ({
    ...b,
    width: Math.max(((b.amount || 0) / total) * 100, 2),
  }))
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-hourglass" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Receivables Aging</h3>
        </div>
        <UButton to="/invoices" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton class="h-8 w-full rounded" />
      <USkeleton class="h-20 w-full rounded" />
    </div>
    <div v-else>
      <!-- Total outstanding -->
      <p class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCurrency(totalOutstanding) }}</p>
      <p class="text-xs text-[var(--ui-text-muted)] mb-3">Total outstanding</p>

      <!-- Stacked bar -->
      <div v-if="bucketWidths.length" class="flex h-4 rounded-full overflow-hidden mb-2">
        <div
          v-for="bucket in bucketWidths"
          :key="bucket.bucket || bucket.label"
          class="transition-all duration-300"
          :class="bucketColors[bucket.bucket] || 'bg-neutral-400'"
          :style="{ width: `${bucket.width}%` }"
        />
      </div>

      <!-- Legend -->
      <div v-if="bucketWidths.length" class="flex items-center gap-3 flex-wrap text-xs text-[var(--ui-text-muted)] mb-3">
        <span v-for="bucket in bucketWidths" :key="bucket.bucket || bucket.label" class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full" :class="bucketColors[bucket.bucket] || 'bg-neutral-400'" />
          {{ bucketLabels[bucket.bucket] || bucket.label }}: {{ formatCurrency(bucket.amount || 0) }}
        </span>
      </div>

      <!-- Top overdue contacts -->
      <div v-if="topContacts.length" class="border-t border-[var(--ui-border)] pt-3 space-y-2">
        <p class="text-xs font-medium text-[var(--ui-text-muted)] uppercase tracking-wide">Top Overdue</p>
        <div v-for="contact in topContacts" :key="contact.name || contact.id" class="flex items-center justify-between">
          <span class="text-sm text-[var(--ui-text-highlighted)] truncate">{{ contact.name }}</span>
          <span class="text-sm font-medium text-red-600 dark:text-red-400 shrink-0 ml-2">{{ formatCurrency(contact.amount || contact.outstanding || 0) }}</span>
        </div>
      </div>
    </div>
  </UCard>
</template>
