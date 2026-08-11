<script setup lang="ts">
import type { CrmSearchApprovalView } from '~/types/crmSearchOperations'

defineProps<{ approvals: CrmSearchApprovalView[], pending: boolean, error: string | null }>()
defineEmits<{ revoke: [approval: CrmSearchApprovalView], refresh: [] }>()

const status = (item: CrmSearchApprovalView) => item.revokedAt ? 'Revoked' : item.consumedAt ? 'Consumed' : Date.parse(item.expiresAt) <= Date.now() ? 'Expired' : 'Active'
const columns = [
  { accessorKey: 'approvalType', header: 'Type and scope' },
  { accessorKey: 'evidenceBundleHash', header: 'Evidence' },
  { accessorKey: 'maximumCostUsdMicros', header: 'Cost ceiling' },
  { accessorKey: 'expiresAt', header: 'Expires' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <section class="space-y-3" aria-labelledby="crm-search-approval-title">
    <div class="flex items-center justify-between gap-3"><div><h2 id="crm-search-approval-title" class="text-base font-semibold text-highlighted">Approval ledger</h2><p class="text-sm text-muted">Immutable scope, evidence, cost, expiry, consumption, and revocation.</p></div><UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="pending" @click="$emit('refresh')">Refresh</UButton></div>
    <div v-if="pending && !approvals.length" class="space-y-2" aria-busy="true" aria-label="Loading approval ledger"><USkeleton v-for="item in 3" :key="item" class="h-14 w-full" /></div>
    <UAlert v-else-if="error && !approvals.length" color="error" variant="soft" title="Approval ledger unavailable" :description="error" />
    <UTable v-else-if="approvals.length" :data="approvals" :columns="columns">
      <template #approvalType-cell="{ row }"><div><p class="text-sm font-medium text-highlighted">{{ row.original.approvalType }}</p><p class="text-xs text-muted">{{ row.original.scopeKind }} scope · {{ row.original.environment }}</p><p class="text-xs text-muted">requested {{ row.original.requestedByActorId ?? 'legacy unknown' }} · approved {{ row.original.approvedBy }}</p></div></template>
      <template #evidenceBundleHash-cell="{ row }"><div class="space-y-0.5"><p class="font-mono text-xs text-muted">evidence {{ row.original.evidenceBundleHash.slice(0, 12) }}…</p><p class="font-mono text-xs text-muted">artifact {{ row.original.artifactManifestDigest.slice(0, 12) }}…</p><p v-if="row.original.importedProvenanceHash" class="font-mono text-xs text-muted">import {{ row.original.importedProvenanceHash.slice(0, 12) }}…</p></div></template>
      <template #maximumCostUsdMicros-cell="{ row }"><span class="text-sm text-default">{{ (row.original.maximumCostUsdMicros / 1_000_000).toFixed(2) }} USD</span></template>
      <template #expiresAt-cell="{ row }"><span class="text-sm text-muted">{{ new Date(row.original.expiresAt).toLocaleString() }}</span></template>
      <template #status-cell="{ row }"><UBadge color="neutral" variant="subtle">{{ status(row.original) }}</UBadge></template>
      <template #actions-cell="{ row }"><UButton size="xs" color="error" variant="ghost" :disabled="status(row.original) !== 'Active'" @click="$emit('revoke', row.original)">Revoke</UButton></template>
    </UTable>
    <UAlert v-else color="neutral" variant="soft" icon="i-lucide-circle-dashed" title="No approvals" description="No CRM search change approvals have been recorded." />
  </section>
</template>
