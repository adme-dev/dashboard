<script setup lang="ts">
import { format } from 'date-fns'

interface RuleListItem {
  source: string
  form_id: string
  form_name: string | null
  rule_id: string | null
  client_id: string | null
  enabled: boolean | null
  destination_count: string | number | null
  last_lead_at: string | null
}

const { data, refresh, pending } = useFetch<{ items: RuleListItem[] }>('/api/leads/rules/list', {
  default: () => ({ items: [] }),
})

// Clients for the picker modal — plain array from /api/agency/clients
const { data: clients } = useFetch<{ id: string; name: string }[]>('/api/agency/clients', {
  default: () => [],
})
const clientOptions = computed(() =>
  ((clients.value ?? []) as { id: string; name: string }[]).map(c => ({ value: c.id, label: c.name })),
)

const editingRuleId = ref<string | null>(null)
const editingFormMeta = ref<{ source: string; form_id: string; form_name: string | null } | null>(null)
const showEditor = ref(false)
const toast = useToast()

// Client picker modal state
const showClientPicker = ref(false)
const pickerClientId = ref<string | null>(null)
const pickerPendingItem = ref<RuleListItem | null>(null)

const columns = [
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'destination_count', header: 'Destinations' },
  { accessorKey: 'enabled', header: 'Enabled' },
  { accessorKey: 'last_lead_at', header: 'Last lead' },
  { accessorKey: 'actions', header: '' },
]

async function configure(item: RuleListItem) {
  if (item.rule_id) {
    // Rule exists — open editor directly.
    editingRuleId.value = item.rule_id
    editingFormMeta.value = { source: item.source, form_id: item.form_id, form_name: item.form_name }
    showEditor.value = true
    return
  }
  // No rule yet. If we already know which client, create the rule directly.
  if (item.client_id) {
    await createRuleAndOpen(item, item.client_id)
    return
  }
  // Otherwise, prompt for client via UModal (no window.prompt).
  pickerPendingItem.value = item
  pickerClientId.value = null
  showClientPicker.value = true
}

async function confirmPicker() {
  if (!pickerPendingItem.value || !pickerClientId.value) {
    toast.add({ title: 'Pick a client', color: 'error' })
    return
  }
  const item = pickerPendingItem.value
  const clientId = pickerClientId.value
  showClientPicker.value = false
  pickerPendingItem.value = null
  pickerClientId.value = null
  await createRuleAndOpen(item, clientId)
}

async function createRuleAndOpen(item: RuleListItem, clientId: string) {
  try {
    const r = await $fetch<{ id: string }>('/api/leads/rules', {
      method: 'POST',
      body: { client_id: clientId, source: item.source, form_id: item.form_id, form_name: item.form_name },
    })
    // editingFormMeta is set in both paths before showEditor = true
    editingRuleId.value = r.id
    editingFormMeta.value = { source: item.source, form_id: item.form_id, form_name: item.form_name }
    showEditor.value = true
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Failed to create rule', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}

// Reset picker state when the modal closes so stale refs don't linger.
watch(showClientPicker, (v) => {
  if (!v) { pickerPendingItem.value = null; pickerClientId.value = null }
})

async function toggleEnabled(item: RuleListItem) {
  if (!item.rule_id) return
  await $fetch(`/api/leads/rules/${item.rule_id}`, { method: 'PATCH', body: { enabled: !item.enabled } })
  await refresh()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-4 py-3 border-b border-default flex items-center justify-between">
      <h2 class="text-base font-semibold">Form rules</h2>
      <UButton variant="ghost" size="sm" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
    </div>

    <div class="flex-1 overflow-auto p-2">
      <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
        <template #form_name-cell="{ row }">
          <span class="text-sm">{{ row.original.form_name || row.original.form_id }}</span>
        </template>
        <template #source-cell="{ row }">
          <UBadge variant="soft" size="sm">{{ row.original.source }}</UBadge>
        </template>
        <template #destination_count-cell="{ row }">
          <span class="text-sm">{{ row.original.destination_count ?? 0 }}</span>
        </template>
        <template #enabled-cell="{ row }">
          <USwitch
            :model-value="!!row.original.enabled"
            :disabled="!row.original.rule_id"
            @update:model-value="() => toggleEnabled(row.original)"
          />
        </template>
        <template #last_lead_at-cell="{ row }">
          <span class="text-xs text-muted">
            {{ row.original.last_lead_at ? format(new Date(row.original.last_lead_at), 'PP') : '—' }}
          </span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            size="xs" variant="ghost" icon="i-lucide-settings"
            :disabled="showClientPicker"
            @click="configure(row.original)"
          >Configure</UButton>
        </template>
      </UTable>
    </div>

    <!-- Rule editor slide-over (forward-ref T12) -->
    <LeadsRuleEditor
      v-if="showEditor && editingRuleId && editingFormMeta"
      v-model:open="showEditor"
      :rule-id="editingRuleId"
      :form-meta="editingFormMeta"
      @changed="refresh()"
    />

    <!-- Client picker modal — replaces window.prompt -->
    <UModal v-model:open="showClientPicker">
      <template #content>
        <div class="p-6 space-y-4 w-full max-w-md">
          <h3 class="text-base font-semibold">Pick a client for this form</h3>
          <p class="text-sm text-muted">
            This form isn't mapped yet. Select the client whose ads this form belongs to —
            leads will be stamped with that client and routed to its rules.
          </p>
          <USelectMenu
            v-model="pickerClientId"
            :items="clientOptions"
            value-key="value"
            placeholder="Pick a client"
          />
          <div class="flex justify-end gap-2 pt-2 border-t border-default">
            <UButton variant="ghost" @click="showClientPicker = false">Cancel</UButton>
            <UButton color="primary" @click="confirmPicker">Continue</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
