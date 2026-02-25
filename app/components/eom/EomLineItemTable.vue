<script setup lang="ts">
import type { EomLineItem } from '~/types'

const props = defineProps<{
  items: EomLineItem[]
  total: number
  page: number
}>()

const emit = defineEmits<{
  'update:page': [page: number]
  edit: [item: EomLineItem]
}>()

const pages = computed(() => Math.ceil(props.total / 50))

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(val)
}

const confidenceColor: Record<string, string> = { high: 'success', medium: 'warning', low: 'error' }
const sourceLabel: Record<string, string> = { monday: 'Monday', meta_ads: 'Meta', google_ads: 'Google', manual: 'Manual' }
</script>

<template>
  <div>
    <div class="border border-default rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-default bg-elevated/50">
            <th class="py-2 px-3 text-left font-medium text-muted">Client</th>
            <th class="py-2 px-3 text-left font-medium text-muted">Description</th>
            <th class="py-2 px-3 text-left font-medium text-muted">COA</th>
            <th class="py-2 px-3 text-right font-medium text-muted">Amount</th>
            <th class="py-2 px-3 text-left font-medium text-muted">GST</th>
            <th class="py-2 px-3 text-left font-medium text-muted">Tracking</th>
            <th class="py-2 px-3 text-center font-medium text-muted">Confidence</th>
            <th class="py-2 px-3 text-center font-medium text-muted">Source</th>
            <th class="py-2 px-3 text-center font-medium text-muted">Status</th>
            <th class="py-2 px-3 text-center font-medium text-muted">Inv #</th>
            <th class="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            class="border-b border-default/50 hover:bg-elevated/30"
            :class="item.reviewStatus === 'flagged' ? 'bg-error/5' : ''"
          >
            <td class="py-2 px-3 font-medium max-w-[180px] truncate">{{ item.clientName }}</td>
            <td class="py-2 px-3 max-w-[250px] truncate text-muted">{{ item.description }}</td>
            <td class="py-2 px-3">{{ item.accountCode }}</td>
            <td class="py-2 px-3 text-right font-medium">{{ formatCurrency(item.unitAmount) }}</td>
            <td class="py-2 px-3 text-xs">{{ item.taxType }}</td>
            <td class="py-2 px-3 text-xs text-muted">{{ item.trackingOption1 || '-' }}</td>
            <td class="py-2 px-3 text-center">
              <UBadge :color="(confidenceColor[item.confidence] as any) || 'neutral'" variant="subtle" size="xs">
                {{ item.confidence }}
              </UBadge>
            </td>
            <td class="py-2 px-3 text-center text-xs">{{ sourceLabel[item.source] || item.source }}</td>
            <td class="py-2 px-3 text-center">
              <UBadge v-if="item.reviewStatus === 'flagged'" color="error" variant="subtle" size="xs">Flagged</UBadge>
              <UBadge v-else-if="item.reviewStatus === 'corrected'" color="info" variant="subtle" size="xs">Corrected</UBadge>
              <span v-else class="text-xs text-muted">{{ item.reviewStatus }}</span>
            </td>
            <td class="py-2 px-3 text-center text-xs text-muted">{{ item.invoiceNumber || '-' }}</td>
            <td class="py-2 px-3">
              <UButton variant="ghost" size="xs" icon="i-lucide-pencil" @click="emit('edit', item)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="pages > 1" class="flex items-center justify-between mt-3">
      <span class="text-sm text-muted">{{ total }} items</span>
      <div class="flex gap-1">
        <UButton size="xs" variant="ghost" :disabled="page <= 1" @click="emit('update:page', page - 1)">Prev</UButton>
        <span class="text-sm px-2 py-1">{{ page }} / {{ pages }}</span>
        <UButton size="xs" variant="ghost" :disabled="page >= pages" @click="emit('update:page', page + 1)">Next</UButton>
      </div>
    </div>
  </div>
</template>
