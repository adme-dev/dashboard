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

// Proactive new-rule modal state
const showNewRule = ref(false)
const newRule = ref({
  client_id: null as string | null,
  source: 'google' as 'google' | 'meta' | 'manual',
  form_id: '',
  form_name: '',
})
const newRuleSaving = ref(false)
const useCustomFormId = ref(false)
const SOURCE_OPTIONS = [
  { value: 'google', label: 'Google Ads' },
  { value: 'meta', label: 'Meta (Facebook / Instagram)' },
  { value: 'manual', label: 'Manual / Other' },
]

// OAuth-based form discovery — fired when source is google/meta and the user
// hasn't toggled "custom form ID". Empty for manual source.
interface DiscoveredForm { form_id: string; form_name: string; account_id: string; account_name: string }
const discoverPending = ref(false)
const discoveredForms = ref<DiscoveredForm[]>([])
const discoverError = ref<string | null>(null)

async function discoverForms(source: 'google' | 'meta') {
  discoverPending.value = true
  discoverError.value = null
  discoveredForms.value = []
  try {
    const r = await $fetch<{ forms: DiscoveredForm[]; connection_count: number }>(
      `/api/leads/forms/discover?source=${source}`,
    )
    discoveredForms.value = r.forms
    if (r.forms.length === 0 && r.connection_count > 0) {
      discoverError.value = `Connected ${r.connection_count} ${source} accounts but no lead forms found. Either no forms exist yet or the connected tokens don't have access.`
    } else if (r.connection_count === 0) {
      discoverError.value = `No ${source === 'google' ? 'Google Ads' : 'Meta'} accounts connected. Connect one in Settings → Social.`
    }
  } catch (e: any) {
    discoverError.value = e?.data?.statusMessage ?? 'Failed to discover forms'
  } finally {
    discoverPending.value = false
  }
}

// When source changes, re-fetch discovered forms (unless user chose custom).
watch(() => newRule.value.source, (s) => {
  newRule.value.form_id = ''
  newRule.value.form_name = ''
  if (s === 'manual') {
    discoveredForms.value = []
    discoverError.value = null
    useCustomFormId.value = true
  } else if (!useCustomFormId.value) {
    discoverForms(s)
  }
})

// When the modal opens, kick off discovery if applicable.
watch(showNewRule, (open) => {
  if (open && !useCustomFormId.value && newRule.value.source !== 'manual') {
    discoverForms(newRule.value.source)
  }
})

const formOptions = computed(() =>
  discoveredForms.value.map((f) => ({
    value: f.form_id,
    label: f.form_name,
    description: f.account_name,
  })),
)

// When the user picks a discovered form, auto-fill form_name.
function onDiscoveredPick(form_id: string) {
  const match = discoveredForms.value.find((f) => f.form_id === form_id)
  if (match) {
    newRule.value.form_id = match.form_id
    newRule.value.form_name = match.form_name
  }
}
function resetNewRule() {
  newRule.value = { client_id: null, source: 'google', form_id: '', form_name: '' }
  useCustomFormId.value = false
  discoveredForms.value = []
  discoverError.value = null
}
async function createNewRule() {
  if (!newRule.value.client_id) {
    toast.add({ title: 'Pick a client', color: 'error' }); return
  }
  if (!newRule.value.form_id.trim()) {
    toast.add({ title: 'Form ID is required', description: 'Find it in the Google Ads or Meta lead-form URL.', color: 'error' }); return
  }
  newRuleSaving.value = true
  try {
    const r = await $fetch<{ id: string }>('/api/leads/rules', {
      method: 'POST',
      body: {
        client_id: newRule.value.client_id,
        source: newRule.value.source,
        form_id: newRule.value.form_id.trim(),
        form_name: newRule.value.form_name.trim() || null,
      },
    })
    toast.add({ title: 'Form rule created', description: 'Now add destinations to start routing leads.', color: 'success' })
    editingRuleId.value = r.id
    editingFormMeta.value = {
      source: newRule.value.source,
      form_id: newRule.value.form_id.trim(),
      form_name: newRule.value.form_name.trim() || null,
    }
    showNewRule.value = false
    resetNewRule()
    showEditor.value = true
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Failed to create rule', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally { newRuleSaving.value = false }
}

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
      <div>
        <h2 class="text-base font-semibold">Form rules</h2>
        <p class="text-xs text-muted">Routing rules per lead form. New forms appear here automatically on first lead.</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton color="primary" size="sm" icon="i-lucide-plus" @click="showNewRule = true">New form rule</UButton>
        <UButton variant="ghost" size="sm" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
      </div>
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

    <!-- Proactive new form rule modal -->
    <UModal v-model:open="showNewRule" :ui="{ content: 'max-w-lg' }">
      <template #content>
        <div class="p-6 space-y-4">
          <div>
            <h3 class="text-lg font-semibold">New form rule</h3>
            <p class="text-sm text-muted mt-0.5">
              Set up routing before the first lead arrives. Useful when you know the form ID from the
              ad-platform URL ahead of launch.
            </p>
          </div>

          <UFormField label="Client" required>
            <USelectMenu
              v-model="newRule.client_id"
              :items="clientOptions"
              value-key="value"
              placeholder="Pick a client"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Source" required>
            <USelectMenu
              v-model="newRule.source"
              :items="SOURCE_OPTIONS"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="!useCustomFormId && newRule.source !== 'manual'"
            label="Form"
            required
            :hint="discoverPending ? 'Loading forms from connected accounts…' : 'Pick a form from your connected ad accounts. Toggle Custom below if it isn\\'t listed yet.'"
          >
            <USelectMenu
              :model-value="newRule.form_id"
              :items="formOptions"
              value-key="value"
              :loading="discoverPending"
              :disabled="discoverPending || formOptions.length === 0"
              :placeholder="discoverPending ? 'Loading…' : (formOptions.length ? 'Pick a form' : 'No forms found')"
              searchable
              class="w-full"
              @update:model-value="onDiscoveredPick"
            />
            <template v-if="discoverError" #help>
              <span class="text-warning">{{ discoverError }}</span>
            </template>
          </UFormField>

          <UFormField
            v-else
            label="Form ID"
            required
            hint="Find in the platform's lead-form URL — e.g. ...?formId=12345 (Google) or /forms/67890 (Meta)"
          >
            <UInput
              v-model="newRule.form_id"
              placeholder="e.g. 12345 or AW-67890"
              class="w-full"
            />
          </UFormField>

          <label
            v-if="newRule.source !== 'manual'"
            class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none -mt-2"
          >
            <USwitch v-model="useCustomFormId" size="xs" />
            Use a custom form ID instead (for forms not yet visible in the API)
          </label>

          <UFormField
            label="Form name"
            hint="Optional — for display in the inbox and reports"
          >
            <UInput
              v-model="newRule.form_name"
              placeholder="e.g. Brighton SUV — Test Drive"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-3 border-t border-default">
            <UButton variant="ghost" color="neutral" @click="showNewRule = false; resetNewRule()">
              Cancel
            </UButton>
            <UButton :loading="newRuleSaving" color="primary" icon="i-lucide-arrow-right" @click="createNewRule">
              Create &amp; configure
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

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
