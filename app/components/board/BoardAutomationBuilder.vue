<script setup lang="ts">
const props = defineProps<{
  boardId: string
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const toast = useToast()

interface Automation {
  id: string
  name: string
  isActive: boolean
  triggerType: string
  triggerConfig: Record<string, any>
  actionType: string
  actionConfig: Record<string, any>
}

const automations = ref<Automation[]>([])
const loading = ref(false)
const showNewForm = ref(false)

// New automation form
const newName = ref('')
const newTriggerType = ref('status_changed')
const newTriggerConfig = ref<Record<string, any>>({})
const newActionType = ref('send_email')
const newActionConfig = ref<Record<string, any>>({ to: 'assignee' })
const saving = ref(false)

const triggerOptions = [
  { value: 'status_changed', label: 'Status changes', icon: 'i-lucide-arrow-right-circle', description: 'When an item status changes' },
  { value: 'item_created', label: 'Item created', icon: 'i-lucide-plus-circle', description: 'When a new item is added' },
  { value: 'column_changed', label: 'Column value changes', icon: 'i-lucide-edit-3', description: 'When a column value is updated' },
]

const actionOptions = [
  { value: 'send_email', label: 'Send email', icon: 'i-lucide-mail', description: 'Send an email to assignee, creator, or custom address' },
  { value: 'create_notification', label: 'Create notification', icon: 'i-lucide-bell', description: 'Send an in-app notification' },
  { value: 'update_column', label: 'Update column', icon: 'i-lucide-columns-3', description: 'Set a column value automatically' },
]

const recipientOptions = [
  { value: 'assignee', label: 'Assignee' },
  { value: 'creator', label: 'Creator' },
  { value: 'custom', label: 'Custom email' },
]

async function fetchAutomations() {
  loading.value = true
  try {
    const data = await $fetch(`/api/agency/boards/${props.boardId}/automations`)
    automations.value = (data as any).automations
  } catch {
    automations.value = []
  } finally {
    loading.value = false
  }
}

async function createAutomation() {
  if (!newName.value.trim()) return

  saving.value = true
  try {
    const data = await $fetch(`/api/agency/boards/${props.boardId}/automations`, {
      method: 'POST',
      body: {
        name: newName.value.trim(),
        triggerType: newTriggerType.value,
        triggerConfig: newTriggerConfig.value,
        actionType: newActionType.value,
        actionConfig: newActionConfig.value,
      },
    })
    automations.value.unshift(data as Automation)
    resetForm()
    toast.add({ title: 'Automation created', color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Failed to create automation', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleActive(automation: Automation) {
  try {
    await $fetch(`/api/agency/boards/${props.boardId}/automations/${automation.id}`, {
      method: 'PATCH',
      body: { isActive: !automation.isActive },
    })
    automation.isActive = !automation.isActive
  } catch {
    toast.add({ title: 'Failed to update', color: 'error' })
  }
}

async function deleteAutomation(automation: Automation) {
  try {
    await $fetch(`/api/agency/boards/${props.boardId}/automations/${automation.id}`, {
      method: 'DELETE',
    })
    automations.value = automations.value.filter(a => a.id !== automation.id)
    toast.add({ title: 'Automation deleted', color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Failed to delete', color: 'error' })
  }
}

function resetForm() {
  showNewForm.value = false
  newName.value = ''
  newTriggerType.value = 'status_changed'
  newTriggerConfig.value = {}
  newActionType.value = 'send_email'
  newActionConfig.value = { to: 'assignee' }
}

function getTriggerLabel(type: string): string {
  return triggerOptions.find(o => o.value === type)?.label || type
}

function getActionLabel(type: string): string {
  return actionOptions.find(o => o.value === type)?.label || type
}

watch(() => props.open, (isOpen) => {
  if (isOpen) fetchAutomations()
})
</script>

<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-zap" class="w-5 h-5 text-amber-500" />
        <h2 class="text-lg font-semibold">Board Automations</h2>
      </div>
    </template>

    <template #body>
      <div class="space-y-4 min-h-[300px]">
        <!-- Add new automation -->
        <div v-if="!showNewForm" class="flex justify-center">
          <UButton
            label="New Automation"
            icon="i-lucide-plus"
            color="primary"
            variant="soft"
            @click="showNewForm = true"
          />
        </div>

        <!-- New automation form -->
        <div v-if="showNewForm" class="border border-primary/20 rounded-lg p-4 bg-primary/5 space-y-4">
          <UInput v-model="newName" placeholder="Automation name..." class="w-full" />

          <!-- Trigger selection -->
          <div>
            <p class="text-sm font-medium mb-2">When...</p>
            <div class="space-y-1">
              <div
                v-for="trigger in triggerOptions"
                :key="trigger.value"
                class="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors"
                :class="newTriggerType === trigger.value ? 'bg-primary/10 border border-primary/30' : 'hover:bg-elevated/50'"
                @click="newTriggerType = trigger.value"
              >
                <UIcon :name="trigger.icon" class="w-4 h-4 shrink-0" />
                <div>
                  <p class="font-medium">{{ trigger.label }}</p>
                  <p class="text-xs text-muted">{{ trigger.description }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Status change config -->
          <div v-if="newTriggerType === 'status_changed'">
            <UInput
              v-model="newTriggerConfig.toStatus"
              placeholder="To status name (e.g. Done)..."
              class="w-full"
            />
          </div>

          <!-- Action selection -->
          <div>
            <p class="text-sm font-medium mb-2">Then...</p>
            <div class="space-y-1">
              <div
                v-for="action in actionOptions"
                :key="action.value"
                class="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors"
                :class="newActionType === action.value ? 'bg-primary/10 border border-primary/30' : 'hover:bg-elevated/50'"
                @click="newActionType = action.value"
              >
                <UIcon :name="action.icon" class="w-4 h-4 shrink-0" />
                <div>
                  <p class="font-medium">{{ action.label }}</p>
                  <p class="text-xs text-muted">{{ action.description }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Email action config -->
          <div v-if="newActionType === 'send_email'" class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted w-12">To:</span>
              <select
                v-model="newActionConfig.to"
                class="flex-1 text-sm border rounded px-2 py-1.5 bg-white dark:bg-neutral-900"
              >
                <option v-for="r in recipientOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </div>
            <UInput
              v-if="newActionConfig.to === 'custom'"
              v-model="newActionConfig.customEmail"
              placeholder="Email address..."
              class="w-full"
            />
            <UInput
              v-model="newActionConfig.subject"
              placeholder="Email subject (use {item_name}, {status}, {assignee})..."
              class="w-full"
            />
          </div>

          <!-- Notification action config -->
          <div v-if="newActionType === 'create_notification'" class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted w-12">To:</span>
              <select
                v-model="newActionConfig.to"
                class="flex-1 text-sm border rounded px-2 py-1.5 bg-white dark:bg-neutral-900"
              >
                <option v-for="r in recipientOptions.filter(r => r.value !== 'custom')" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </div>
            <UInput
              v-model="newActionConfig.title"
              placeholder="Notification title..."
              class="w-full"
            />
            <UInput
              v-model="newActionConfig.message"
              placeholder="Notification message (use {item_name}, {status})..."
              class="w-full"
            />
          </div>

          <div class="flex items-center justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="resetForm" />
            <UButton
              label="Create"
              color="primary"
              size="sm"
              :loading="saving"
              :disabled="!newName.trim()"
              @click="createAutomation"
            />
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-muted" />
        </div>

        <!-- Automations list -->
        <div v-else-if="automations.length > 0" class="space-y-2">
          <div
            v-for="automation in automations"
            :key="automation.id"
            class="flex items-center gap-3 px-4 py-3 border rounded-lg"
            :class="automation.isActive ? 'border-default' : 'border-default opacity-60'"
          >
            <UIcon name="i-lucide-zap" :class="automation.isActive ? 'text-amber-500' : 'text-muted'" class="w-4 h-4 shrink-0" />

            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ automation.name }}</p>
              <p class="text-xs text-muted">
                When <span class="font-medium">{{ getTriggerLabel(automation.triggerType) }}</span>
                <span v-if="automation.triggerConfig?.toStatus"> → {{ automation.triggerConfig.toStatus }}</span>
                → <span class="font-medium">{{ getActionLabel(automation.actionType) }}</span>
              </p>
            </div>

            <UToggle
              :model-value="automation.isActive"
              size="sm"
              @update:model-value="toggleActive(automation)"
            />

            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              @click="deleteAutomation(automation)"
            />
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!showNewForm" class="text-center py-8">
          <UIcon name="i-lucide-zap-off" class="w-10 h-10 text-muted mx-auto mb-2" />
          <p class="text-sm text-muted">No automations yet</p>
          <p class="text-xs text-dimmed mt-1">Create your first automation to automate board workflows</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
