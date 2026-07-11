<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { LeadRuleDestination, LeadDestinationType } from '~/types'

const props = defineProps<{
  ruleId: string
  formMeta: { source: string, form_id: string, form_name: string | null }
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>
const data = ref<{
  rule: { enabled: boolean, last_test_fired_at: string | null } | null
  destinations: LeadRuleDestination[]
}>({ rule: null, destinations: [] })
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<{
      rule: { enabled: boolean, last_test_fired_at: string | null } | null
      destinations: LeadRuleDestination[]
    }>(`/api/leads/rules/${props.ruleId}`)
  } finally {
    pending.value = false
  }
}

await refresh()
watch(() => props.ruleId, () => { refresh() })

const editingDest = ref<LeadRuleDestination | null>(null)
const showDestModal = ref(false)
const showTestFire = ref(false)

// Confirmation modal for delete (replaces window.confirm — project rule: no native dialogs)
const showDeleteConfirm = ref(false)
const pendingDelete = ref<LeadRuleDestination | null>(null)

const enabledDestinationCount = computed(() =>
  (data.value?.destinations ?? []).filter(d => d.enabled).length
)
const isRuleReady = computed(() => Boolean(data.value?.rule?.enabled && enabledDestinationCount.value > 0))
const portalDestination = computed(() =>
  (data.value?.destinations ?? []).find(d => d.destination_type === 'portal')
)
const portalVisible = computed(() => Boolean(data.value?.rule?.enabled && portalDestination.value?.enabled))

// ---- Setup-progress checklist + routing on/off ----
const routeDone = computed(() => enabledDestinationCount.value > 0)
const tested = computed(() => Boolean(data.value?.rule?.last_test_fired_at))
const testedAgo = computed(() =>
  data.value?.rule?.last_test_fired_at
    ? formatDistanceToNow(new Date(data.value.rule.last_test_fired_at), { addSuffix: true })
    : ''
)

