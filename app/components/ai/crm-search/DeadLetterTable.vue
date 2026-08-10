<script setup lang="ts">
import type { CrmSearchDeadLetterView } from '~/types/crmSearchOperations'

defineProps<{ deadLetters: CrmSearchDeadLetterView[], pending: boolean, error: string | null }>()
defineEmits<{ resolve: [item: CrmSearchDeadLetterView], refresh: [] }>()

const action = (origin: CrmSearchDeadLetterView['origin']) => origin === 'cloudflare_transport' ? 'transport_retry' : 'confirmation_reconcile'
const columns = [
  { accessorKey: 'origin', header: 'Origin and action' },
  { accessorKey: 'errorClass', header: 'Safe error class' },
  { accessorKey: 'attempts', header: 'Attempts' },
  { accessorKey: 'lastFailedAt', header: 'Last failure' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <section class="space-y-3" aria-labelledby="crm-search-dead-letter-title">
    <div class="flex items-center justify-between gap-3"><div><h2 id="crm-search-dead-letter-title" class="text-base font-semibold text-highlighted">Dead-letter work</h2><p class="text-sm text-muted">cloudflare_transport → transport_retry · provider_confirmation → confirmation_reconcile</p></div><UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="pending" @click="$emit('refresh')">Refresh</UButton></div>
    <div v-if="pending && !deadLetters.length" class="space-y-2" aria-busy="true" aria-label="Loading dead-letter work"><USkeleton v-for="item in 2" :key="item" class="h-14 w-full" /></div>
    <UAlert v-else-if="error && !deadLetters.length" color="error" variant="soft" title="Dead-letter records unavailable" :description="error" />
    <UTable v-else-if="deadLetters.length" :data="deadLetters" :columns="columns">
      <template #origin-cell="{ row }"><div><p class="text-sm font-medium text-highlighted">{{ row.original.origin }}</p><p class="text-xs text-muted">{{ action(row.original.origin) }}</p></div></template>
      <template #attempts-cell="{ row }"><span class="text-sm text-muted">{{ row.original.attempts }} attempts</span></template>
      <template #actions-cell="{ row }"><UButton size="xs" color="warning" variant="soft" icon="i-lucide-life-buoy" :disabled="row.original.resolutionState !== 'open'" @click="$emit('resolve', row.original)">Review recovery</UButton></template>
    </UTable>
    <UAlert v-else color="success" variant="soft" icon="i-lucide-check-circle-2" title="No open dead-letter work" description="There are no origin-specific recovery actions waiting for an operator." />
  </section>
</template>
