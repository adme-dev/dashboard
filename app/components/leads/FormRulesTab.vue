<script setup lang="ts">
import { format } from 'date-fns'
import type { LeadSource } from '~/types'

interface RuleListItem {
  source: LeadSource
  form_id: string
  form_name: string | null
  rule_id: string | null
  client_id: string | null
  client_name: string | null
  enabled: boolean | null
  destination_count: string | number | null
  last_lead_at: string | null
}

const { data, refresh, pending } = useFetch<{ items: RuleListItem[] }>('/api/leads/rules/list', {
  default: () => ({ items: [] })
})
// Clients for the picker modal — plain array from /api/agency/clients
const { data: clients } = useFetch<{ id: string, name: string }[]>('/api/agency/clients', {
  default: () => []
})
const clientOptions = computed(() =>
  ((clients.value ?? []) as { id: string, name: string }[]).map(c => ({ value: c.id, label: c.name }))
)

const editingRuleId = ref<string | null>(null)
const editingFormMeta = ref<{ source: string, form_id: string, form_name: string | null } | null>(null)
const showEditor = ref(false)
const toast = useToast()
const emit = defineEmits<{ 'open-setup-guide': [] }>()

const ruleItems = computed(() => data.value?.items ?? [])
const readyRules = computed(() =>
  ruleItems.value.filter(item => item.rule_id && item.enabled && Number(item.destination_count ?? 0) > 0)
)
const needsDestinations = computed(() =>
  ruleItems.value.filter(item => item.rule_id && Number(item.destination_count ?? 0) === 0)
)
const unmappedForms = computed(() => ruleItems.value.filter(item => !item.rule_id || !item.client_id))
const pausedRules = computed(() => ruleItems.value.filter(item => item.rule_id && !item.enabled))

function ruleState(item: RuleListItem): { label: string, color: 'success' | 'warning' | 'error' | 'neutral' } {
  if (!item.rule_id || !item.client_id) return { label: 'Map client', color: 'error' }
  if (!item.enabled) return { label: 'Paused', color: 'neutral' }
  if (Number(item.destination_count ?? 0) === 0) return { label: 'Add destination', color: 'warning' }
  return { label: 'Ready', color: 'success' }
}

