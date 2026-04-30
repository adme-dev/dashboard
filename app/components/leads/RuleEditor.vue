<script setup lang="ts">
import type { LeadRuleDestination, LeadDestinationType } from '~/types'

const props = defineProps<{
  ruleId: string
  formMeta: { source: string; form_id: string; form_name: string | null }
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToast()
const { data, refresh, pending } = useFetch<{
  rule: any
  destinations: LeadRuleDestination[]
}>(`/api/leads/rules/${props.ruleId}`, { default: () => ({ rule: null, destinations: [] }) })

const editingDest = ref<LeadRuleDestination | null>(null)
const showDestModal = ref(false)
const showTestFire = ref(false)

// Confirmation modal for delete (replaces window.confirm — project rule: no native dialogs)
const showDeleteConfirm = ref(false)
const pendingDelete = ref<LeadRuleDestination | null>(null)

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
    updated_at: '',
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
    await $fetch(`/api/leads/rules/${props.ruleId}/destinations/${destId}`, { method: 'DELETE' })
    toast.add({ title: 'Destination removed', color: 'success' })
    showDeleteConfirm.value = false
    pendingDelete.value = null
    await refresh()
    emit('changed')
  } catch (e: any) {
    toast.add({ title: 'Failed to delete', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}

function cancelDelete() {
  showDeleteConfirm.value = false
  pendingDelete.value = null
}

const ADD_TYPES: { type: LeadDestinationType; label: string; icon: string }[] = [
  { type: 'portal',      label: 'Client portal write',  icon: 'i-lucide-monitor' },
  { type: 'webhook',     label: 'Outbound webhook',      icon: 'i-lucide-link' },
  { type: 'slack',       label: 'Slack channel',         icon: 'i-lucide-message-circle' },
  { type: 'email',       label: 'Email staff',           icon: 'i-lucide-mail' },
  { type: 'sheets',      label: 'Google Sheet append',   icon: 'i-lucide-table' },
  { type: 'assign_user', label: 'Assign to user',        icon: 'i-lucide-user' },
]

const addMenuItems = computed(() => [
  ADD_TYPES.map(t => ({
    label: t.label,
    icon: t.icon,
    onSelect: () => newDestination(t.type),
  })),
])
</script>

<template>
  <USlideover v-model:open="open" :ui="{ container: 'w-full max-w-3xl' }">
    <template #content>
      <div class="flex flex-col h-full">
        <!-- Header -->
        <header class="px-6 py-4 border-b border-default flex items-center justify-between shrink-0">
          <div>
            <h2 class="text-base font-semibold">{{ formMeta.form_name || formMeta.form_id }}</h2>
            <p class="text-xs text-muted">{{ formMeta.source }} · form {{ formMeta.form_id }}</p>
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
              @click="open = false"
            />
          </div>
        </header>

        <!-- Body -->
        <div class="flex-1 overflow-auto p-6 space-y-6">
          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">Destinations</h3>
              <UDropdownMenu :items="addMenuItems">
                <UButton size="sm" icon="i-lucide-plus">Add destination</UButton>
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
                    <UBadge variant="soft" size="sm">{{ d.destination_type }}</UBadge>
                    <UToggle :model-value="d.enabled" disabled />
                    <span v-if="d.delay_minutes" class="text-xs text-muted">
                      +{{ d.delay_minutes }}m delay
                    </span>
                    <span v-if="d.filter" class="text-xs text-muted">· filtered</span>
                  </div>
                  <p class="text-xs text-muted mt-1 truncate">{{ JSON.stringify(d.config) }}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-pencil"
                    @click="editDestination(d)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    @click="askDelete(d)"
                  />
                </div>
              </li>

              <p v-if="!pending && !data?.destinations?.length" class="text-sm text-muted">
                No destinations configured. Click <strong>Add destination</strong> to start.
              </p>
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
      />

      <!-- Delete confirmation modal -->
      <UModal v-model:open="showDeleteConfirm">
        <template #content>
          <div class="p-6 space-y-3 max-w-md">
            <h3 class="text-base font-semibold">Delete destination?</h3>
            <p class="text-sm text-muted">
              This removes the destination immediately. Pending deliveries already enqueued
              for this rule will still attempt; new leads will skip it.
            </p>
            <div class="flex justify-end gap-2 pt-2">
              <UButton variant="ghost" @click="cancelDelete">Cancel</UButton>
              <UButton color="error" @click="confirmDelete">Delete</UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </USlideover>
</template>
