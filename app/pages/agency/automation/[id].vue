<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Edit Automation Rule',
  middleware: ['role-management']
})

const route = useRoute()
const toast = useToast()
const ruleId = route.params.id as string

// Tab state
const activeTab = ref<'builder' | 'executions'>((route.query.tab as string) === 'executions' ? 'executions' : 'builder')

// Fetch rule
const { data: ruleData, pending: loading, refresh } = await useFetch(`/api/agency/automation/rules/${ruleId}`)
const rule = computed(() => (ruleData.value as any)?.rule || null)

// Fetch executions
const { data: executionsData, pending: loadingExecutions, refresh: refreshExecutions } = await useFetch(`/api/agency/automation/rules/${ruleId}/executions`, {
  query: { limit: 50 }
})
const executions = computed(() => (executionsData.value as any)?.executions || [])

// Fetch projects for scope
const { data: projectsData } = await useFetch('/api/agency/projects', { query: { limit: 100 } })
const projects = computed(() => ((projectsData.value as any)?.projects || []) as any[])

// Fetch clients for scope
const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 100 } })
const clients = computed(() => ((clientsData.value as any)?.clients || []) as any[])

// Fetch team members
const { data: teamData } = await useFetch('/api/agency/team-members')
const teamMembers = computed(() => ((teamData.value as any)?.members || []) as any[])

// Fetch statuses
const { data: statusesData } = await useFetch('/api/agency/statuses')
const statuses = computed(() => (statusesData.value as any[]) || [])

// Editable form
const editedRule = ref<any>(null)

watch(rule, (r) => {
  if (r && !editedRule.value) {
    editedRule.value = JSON.parse(JSON.stringify(r))
  }
}, { immediate: true })

// Trigger types
const triggerTypes = [
  { label: 'Task Created', value: 'task_created', icon: 'i-lucide-plus-circle' },
  { label: 'Task Updated', value: 'task_updated', icon: 'i-lucide-edit' },
  { label: 'Task Status Changed', value: 'task_status_changed', icon: 'i-lucide-refresh-cw' },
  { label: 'Task Assigned', value: 'task_assigned', icon: 'i-lucide-user-plus' },
  { label: 'Task Due Soon', value: 'task_due_soon', icon: 'i-lucide-clock' },
  { label: 'Task Overdue', value: 'task_overdue', icon: 'i-lucide-alert-triangle' },
  { label: 'Project Created', value: 'project_created', icon: 'i-lucide-folder-plus' },
  { label: 'Project Status Changed', value: 'project_status_changed', icon: 'i-lucide-folder-sync' },
  { label: 'Time Entry Created', value: 'time_entry_created', icon: 'i-lucide-timer' },
  { label: 'Budget Threshold', value: 'budget_threshold', icon: 'i-lucide-dollar-sign' },
  { label: 'Schedule', value: 'schedule', icon: 'i-lucide-calendar' },
  { label: 'Webhook', value: 'webhook', icon: 'i-lucide-webhook' }
]

// Action types
const actionTypes = [
  { label: 'Change Status', value: 'change_status', icon: 'i-lucide-refresh-cw' },
  { label: 'Assign User', value: 'assign_user', icon: 'i-lucide-user-plus' },
  { label: 'Add Label', value: 'add_label', icon: 'i-lucide-tag' },
  { label: 'Set Priority', value: 'set_priority', icon: 'i-lucide-flag' },
  { label: 'Send Email', value: 'send_email', icon: 'i-lucide-mail' },
  { label: 'Send Notification', value: 'send_notification', icon: 'i-lucide-bell' },
  { label: 'Create Task', value: 'create_task', icon: 'i-lucide-plus-square' },
  { label: 'Update Field', value: 'update_field', icon: 'i-lucide-edit-3' },
  { label: 'Webhook', value: 'webhook', icon: 'i-lucide-webhook' }
]

// Condition operators
const conditionOperators = [
  { label: 'Equals', value: 'equals' },
  { label: 'Not Equals', value: 'not_equals' },
  { label: 'Contains', value: 'contains' },
  { label: 'Greater Than', value: 'greater_than' },
  { label: 'Less Than', value: 'less_than' },
  { label: 'Is Empty', value: 'is_empty' },
  { label: 'Is Not Empty', value: 'is_not_empty' }
]

// Condition fields
const conditionFields = [
  { label: 'Status', value: 'status' },
  { label: 'Priority', value: 'priority' },
  { label: 'Assignee', value: 'assignee' },
  { label: 'Project', value: 'project' },
  { label: 'Client', value: 'client' },
  { label: 'Department', value: 'department' },
  { label: 'Due Date', value: 'due_date' },
  { label: 'Created Date', value: 'created_date' },
  { label: 'Title', value: 'title' },
  { label: 'Description', value: 'description' }
]

