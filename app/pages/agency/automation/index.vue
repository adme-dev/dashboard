<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Automation Rules',
  middleware: ['role-management']
})

const toast = useToast()

// Filters
const triggerFilter = ref<string>('all')
const activeFilter = ref<string>('all')
const searchQuery = ref('')

// Fetch rules
const { data: rulesData, pending, refresh } = await useFetch('/api/agency/automation/rules', {
  query: {
    triggerType: computed(() => triggerFilter.value === 'all' ? undefined : triggerFilter.value),
    isActive: computed(() => activeFilter.value === 'all' ? undefined : activeFilter.value),
    search: searchQuery
  }
})

const rules = computed(() => (rulesData.value as any)?.rules || [])
const summary = computed(() => (rulesData.value as any)?.summary || { total: 0, active: 0, inactive: 0, byTriggerType: {} })

// Trigger type options
const triggerOptions = [
  { label: 'All Triggers', value: 'all' },
  { label: 'Task Created', value: 'task_created' },
  { label: 'Task Updated', value: 'task_updated' },
  { label: 'Task Status Changed', value: 'task_status_changed' },
  { label: 'Task Assigned', value: 'task_assigned' },
  { label: 'Task Due Soon', value: 'task_due_soon' },
  { label: 'Task Overdue', value: 'task_overdue' },
  { label: 'Project Created', value: 'project_created' },
  { label: 'Project Status Changed', value: 'project_status_changed' },
  { label: 'Time Entry Created', value: 'time_entry_created' },
  { label: 'Budget Threshold', value: 'budget_threshold' },
  { label: 'Schedule', value: 'schedule' },
  { label: 'Webhook', value: 'webhook' }
]

// Active filter options
const activeOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' }
]

// Get trigger icon
const getTriggerIcon = (type: string): string => {
  switch (type) {
    case 'task_created':
    case 'task_updated':
    case 'task_status_changed':
    case 'task_assigned':
      return 'i-lucide-check-square'
    case 'task_due_soon':
    case 'task_overdue':
      return 'i-lucide-clock'
    case 'project_created':
    case 'project_status_changed':
      return 'i-lucide-folder'
    case 'time_entry_created':
      return 'i-lucide-timer'
    case 'budget_threshold':
      return 'i-lucide-dollar-sign'
    case 'schedule':
      return 'i-lucide-calendar'
    case 'webhook':
      return 'i-lucide-webhook'
    default:
      return 'i-lucide-zap'
  }
}

