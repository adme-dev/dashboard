<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

interface AuditEntry {
  id: string
  field: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  changed_by: string | null
  changed_by_name: string | null
}

const props = defineProps<{
  clientId: string
  entityType: 'person' | 'company' | 'opportunity' | 'record'
  entityId: string
}>()

const base = inject<string>('crmApiBase', '/api/crm')
const query = computed(() => ({ client_id: props.clientId, entity_type: props.entityType, entity_id: props.entityId }))
const { data, pending } = useFetch<{ items: AuditEntry[] }>(`${base}/audit`, {
  query, watch: [query], default: () => ({ items: [] }),
})
const items = computed(() => data.value?.items ?? [])

function fieldLabel(f: string) {
  if (f === 'lifecycle_stage') return 'Lifecycle'
  return f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function rel(at: string) {
  try { return formatDistanceToNow(new Date(at), { addSuffix: true }) }
  catch { return '' }
}
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-medium text-muted">History</h3>
    <div v-if="pending" class="text-xs text-muted">Loading…</div>
    <ul v-else-if="items.length" class="space-y-2">
      <li v-for="e in items" :key="e.id" class="flex items-start gap-2.5">
        <UIcon name="i-lucide-history" class="size-4 mt-0.5 text-muted shrink-0" />
        <div class="flex-1 min-w-0 text-sm">
          <p>
            <span class="font-medium text-highlighted">{{ fieldLabel(e.field) }}</span>
            <span class="text-muted"> changed</span>
          </p>
          <p class="text-xs text-muted flex flex-wrap items-center gap-1">
            <span class="line-through">{{ e.old_value ?? '—' }}</span>
            <UIcon name="i-lucide-arrow-right" class="size-3" />
            <span class="text-highlighted">{{ e.new_value ?? '—' }}</span>
          </p>
          <p class="text-xs text-muted/70">
            {{ e.changed_by_name || 'Someone' }} · {{ rel(e.changed_at) }}
          </p>
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-muted">No changes recorded yet.</p>
  </div>
</template>