const togglingEnabled = ref(false)
async function setEnabled(value: boolean) {
  togglingEnabled.value = true
  try {
    await apiFetch(`/api/leads/rules/${props.ruleId}`, { method: 'PATCH', body: { enabled: value } })
    await refresh()
    emit('changed')
    toast.add({ title: value ? 'Routing resumed' : 'Routing paused', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to update routing', description: errorMessage(e), color: 'error' })
  } finally {
    togglingEnabled.value = false
  }
}

function destinationSummary(d: LeadRuleDestination): string {
  const config = d.config as Record<string, unknown>
  if (d.destination_type === 'email') return String(config.to || config.recipients || 'Email destination')
  if (d.destination_type === 'slack') return String(config.channel || config.webhook_url || 'Slack destination')
  if (d.destination_type === 'webhook') return String(config.url || config.webhook_url || 'Webhook destination')
  if (d.destination_type === 'assign_user') return String(config.user_id || 'Assign user')
  if (d.destination_type === 'sheets') return String(config.spreadsheet_id || 'Google Sheet')
  if (d.destination_type === 'portal') return 'Visible in client portal'
  return JSON.stringify(config)
}

function errorMessage(e: unknown): string {
  return e && typeof e === 'object' && 'data' in e
    ? (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? ''
    : ''
}

function newDestination(type: LeadDestinationType) {
  editingDest.value = {
    id: '',
    rule_id: props.ruleId,
    destination_type: type,
    config: {},
    filter: null,
    delay_minutes: 0,
    enabled: true,
    sort_order: 0,
    created_at: '',
    updated_at: ''
  } as LeadRuleDestination
  showDestModal.value = true
}

function editDestination(d: LeadRuleDestination) {
  editingDest.value = { ...d }
  showDestModal.value = true
}

function askDelete(d: LeadRuleDestination) {
  pendingDelete.value = d
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  const destId = pendingDelete.value.id
  try {
    await apiFetch(`/api/leads/rules/${props.ruleId}/destinations/${destId}`, { method: 'DELETE' })
    toast.add({ title: 'Destination removed', color: 'success' })
    showDeleteConfirm.value = false
    pendingDelete.value = null
    await refresh()
    emit('changed')
  } catch (e: unknown) {
    toast.add({ title: 'Failed to delete', description: errorMessage(e), color: 'error' })
  }
}

function cancelDelete() {
  showDeleteConfirm.value = false
  pendingDelete.value = null
}

const ADD_TYPES: { type: LeadDestinationType, label: string, icon: string }[] = [
  { type: 'portal', label: 'Show in client portal', icon: 'i-lucide-monitor' },
  { type: 'webhook', label: 'Outbound webhook', icon: 'i-lucide-link' },
  { type: 'slack', label: 'Slack channel', icon: 'i-lucide-message-circle' },
  { type: 'email', label: 'Email staff', icon: 'i-lucide-mail' },
  { type: 'sheets', label: 'Google Sheet append', icon: 'i-lucide-table' },
  { type: 'assign_user', label: 'Assign to user', icon: 'i-lucide-user' }
]

const addMenuItems = computed(() => [
  ADD_TYPES
    .filter(t => t.type !== 'portal' || !portalDestination.value)
    .map(t => ({
      label: t.label,
      icon: t.icon,
      onSelect: () => newDestination(t.type)
    }))
])
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full max-w-3xl' }">
    <template #content>
      <div class="flex flex-col h-full">
        <!-- Header -->
        <header class="px-6 py-4 border-b border-default flex items-center justify-between shrink-0">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-semibold">
                {{ formMeta.form_name || formMeta.form_id }}
              </h2>
              <UBadge :color="isRuleReady ? 'success' : 'warning'" variant="soft" size="sm">
                {{ isRuleReady ? 'Ready' : 'Needs setup' }}
              </UBadge>
            </div>
            <p class="text-xs text-muted">
              {{ formMeta.source }} · form {{ formMeta.form_id }} · replaces Zapier routing for this form
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              variant="ghost"
              size="sm"
              icon="i-lucide-flask-conical"
              @click="showTestFire = true"
            >
              Test fire
            </UButton>
            <UButton
              variant="ghost"
              size="sm"
              icon="i-lucide-x"
              aria-label="Close rule editor"
              @click="open = false"
            />
          </div>
        </header>

        <!-- Body -->
        <div class="flex-1 overflow-auto p-6 space-y-6">
          <section class="rounded-lg border border-default overflow-hidden">
            <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-default bg-elevated/30">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold">
                  Setup progress
                </h3>
                <UBadge :color="isRuleReady ? 'success' : 'warning'" variant="soft" size="sm">
                  {{ isRuleReady ? 'Ready' : 'Needs setup' }}
                </UBadge>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs" :class="data?.rule?.enabled ? 'text-muted' : 'text-warning'">
                  {{ data?.rule?.enabled ? 'Routing active' : 'Routing paused' }}
                </span>
                <USwitch
                  :model-value="data?.rule?.enabled ?? false"
                  :loading="togglingEnabled"
                  aria-label="Toggle routing on or off"
                  @update:model-value="setEnabled"
                />
              </div>
            </div>

            <div
              v-if="data?.rule && !data.rule.enabled"
              class="px-4 py-2 text-xs text-warning bg-warning/10 border-b border-warning/20"
            >
              Routing paused — leads are still captured, just not sent to destinations.
            </div>

            <ol class="divide-y divide-default">
              <li class="flex items-start gap-3 px-4 py-3">
                <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <UIcon name="i-lucide-check" class="size-3.5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium">
                    Capture
                  </p>
                  <p class="text-xs text-muted">
                    Leads matching this form ID are ingested and deduped.
                  </p>
                </div>
              </li>

              <li class="flex items-start gap-3 px-4 py-3">
                <span
                  class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                  :class="routeDone ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'"
                >
                  <UIcon :name="routeDone ? 'i-lucide-check' : 'i-lucide-route'" class="size-3.5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium">
                    Route
                  </p>
                  <p class="text-xs text-muted">
                    {{ enabledDestinationCount }} active destination{{ enabledDestinationCount === 1 ? '' : 's' }} configured.
                  </p>
                </div>
                <UDropdownMenu v-if="!routeDone" :items="addMenuItems">
                  <UButton size="xs" variant="soft" icon="i-lucide-plus">
                    Add destination
                  </UButton>
                </UDropdownMenu>
              </li>

              <li class="flex items-start gap-3 px-4 py-3">
                <span
                  class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                  :class="tested ? 'bg-success/15 text-success' : 'border border-default bg-default text-dimmed'"
                >
                  <UIcon :name="tested ? 'i-lucide-check' : 'i-lucide-flask-conical'" class="size-3.5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium">
                    Verify
                  </p>
                  <p class="text-xs text-muted">
                    <template v-if="tested">
                      Last test fired {{ testedAgo }}.
                    </template>
                    <template v-else>
                      Run a test fire before turning off the matching Zap.
                    </template>
                  </p>
                </div>
                <UButton
                  v-if="!tested"
                  size="xs"
                  :variant="routeDone ? 'soft' : 'ghost'"
                  :color="routeDone ? 'primary' : 'neutral'"
                  icon="i-lucide-flask-conical"
                  @click="showTestFire = true"
                >
                  Test fire
                </UButton>
              </li>
            </ol>
          </section>

          <section class="rounded border border-default p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-monitor" class="size-4 text-primary" />
                  <h3 class="text-sm font-semibold">
                    Client portal visibility
                  </h3>
                  <UBadge
                    :color="portalVisible ? 'success' : 'neutral'"
                    variant="soft"
                    size="sm"
                  >
                    {{ portalVisible ? 'Visible to client' : 'Hidden from client' }}
                  </UBadge>
                </div>
                <p class="mt-2 text-sm text-muted">
                  Add an enabled portal destination when this form should appear in the mapped client's portal lead inbox.
                  Keep it off for internal-only forms.
                </p>
              </div>
              <UButton
                v-if="!portalDestination"
                size="sm"
                icon="i-lucide-plus"
                @click="newDestination('portal')"
              >
                Share to portal
              </UButton>
              <UButton
                v-else
                size="sm"
                variant="ghost"
                icon="i-lucide-pencil"
                @click="editDestination(portalDestination)"
              >
                Edit
              </UButton>
            </div>
          </section>

          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">
                Destinations
              </h3>
              <UDropdownMenu :items="addMenuItems">
                <UButton size="sm" icon="i-lucide-plus">
                  Add destination
                </UButton>
              </UDropdownMenu>
            </div>

            <!-- Loading state -->
            <div v-if="pending" class="flex items-center gap-2 text-sm text-muted py-4">
              <UIcon name="i-lucide-loader-circle" class="animate-spin w-4 h-4" />
              Loading destinations…
            </div>

            <!-- Destination list -->
            <ul v-else class="space-y-2">
              <li
                v-for="d in data?.destinations ?? []"
                :key="d.id"
                class="flex items-center justify-between gap-3 p-3 border border-default rounded"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <UBadge variant="soft" size="sm">
                      {{ d.destination_type }}
                    </UBadge>
                    <USwitch :model-value="d.enabled" disabled />
                    <span v-if="d.delay_minutes" class="text-xs text-muted">
                      +{{ d.delay_minutes }}m delay
                    </span>
                    <span v-if="d.filter" class="text-xs text-muted">· filtered</span>
                  </div>
                  <p class="text-xs text-muted mt-1 truncate">
                    {{ destinationSummary(d) }}
                  </p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-pencil"
                    aria-label="Edit destination"
                    @click="editDestination(d)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    aria-label="Delete destination"
                    @click="askDelete(d)"
                  />
                </div>
              </li>

              <div v-if="!pending && !data?.destinations?.length" class="rounded border border-dashed border-default p-4 text-sm">
                <p class="font-medium">
                  No destinations configured.
                </p>
                <p class="mt-1 text-muted">
                  Add Slack, email, webhook, Sheets, portal, or assignment destinations to replace the actions currently handled in Zapier.
                </p>
              </div>
            </ul>
          </section>
        </div>
      </div>

      <!-- Destination editor (forward-ref: T15) -->
      <LeadsDestinationEditor
        v-if="showDestModal && editingDest"
        v-model:open="showDestModal"
        :rule-id="ruleId"
        :form-meta="formMeta"
        :destination="editingDest"
        @saved="() => { refresh(); emit('changed') }"
      />

      <!-- Test-fire panel (forward-ref: T16) -->
      <LeadsTestFirePanel
        v-if="showTestFire"
        v-model:open="showTestFire"
        :rule-id="ruleId"
        :form-meta="formMeta"
        @fired="refresh()"
      />

      <!-- Delete confirmation modal -->
      <UModal v-model:open="showDeleteConfirm">
        <template #content>
          <div class="p-6 space-y-3 max-w-md">
            <h3 class="text-base font-semibold">
              Delete destination?
            </h3>
            <p class="text-sm text-muted">
              This removes the destination immediately. Pending deliveries already enqueued
              for this rule will still attempt; new leads will skip it.
            </p>
            <div class="flex justify-end gap-2 pt-2">
              <UButton variant="ghost" @click="cancelDelete">
                Cancel
              </UButton>
              <UButton color="error" @click="confirmDelete">
                Delete
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </USlideover>
</template>