// Add condition
const addCondition = () => {
  if (!editedRule.value.conditions) {
    editedRule.value.conditions = []
  }
  editedRule.value.conditions.push({
    field: 'status',
    operator: 'equals',
    value: ''
  })
}

// Remove condition
const removeCondition = (index: number) => {
  editedRule.value.conditions.splice(index, 1)
}

// Add action
const addAction = () => {
  if (!editedRule.value.actions) {
    editedRule.value.actions = []
  }
  editedRule.value.actions.push({
    type: 'send_notification',
    config: {}
  })
}

// Remove action
const removeAction = (index: number) => {
  editedRule.value.actions.splice(index, 1)
}

// Save rule
const saving = ref(false)
const saveRule = async () => {
  if (!editedRule.value.name) {
    toast.add({ title: 'Please enter a rule name', color: 'error' })
    return
  }

  saving.value = true
  try {
    await $fetch(`/api/agency/automation/rules/${ruleId}`, {
      method: 'PUT',
      body: {
        name: editedRule.value.name,
        description: editedRule.value.description,
        isActive: editedRule.value.isActive,
        trigger: editedRule.value.trigger,
        conditions: editedRule.value.conditions,
        actions: editedRule.value.actions,
        scope: editedRule.value.scope
      }
    })
    toast.add({ title: 'Rule saved', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to save rule', description: err.data?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// Execute rule manually
const executing = ref(false)
const executeRule = async () => {
  executing.value = true
  try {
    await $fetch(`/api/agency/automation/rules/${ruleId}/execute`, { method: 'POST' })
    toast.add({ title: 'Rule executed', color: 'success' })
    refreshExecutions()
  } catch (err: any) {
    toast.add({ title: 'Failed to execute rule', description: err.data?.message, color: 'error' })
  } finally {
    executing.value = false
  }
}

// Format date
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

// Get trigger icon
const getTriggerIcon = (type: string) => {
  return triggerTypes.find(t => t.value === type)?.icon || 'i-lucide-zap'
}

// Get action icon
const getActionIcon = (type: string) => {
  return actionTypes.find(a => a.value === type)?.icon || 'i-lucide-play'
}

// Execution status color
const getExecutionStatusColor = (status: string): 'success' | 'error' | 'warning' | 'neutral' => {
  switch (status) {
    case 'success': return 'success'
    case 'failed': return 'error'
    case 'partial': return 'warning'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar :title="rule?.name || 'Loading...'">
        <template #left>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            to="/agency/automation"
          />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              variant="outline"
              icon="i-lucide-zap"
              label="Run Now"
              :loading="executing"
              :disabled="!rule?.isActive"
              @click="executeRule"
            />
            <UButton
              color="primary"
              icon="i-lucide-save"
              label="Save"
              :loading="saving"
              @click="saveRule"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6" v-if="!loading && editedRule">
        <!-- Tab Navigation -->
        <div class="flex items-center gap-4 mb-6 border-b border-gray-200 dark:border-gray-700">
          <button
            class="pb-3 px-1 text-sm font-medium transition-colors relative"
            :class="activeTab === 'builder' ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'builder'"
          >
            Rule Builder
            <span
              v-if="activeTab === 'builder'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
            />
          </button>
          <button
            class="pb-3 px-1 text-sm font-medium transition-colors relative"
            :class="activeTab === 'executions' ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'executions'"
          >
            Execution History
            <span
              v-if="activeTab === 'executions'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
            />
          </button>
        </div>

        <!-- Builder Tab -->
        <div v-if="activeTab === 'builder'" class="space-y-6">
          <!-- Basic Info -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Basic Information</h3>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormField label="Rule Name" required>
                <UInput v-model="editedRule.name" placeholder="e.g., Notify on task completion" />
              </UFormField>

              <UFormField label="Status">
                <div class="flex items-center gap-4 h-10">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input v-model="editedRule.isActive" type="checkbox" class="rounded" />
                    <span>Active</span>
                  </label>
                </div>
              </UFormField>

              <div class="md:col-span-2">
                <UFormField label="Description">
                  <UTextarea v-model="editedRule.description" :rows="2" placeholder="Describe what this rule does..." />
                </UFormField>
              </div>
            </div>
          </UCard>

          <!-- Trigger -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-zap" class="w-5 h-5 text-amber-500" />
                <h3 class="font-semibold">When this happens (Trigger)</h3>
              </div>
            </template>

            <div class="space-y-4">
              <UFormField label="Trigger Type" required>
                <USelectMenu
                  v-model="editedRule.trigger.type"
                  :items="triggerTypes"
                  value-key="value"
                />
              </UFormField>

              <!-- Trigger-specific config -->
              <div v-if="editedRule.trigger.type === 'task_due_soon'" class="grid grid-cols-2 gap-4">
                <UFormField label="Days Before Due">
                  <UInput v-model.number="editedRule.trigger.config.daysBefore" type="number" min="1" />
                </UFormField>
              </div>

              <div v-if="editedRule.trigger.type === 'budget_threshold'" class="grid grid-cols-2 gap-4">
                <UFormField label="Threshold Percentage">
                  <UInput v-model.number="editedRule.trigger.config.threshold" type="number" min="1" max="100" />
                </UFormField>
              </div>

              <div v-if="editedRule.trigger.type === 'schedule'" class="grid grid-cols-2 gap-4">
                <UFormField label="Cron Expression">
                  <UInput v-model="editedRule.trigger.config.cron" placeholder="0 9 * * 1-5" />
                </UFormField>
              </div>
            </div>
          </UCard>

          <!-- Conditions -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-filter" class="w-5 h-5 text-blue-500" />
                  <h3 class="font-semibold">Only if (Conditions)</h3>
                </div>
                <UButton
                  variant="outline"
                  size="sm"
                  icon="i-lucide-plus"
                  label="Add Condition"
                  @click="addCondition"
                />
              </div>
            </template>

            <div class="space-y-3">
              <div
                v-for="(condition, index) in editedRule.conditions"
                :key="index"
                class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <span v-if="index > 0" class="text-sm font-medium text-gray-500">AND</span>

                <USelectMenu
                  v-model="condition.field"
                  :items="conditionFields"
                  value-key="value"
                  class="w-40"
                />

                <USelectMenu
                  v-model="condition.operator"
                  :items="conditionOperators"
                  value-key="value"
                  class="w-36"
                />

                <UInput
                  v-if="!['is_empty', 'is_not_empty'].includes(condition.operator)"
                  v-model="condition.value"
                  placeholder="Value"
                  class="flex-1"
                />

                <UButton
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-trash"
                  color="error"
                  @click="removeCondition(index)"
                />
              </div>

              <div v-if="!editedRule.conditions?.length" class="text-center py-6 text-gray-500">
                <p>No conditions - rule will trigger for all matching events</p>
              </div>
            </div>
          </UCard>

          <!-- Actions -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-play" class="w-5 h-5 text-emerald-500" />
                  <h3 class="font-semibold">Do this (Actions)</h3>
                </div>
                <UButton
                  variant="outline"
                  size="sm"
                  icon="i-lucide-plus"
                  label="Add Action"
                  @click="addAction"
                />
              </div>
            </template>

            <div class="space-y-3">
              <div
                v-for="(action, index) in editedRule.actions"
                :key="index"
                class="p-4 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-500">{{ index + 1 }}.</span>
                    <UIcon :name="getActionIcon(action.type)" class="w-5 h-5 text-gray-600" />
                  </div>
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-trash"
                    color="error"
                    @click="removeAction(index)"
                  />
                </div>

                <div class="space-y-3">
                  <UFormField label="Action Type">
                    <USelectMenu
                      v-model="action.type"
                      :items="actionTypes"
                      value-key="value"
                    />
                  </UFormField>

                  <!-- Action-specific config -->
                  <template v-if="action.type === 'change_status'">
                    <UFormField label="New Status">
                      <USelectMenu
                        v-model="action.config.statusId"
                        :items="statuses.map((s: any) => ({ label: s.name, value: s.id }))"
                        value-key="value"
                        placeholder="Select status"
                      />
                    </UFormField>
                  </template>

                  <template v-if="action.type === 'assign_user'">
                    <UFormField label="Assign To">
                      <USelectMenu
                        v-model="action.config.userId"
                        :items="teamMembers.map(m => ({ label: m.name, value: m.id }))"
                        value-key="value"
                        placeholder="Select user"
                      />
                    </UFormField>
                  </template>

                  <template v-if="action.type === 'set_priority'">
                    <UFormField label="Priority">
                      <USelectMenu
                        v-model="action.config.priority"
                        :items="[
                          { label: 'Urgent', value: 'urgent' },
                          { label: 'High', value: 'high' },
                          { label: 'Medium', value: 'medium' },
                          { label: 'Low', value: 'low' }
                        ]"
                        value-key="value"
                      />
                    </UFormField>
                  </template>

                  <template v-if="action.type === 'send_notification'">
                    <UFormField label="Message">
                      <UTextarea
                        v-model="action.config.message"
                        :rows="2"
                        placeholder="Notification message..."
                      />
                    </UFormField>
                    <UFormField label="Recipients">
                      <USelectMenu
                        v-model="action.config.recipients"
                        :items="[
                          { label: 'Task Assignee', value: 'assignee' },
                          { label: 'Project Manager', value: 'project_manager' },
                          { label: 'Task Creator', value: 'creator' },
                          ...teamMembers.map(m => ({ label: m.name, value: m.id }))
                        ]"
                        value-key="value"
                        multiple
                      />
                    </UFormField>
                  </template>

                  <template v-if="action.type === 'send_email'">
                    <UFormField label="Subject">
                      <UInput v-model="action.config.subject" placeholder="Email subject" />
                    </UFormField>
                    <UFormField label="Body">
                      <UTextarea v-model="action.config.body" :rows="3" placeholder="Email body..." />
                    </UFormField>
                  </template>

                  <template v-if="action.type === 'webhook'">
                    <UFormField label="URL">
                      <UInput v-model="action.config.url" placeholder="https://..." />
                    </UFormField>
                    <UFormField label="Method">
                      <USelectMenu
                        v-model="action.config.method"
                        :items="[
                          { label: 'POST', value: 'POST' },
                          { label: 'GET', value: 'GET' },
                          { label: 'PUT', value: 'PUT' }
                        ]"
                        value-key="value"
                      />
                    </UFormField>
                  </template>
                </div>
              </div>

              <div v-if="!editedRule.actions?.length" class="text-center py-6 text-gray-500">
                <p>No actions configured. Add at least one action.</p>
              </div>
            </div>
          </UCard>

          <!-- Scope -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-target" class="w-5 h-5 text-purple-500" />
                <h3 class="font-semibold">Scope (Optional)</h3>
              </div>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormField label="Limit to Project">
                <USelectMenu
                  v-model="editedRule.scope.projectId"
                  :items="[{ label: 'All Projects', value: null }, ...projects.map(p => ({ label: p.name, value: p.id }))]"
                  value-key="value"
                />
              </UFormField>

              <UFormField label="Limit to Client">
                <USelectMenu
                  v-model="editedRule.scope.clientId"
                  :items="[{ label: 'All Clients', value: null }, ...clients.map(c => ({ label: c.name, value: c.id }))]"
                  value-key="value"
                />
              </UFormField>
            </div>
          </UCard>
        </div>

        <!-- Executions Tab -->
        <div v-if="activeTab === 'executions'">
          <div v-if="loadingExecutions" class="flex items-center justify-center py-12">
            <XfLoader />
          </div>

          <div v-else class="space-y-3">
            <UCard
              v-for="execution in executions"
              :key="execution.id"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <UIcon
                    :name="execution.status === 'success' ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                    :class="execution.status === 'success' ? 'text-emerald-500' : 'text-red-500'"
                    class="w-6 h-6"
                  />
                  <div>
                    <p class="font-medium">Execution #{{ execution.id.slice(0, 8) }}</p>
                    <p class="text-sm text-gray-500">{{ formatDate(execution.executedAt) }}</p>
                  </div>
                </div>

                <div class="flex items-center gap-4">
                  <div class="text-right">
                    <UBadge :color="getExecutionStatusColor(execution.status)" variant="subtle">
                      {{ execution.status }}
                    </UBadge>
                    <p class="text-xs text-gray-400 mt-1">
                      {{ execution.duration }}ms
                    </p>
                  </div>

                  <div class="text-right">
                    <p class="text-sm font-medium">{{ execution.actionsExecuted }} actions</p>
                    <p v-if="execution.error" class="text-xs text-red-500">
                      {{ execution.error }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Execution details -->
              <div v-if="execution.results?.length" class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <p class="text-xs text-gray-400 mb-2">Action Results:</p>
                <div class="space-y-1">
                  <div
                    v-for="(result, i) in execution.results"
                    :key="i"
                    class="flex items-center gap-2 text-sm"
                  >
                    <UIcon
                      :name="result.success ? 'i-lucide-check' : 'i-lucide-x'"
                      :class="result.success ? 'text-emerald-500' : 'text-red-500'"
                      class="w-4 h-4"
                    />
                    <span>{{ result.action }}</span>
                    <span v-if="result.message" class="text-gray-500">- {{ result.message }}</span>
                  </div>
                </div>
              </div>
            </UCard>

            <div v-if="executions.length === 0" class="text-center py-12 text-gray-500">
              <UIcon name="i-lucide-history" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No executions yet. Run the rule or wait for it to trigger.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-6" v-else>
        <div class="flex items-center justify-center py-12">
          <XfLoader />
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