// Format trigger type for display
const formatTrigger = (type: string): string => {
  return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

// Format date
const formatDate = (date: string) => {
  if (!date) return 'Never'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

// Get action count
const getActionCount = (actions: any[]): number => {
  return actions?.length || 0
}

// Get condition count
const getConditionCount = (conditions: any[]): number => {
  return conditions?.length || 0
}

// Toggle rule active state
const toggleRule = async (rule: any) => {
  try {
    await $fetch(`/api/agency/automation/rules/${rule.id}`, {
      method: 'PUT',
      body: { isActive: !rule.isActive }
    })
    toast.add({
      title: rule.isActive ? 'Rule deactivated' : 'Rule activated',
      color: 'success'
    })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update rule', description: err.data?.message, color: 'error' })
  }
}

// Execute rule manually
const executingRule = ref<string | null>(null)
const executeRule = async (ruleId: string) => {
  executingRule.value = ruleId
  try {
    await $fetch(`/api/agency/automation/rules/${ruleId}/execute`, {
      method: 'POST'
    })
    toast.add({ title: 'Rule executed', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to execute rule', description: err.data?.message, color: 'error' })
  } finally {
    executingRule.value = null
  }
}

// New rule modal
const showNewModal = ref(false)
const newRule = ref({
  name: '',
  description: '',
  triggerType: 'task_created',
  isActive: true
})

const creatingRule = ref(false)
const createRule = async () => {
  if (!newRule.value.name) {
    toast.add({ title: 'Please enter a rule name', color: 'error' })
    return
  }

  creatingRule.value = true
  try {
    const result = await $fetch('/api/agency/automation/rules', {
      method: 'POST',
      body: {
        name: newRule.value.name,
        description: newRule.value.description,
        triggerType: newRule.value.triggerType,
        isActive: newRule.value.isActive,
        conditions: [],
        actions: []
      }
    }) as any

    toast.add({ title: 'Rule created', color: 'success' })
    showNewModal.value = false
    resetNewRule()
    navigateTo(`/agency/automation/${result.rule.id}`)
  } catch (err: any) {
    toast.add({ title: 'Failed to create rule', description: err.data?.message, color: 'error' })
  } finally {
    creatingRule.value = false
  }
}

const resetNewRule = () => {
  newRule.value = {
    name: '',
    description: '',
    triggerType: 'task_created',
    isActive: true
  }
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Automation Rules">
        <template #right>
          <UButton
            label="New Rule"
            icon="i-lucide-plus"
            color="primary"
            @click="showNewModal = true"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">Total Rules</p>
              <p class="text-2xl font-bold">{{ summary.total }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">Active</p>
              <p class="text-2xl font-bold text-emerald-500">{{ summary.active }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">Inactive</p>
              <p class="text-2xl font-bold text-gray-400">{{ summary.inactive }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">Trigger Types</p>
              <p class="text-2xl font-bold">{{ Object.keys(summary.byTriggerType).length }}</p>
            </div>
          </UCard>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            placeholder="Search rules..."
            icon="i-lucide-search"
            class="w-64"
          />
          <USelectMenu
            v-model="triggerFilter"
            :items="triggerOptions"
            placeholder="Trigger"
            value-key="value"
            class="w-48"
          />
          <USelectMenu
            v-model="activeFilter"
            :items="activeOptions"
            placeholder="Status"
            value-key="value"
            class="w-32"
          />
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <!-- Rules List -->
        <div v-else class="space-y-3">
          <UCard
            v-for="rule in rules"
            :key="rule.id"
            class="hover:shadow-md transition-shadow"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-start gap-4">
                <!-- Trigger Icon -->
                <div
                  class="p-3 rounded-lg"
                  :class="rule.isActive ? 'bg-primary-100 dark:bg-primary-900/30' : 'bg-gray-100 dark:bg-gray-800'"
                >
                  <UIcon
                    :name="getTriggerIcon(rule.trigger.type)"
                    class="w-6 h-6"
                    :class="rule.isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'"
                  />
                </div>

                <!-- Rule Info -->
                <div>
                  <div class="flex items-center gap-2">
                    <NuxtLink
                      :to="`/agency/automation/${rule.id}`"
                      class="font-semibold text-lg hover:text-primary-500"
                    >
                      {{ rule.name }}
                    </NuxtLink>
                    <UBadge
                      :color="rule.isActive ? 'success' : 'neutral'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ rule.isActive ? 'Active' : 'Inactive' }}
                    </UBadge>
                  </div>
                  <p v-if="rule.description" class="text-sm text-gray-500 mt-1 line-clamp-1">
                    {{ rule.description }}
                  </p>
                  <div class="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span class="flex items-center gap-1">
                      <UIcon :name="getTriggerIcon(rule.trigger.type)" class="w-4 h-4" />
                      {{ formatTrigger(rule.trigger.type) }}
                    </span>
                    <span>{{ getConditionCount(rule.conditions) }} conditions</span>
                    <span>{{ getActionCount(rule.actions) }} actions</span>
                  </div>
                </div>
              </div>

              <!-- Stats & Actions -->
              <div class="flex items-center gap-6">
                <!-- Scope -->
                <div v-if="rule.scope.project || rule.scope.client" class="text-right">
                  <p class="text-xs text-gray-400">Scope</p>
                  <p class="text-sm font-medium">
                    {{ rule.scope.project?.name || rule.scope.client?.name || 'Global' }}
                  </p>
                </div>

                <!-- Stats -->
                <div class="text-right">
                  <p class="text-xs text-gray-400">Executions</p>
                  <p class="font-semibold">
                    <span class="text-emerald-500">{{ rule.stats.successful }}</span>
                    /
                    <span class="text-red-500">{{ rule.stats.failed }}</span>
                  </p>
                  <p class="text-xs text-gray-400">
                    Last: {{ formatDate(rule.stats.lastTriggeredAt) }}
                  </p>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2">
                  <UButton
                    variant="ghost"
                    size="sm"
                    :icon="rule.isActive ? 'i-lucide-pause' : 'i-lucide-play'"
                    @click="toggleRule(rule)"
                  />
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-zap"
                    :loading="executingRule === rule.id"
                    :disabled="!rule.isActive"
                    @click="executeRule(rule.id)"
                  />
                  <UDropdownMenu
                    :items="[[
                      { label: 'Edit', icon: 'i-lucide-pencil', onClick: () => navigateTo(`/agency/automation/${rule.id}`) },
                      { label: 'View Executions', icon: 'i-lucide-history', onClick: () => navigateTo(`/agency/automation/${rule.id}?tab=executions`) }
                    ], [
                      { label: 'Duplicate', icon: 'i-lucide-copy' },
                      { label: 'Delete', icon: 'i-lucide-trash', color: 'error' }
                    ]]"
                  >
                    <UButton variant="ghost" size="sm" icon="i-lucide-more-vertical" />
                  </UDropdownMenu>
                </div>
              </div>
            </div>
          </UCard>

          <div v-if="rules.length === 0" class="text-center py-12 text-gray-500">
            <UIcon name="i-lucide-zap" class="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No automation rules found. Create one to get started!</p>
          </div>
        </div>
      </div>
    </UDashboardPanel>

    <!-- New Rule Modal -->
    <UModal v-model:open="showNewModal">
      <template #header>
        <h3 class="font-semibold">Create Automation Rule</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Rule Name" required>
            <UInput v-model="newRule.name" placeholder="e.g., Notify on task completion" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="newRule.description" placeholder="Describe what this rule does..." :rows="2" />
          </UFormField>

          <UFormField label="Trigger">
            <USelectMenu
              v-model="newRule.triggerType"
              :items="triggerOptions.filter(t => t.value !== 'all')"
              value-key="value"
            />
          </UFormField>

          <UCheckbox v-model="newRule.isActive" label="Activate immediately" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showNewModal = false" />
          <UButton
            color="primary"
            label="Create Rule"
            :loading="creatingRule"
            @click="createRule"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
