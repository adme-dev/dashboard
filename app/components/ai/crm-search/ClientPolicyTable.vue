<script setup lang="ts">
import type { CrmSearchPolicyView } from '~/types/crmSearchOperations'

defineProps<{ policies: CrmSearchPolicyView[], pending: boolean, error: string | null }>()
defineEmits<{ transition: [policy: CrmSearchPolicyView], refresh: [] }>()
const columns = [
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'state', header: 'State' },
  { accessorKey: 'revision', header: 'Authority revisions' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <section class="space-y-3" aria-labelledby="crm-search-policy-title">
    <div class="flex items-center justify-between gap-3"><div><h2 id="crm-search-policy-title" class="text-base font-semibold text-highlighted">Client policies</h2><p class="text-sm text-muted">Each transition uses the latest control and policy revisions.</p></div><UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="pending" @click="$emit('refresh')">Refresh</UButton></div>
    <div v-if="pending && !policies.length" class="space-y-2" aria-busy="true" aria-label="Loading client policies"><USkeleton v-for="item in 3" :key="item" class="h-14 w-full" /></div>
    <UAlert v-else-if="error && !policies.length" color="error" variant="soft" title="Client policies unavailable" :description="error" />
    <UTable v-else-if="policies.length" :data="policies" :columns="columns">
      <template #clientName-cell="{ row }"><div><p class="font-medium text-highlighted">{{ row.original.clientName }}</p><p class="text-xs text-muted">{{ row.original.clientId }}</p></div></template>
      <template #state-cell="{ row }"><UBadge color="neutral" variant="subtle">{{ row.original.state }}</UBadge></template>
      <template #revision-cell="{ row }"><span class="text-sm text-muted">Policy {{ row.original.revision }} · Control {{ row.original.controlRevision }}</span></template>
      <template #actions-cell="{ row }"><UButton size="xs" color="neutral" variant="soft" icon="i-lucide-git-compare-arrows" @click="$emit('transition', row.original)">Manage</UButton></template>
    </UTable>
    <UAlert v-else color="neutral" variant="soft" icon="i-lucide-circle-dashed" title="No client policies" description="No CRM search clients are configured yet." />
  </section>
</template>