function errorMessage(e: unknown): string {
  return e && typeof e === 'object' && 'data' in e
    ? (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? ''
    : ''
}

// Client picker modal state
const showClientPicker = ref(false)
const pickerClientId = ref<string | null>(null)
const pickerPendingItem = ref<RuleListItem | null>(null)

// Proactive new-rule modal state
const showNewRule = ref(false)
const newRule = ref({
  client_id: null as string | null,
  source: 'google' as 'google' | 'meta' | 'webhook' | 'csv',
  form_id: '',
  form_name: ''
})
const newRuleSaving = ref(false)
const useCustomFormId = ref(false)
const SOURCE_OPTIONS = [
  { value: 'google', label: 'Google Ads', description: 'Native Google lead forms' },
  { value: 'meta', label: 'Meta', description: 'Facebook or Instagram lead forms' },
  { value: 'webhook', label: 'Webhook', description: 'Replace a Zapier catch hook, Make, n8n, or custom form' },
  { value: 'csv', label: 'CSV import', description: 'Route imported lead exports through the same destinations' }
]
const SOURCES_WITH_DISCOVERY = new Set(['google', 'meta'])

const sourceHelp = computed(() => {
  switch (newRule.value.source) {
    case 'google':
      return {
        title: 'Google lead form',
        body: 'Pick a discovered Google Ads lead form, or paste the form ID from the Google lead-form URL if it is not listed yet.',
        icon: 'i-simple-icons-google'
      }
    case 'meta':
      return {
        title: 'Meta lead form',
        body: 'Use this for Facebook or Instagram lead forms. If Meta App Review blocks discovery, paste the form ID from Ads Manager.',
        icon: 'i-simple-icons-meta'
      }
    case 'webhook':
      return {
        title: 'Webhook bridge',
        body: 'Use this when the old Zap starts with a catch hook or another form tool. Send the incoming payload to the client webhook endpoint using this form ID.',
        icon: 'i-lucide-webhook'
      }
    case 'csv':
      return {
        title: 'CSV import',
        body: 'Use this when the team imports Lead Center or partner exports. The same form ID must be entered in the CSV import modal when running rules.',
        icon: 'i-lucide-file-spreadsheet'
      }
    default:
      return {
        title: 'Lead source',
        body: 'Choose where this form receives leads from, then add destinations after the rule is created.',
        icon: 'i-lucide-route'
      }
  }
})

const formIdLabel = computed(() => newRule.value.source === 'csv' ? 'Import form key' : 'Form ID')
const formIdHint = computed(() => {
  if (newRule.value.source === 'webhook') return 'Use a stable key from the old Zap or form tool, such as dealer-test-drive or website-finance.'
  if (newRule.value.source === 'csv') return 'Use a stable import key, then reuse it in the CSV import modal when Run routing rules is enabled.'
  return 'Find in the platform lead-form URL, such as ?formId=12345 for Google or /forms/67890 for Meta.'
})
const formIdPlaceholder = computed(() => {
  if (newRule.value.source === 'webhook') return 'e.g. website-test-drive'
  if (newRule.value.source === 'csv') return 'e.g. meta-lead-center-export'
  return 'e.g. 12345 or AW-67890'
})

// OAuth-based form discovery — fired when source is google/meta and the user
// hasn't toggled "custom form ID". Empty for manual source.
interface DiscoveredForm { form_id: string, form_name: string, account_id: string, account_name: string }
const discoverPending = ref(false)
const discoveredForms = ref<DiscoveredForm[]>([])
const discoverError = ref<string | null>(null)

async function discoverForms(source: 'google' | 'meta') {
  discoverPending.value = true
  discoverError.value = null
  discoveredForms.value = []
  try {
    const r = await $fetch<{
      forms: DiscoveredForm[]
      connection_count: number
      needs_meta_app_review?: boolean
    }>(`/api/leads/forms/discover?source=${source}`)
    discoveredForms.value = r.forms
    if (r.connection_count === 0) {
      discoverError.value = `No ${source === 'google' ? 'Google Ads' : 'Meta'} accounts connected. Connect one in Settings → Social.`
    } else if (r.needs_meta_app_review) {
      discoverError.value = `Meta lead form discovery is gated by the leads_retrieval permission, which requires Meta App Review. Toggle "Use a custom form ID" below and paste the form ID from your Meta lead form URL (e.g. /forms/12345 in Ads Manager).`
    } else if (r.forms.length === 0) {
      discoverError.value = `Connected ${r.connection_count} ${source} accounts but no active lead forms were found. Either none exist yet or all are archived.`
    }
  } catch (e: unknown) {
    discoverError.value = errorMessage(e) || 'Failed to discover forms'
  } finally {
    discoverPending.value = false
  }
}

// When source changes, re-fetch discovered forms (unless user chose custom).
// Sources without API discovery (manual, webhook, csv) force custom form ID.
watch(() => newRule.value.source, (s) => {
  newRule.value.form_id = ''
  newRule.value.form_name = ''
  if (!SOURCES_WITH_DISCOVERY.has(s)) {
    discoveredForms.value = []
    discoverError.value = null
    useCustomFormId.value = true
  } else if (!useCustomFormId.value) {
    discoverForms(s as 'google' | 'meta')
  }
})

// When the modal opens, kick off discovery if applicable.
watch(showNewRule, (open) => {
  if (open && !useCustomFormId.value && SOURCES_WITH_DISCOVERY.has(newRule.value.source)) {
    discoverForms(newRule.value.source as 'google' | 'meta')
  }
})

const formOptions = computed(() =>
  discoveredForms.value.map(f => ({
    value: f.form_id,
    label: f.form_name,
    description: f.account_name
  }))
)

// When the user picks a discovered form, auto-fill form_name.
function onDiscoveredPick(form_id: string) {
  const match = discoveredForms.value.find(f => f.form_id === form_id)
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
    toast.add({ title: 'Pick a client', color: 'error' })
    return
  }
  if (!newRule.value.form_id.trim()) {
    toast.add({ title: 'Form ID is required', description: 'Find it in the Google Ads or Meta lead-form URL.', color: 'error' })
    return
  }
  newRuleSaving.value = true
  try {
    const r = await $fetch<{ id: string }>('/api/leads/rules', {
      method: 'POST',
      body: {
        client_id: newRule.value.client_id,
        source: newRule.value.source,
        form_id: newRule.value.form_id.trim(),
        form_name: newRule.value.form_name.trim() || null
      }
    })
    toast.add({ title: 'Form rule created', description: 'Now add destinations to start routing leads.', color: 'success' })
    editingRuleId.value = r.id
    editingFormMeta.value = {
      source: newRule.value.source,
      form_id: newRule.value.form_id.trim(),
      form_name: newRule.value.form_name.trim() || null
    }
    showNewRule.value = false
    resetNewRule()
    showEditor.value = true
    await refresh()
  } catch (e: unknown) {
    toast.add({ title: 'Failed to create rule', description: errorMessage(e), color: 'error' })
  } finally {
    newRuleSaving.value = false
  }
}

const columns = [
  { accessorKey: 'client_id', header: 'Client' },
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'state', header: 'State' },
  { accessorKey: 'destination_count', header: 'Destinations' },
  { accessorKey: 'enabled', header: 'Enabled' },
  { accessorKey: 'last_lead_at', header: 'Last lead' },
  { accessorKey: 'actions', header: '' }
]

const SOURCE_LABELS: Record<string, string> = {
  meta: 'Facebook / Instagram',
  google: 'Google Ads',
  webhook: 'Website / custom',
  csv: 'CSV import',
  manual: 'Manual entry'
}
function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

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
      body: { client_id: clientId, source: item.source, form_id: item.form_id, form_name: item.form_name }
    })
    // editingFormMeta is set in both paths before showEditor = true
    editingRuleId.value = r.id
    editingFormMeta.value = { source: item.source, form_id: item.form_id, form_name: item.form_name }
    showEditor.value = true
    await refresh()
  } catch (e: unknown) {
    toast.add({ title: 'Failed to create rule', description: errorMessage(e), color: 'error' })
  }
}

// Reset picker state when the modal closes so stale refs don't linger.
watch(showClientPicker, (v) => {
  if (!v) {
    pickerPendingItem.value = null
    pickerClientId.value = null
  }
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
        <h2 class="text-base font-semibold">
          Form rules
        </h2>
        <p class="text-xs text-muted">
          Replace Zapier by routing Google, Meta, webhook, and CSV leads to the right destinations.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-book-open"
          @click="emit('open-setup-guide')"
        >
          Connection details
        </UButton>
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-plus"
          @click="showNewRule = true"
        >
          New form rule
        </UButton>
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-refresh-cw"
          @click="refresh()"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-2 p-3 border-b border-default bg-elevated/30">
      <div class="rounded border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Ready to replace Zapier
        </p>
        <p class="mt-1 text-xl font-semibold">
          {{ readyRules.length }}
        </p>
      </div>
      <div class="rounded border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Need destinations
        </p>
        <p class="mt-1 text-xl font-semibold">
          {{ needsDestinations.length }}
        </p>
      </div>
      <div class="rounded border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Need client mapping
        </p>
        <p class="mt-1 text-xl font-semibold">
          {{ unmappedForms.length }}
        </p>
      </div>
      <div class="rounded border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Paused rules
        </p>
        <p class="mt-1 text-xl font-semibold">
          {{ pausedRules.length }}
        </p>
      </div>
    </div>

    <div v-if="ruleItems.length && readyRules.length === 0" class="mx-3 mt-3 rounded border border-warning/30 bg-warning/10 p-3 text-sm">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 text-warning" />
        <div>
          <p class="font-medium">
            No form is fully wired yet.
          </p>
          <p class="text-muted">
            Map a form to a client, add at least one destination, then use Test fire before switching the team off Zapier.
          </p>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-2">
      <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
        <template #client_id-cell="{ row }">
          <span v-if="row.original.client_name" class="text-sm font-medium">{{ row.original.client_name }}</span>
          <UBadge v-else color="warning" variant="soft" size="sm">Unmapped</UBadge>
        </template>
        <template #form_name-cell="{ row }">
          <span class="text-sm">{{ row.original.form_name || row.original.form_id }}</span>
        </template>
        <template #source-cell="{ row }">
          <div class="flex items-center gap-1.5">
            <LeadsSourceIcon :source="row.original.source" size="sm" />
            <span class="text-sm">{{ sourceLabel(row.original.source) }}</span>
          </div>
        </template>
        <template #state-cell="{ row }">
          <UBadge :color="ruleState(row.original).color" variant="soft" size="sm">
            {{ ruleState(row.original).label }}
          </UBadge>
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
            size="xs"
            variant="ghost"
            icon="i-lucide-settings"
            :disabled="showClientPicker"
            @click="configure(row.original)"
          >
            Configure
          </UButton>
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
    <UModal v-model:open="showNewRule" :ui="{ content: 'max-w-xl' }">
      <template #content>
        <div class="p-6 space-y-4">
          <div>
            <h3 class="text-lg font-semibold">
              New form rule
            </h3>
            <p class="text-sm text-muted mt-0.5">
              Set up routing before the first lead arrives. Useful when you know the form ID from the
              ad-platform URL ahead of launch.
            </p>
          </div>

          <div class="rounded border border-default bg-elevated/30 p-3 text-xs text-muted flex items-start gap-2">
            <UIcon name="i-lucide-info" class="mt-0.5 size-4 text-primary shrink-0" />
            <span>
              First, paste this client's webhook URL + key into the ad platform's lead form.
              <UButton
                variant="link"
                size="xs"
                class="p-0 h-auto align-baseline"
                @click="showNewRule = false; emit('open-setup-guide')"
              >
                Open the Setup guide →
              </UButton>
            </span>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div class="rounded border border-default p-3">
              <p class="text-xs font-medium">
                1. Pick source
              </p>
              <p class="mt-1 text-xs text-muted">
                Google, Meta, webhook, or CSV.
              </p>
            </div>
            <div class="rounded border border-default p-3">
              <p class="text-xs font-medium">
                2. Map client
              </p>
              <p class="mt-1 text-xs text-muted">
                Stamp every lead to the right account.
              </p>
            </div>
            <div class="rounded border border-default p-3">
              <p class="text-xs font-medium">
                3. Add destinations
              </p>
              <p class="mt-1 text-xs text-muted">
                Slack, email, Sheets, portal, or webhook.
              </p>
            </div>
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

          <div class="rounded border border-default bg-elevated/30 p-3 text-sm">
            <div class="flex items-start gap-2">
              <UIcon :name="sourceHelp.icon" class="mt-0.5 size-4 text-primary" />
              <div>
                <p class="font-medium">
                  {{ sourceHelp.title }}
                </p>
                <p class="text-muted">
                  {{ sourceHelp.body }}
                </p>
              </div>
            </div>
          </div>

          <UFormField
            v-if="!useCustomFormId && SOURCES_WITH_DISCOVERY.has(newRule.source)"
            label="Form"
            required
            :hint="discoverPending ? 'Loading forms from connected accounts…' : 'Pick a form from your connected ad accounts. Toggle Custom below if it is not listed yet.'"
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
            :label="formIdLabel"
            required
            :hint="formIdHint"
          >
            <UInput
              v-model="newRule.form_id"
              :placeholder="formIdPlaceholder"
              class="w-full"
            />
          </UFormField>

          <label
            v-if="SOURCES_WITH_DISCOVERY.has(newRule.source)"
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
            <UButton
              :loading="newRuleSaving"
              color="primary"
              icon="i-lucide-arrow-right"
              @click="createNewRule"
            >
              Create &amp; configure
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Connection details & webhook keys now live in the Setup guide (single source of truth) -->


    <!-- Client picker modal — replaces window.prompt -->
    <UModal v-model:open="showClientPicker">
      <template #content>
        <div class="p-6 space-y-4 w-full max-w-md">
          <h3 class="text-base font-semibold">
            Pick a client for this form
          </h3>
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
            <UButton variant="ghost" @click="showClientPicker = false">
              Cancel
            </UButton>
            <UButton color="primary" @click="confirmPicker">
              Continue
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
