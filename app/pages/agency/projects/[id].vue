<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Project Details',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()
const projectId = route.params.id as string

// Fetch project data
const { data, pending, refresh } = await useFetch(`/api/agency/projects/${projectId}`)

const project = computed(() => (data.value as any)?.project)
const timeEntries = computed(() => ((data.value as any)?.timeEntries || []) as any[])
const expenses = computed(() => ((data.value as any)?.expenses || []) as any[])
const taskStats = computed(() => (data.value as any)?.taskStats || { total: 0, completed: 0, inProgress: 0 })
const invoices = computed(() => ((data.value as any)?.invoices || []) as any[])
const sourceBrief = computed(() => (data.value as any)?.sourceBrief || null)

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

const formatDateTime = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

// Status colors
const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  switch (status) {
    case 'active': return 'success'
    case 'draft': return 'neutral'
    case 'on_hold': return 'warning'
    case 'completed': return 'info'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

const getMarginColor = (margin: number): 'success' | 'warning' | 'error' => {
  if (margin >= 30) return 'success'
  if (margin >= 15) return 'warning'
  return 'error'
}

const getInvoiceStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  switch (status) {
    case 'paid': return 'success'
    case 'sent': return 'info'
    case 'overdue': return 'error'
    case 'draft': return 'neutral'
    default: return 'neutral'
  }
}

// Budget consumption percentage
const budgetConsumed = computed(() => {
  if (!project.value || !project.value.budgetAmount) return 0
  return Math.min(100, (project.value.totalCost / project.value.budgetAmount) * 100)
})

// Edit modal
const showEditModal = ref(false)
const editForm = ref({
  name: '',
  description: '',
  status: 'active',
  budgetAmount: 0,
  startDate: '',
  endDate: ''
})

const openEditModal = () => {
  if (project.value) {
    editForm.value = {
      name: project.value.name,
      description: project.value.description || '',
      status: project.value.status,
      budgetAmount: project.value.budgetAmount,
      startDate: project.value.startDate?.split('T')[0] || '',
      endDate: project.value.endDate?.split('T')[0] || ''
    }
    showEditModal.value = true
  }
}

const saving = ref(false)
const saveProject = async () => {
  saving.value = true
  try {
    await ($fetch as any)(`/api/agency/projects/${projectId}`, {
      method: 'PUT',
      body: editForm.value
    })
    toast.add({ title: 'Project updated', color: 'success' })
    showEditModal.value = false
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update project', description: err.data?.message || err.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// Time entry columns (Nuxt UI v4 format)
const timeColumns = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'userName', header: 'Team Member' },
  { accessorKey: 'hours', header: 'Hours' },
  { accessorKey: 'description', header: 'Description' }
]

// Expense columns (Nuxt UI v4 format)
const expenseColumns = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'amount', header: 'Amount' },
  { accessorKey: 'description', header: 'Description' }
]

// Active tab
const activeTab = ref('overview')

// Project Tasks (lazy-loaded on tab switch)
const projectTasksByBoard = ref<Record<string, { boardName: string; boardSlug: string; tasks: any[] }>>({})
const loadingTasks = ref(false)
const tasksLoaded = ref(false)

async function loadProjectTasks() {
  if (tasksLoaded.value) return
  loadingTasks.value = true
  try {
    const data = await $fetch<{ tasks: any[]; byBoard: Record<string, any> }>(`/api/agency/projects/${projectId}/tasks`)
    projectTasksByBoard.value = data.byBoard
    tasksLoaded.value = true
  } catch (err) {
    console.error('Failed to fetch project tasks:', err)
  } finally {
    loadingTasks.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'tasks') loadProjectTasks()
})
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0 flex flex-col">
    <UDashboardPanel>
      <UDashboardNavbar :title="project?.name || 'Project'">
        <template #left>
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            to="/agency/projects"
          />
        </template>
        <template #right>
          <UButton
            v-if="sourceBrief"
            :to="`/agency/briefs/${sourceBrief.id}`"
            :label="sourceBrief.referenceNumber || 'From brief'"
            icon="i-lucide-file-text"
            variant="ghost"
            size="sm"
            color="neutral"
          />
          <UBadge v-if="project" :color="getStatusColor(project.status)" size="lg">
            {{ project.status.replace('_', ' ') }}
          </UBadge>
          <UButton
            label="Edit Project"
            icon="i-lucide-pencil"
            variant="outline"
            @click="openEditModal"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <template v-else-if="project">
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Budget</p>
                <p class="text-2xl font-bold">{{ formatCurrency(project.budgetAmount) }}</p>
                <p class="text-xs text-gray-400">{{ project.budgetType }}</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Spent</p>
                <p class="text-2xl font-bold" :class="project.totalCost > project.budgetAmount ? 'text-red-500' : ''">
                  {{ formatCurrency(project.totalCost) }}
                </p>
                <UProgress
                  :value="budgetConsumed"
                  :color="budgetConsumed > 100 ? 'error' : budgetConsumed > 80 ? 'warning' : 'success'"
                  size="xs"
                  class="mt-2"
                />
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Remaining</p>
                <p class="text-2xl font-bold" :class="project.remainingBudget < 0 ? 'text-red-500' : 'text-emerald-500'">
                  {{ formatCurrency(project.remainingBudget) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Margin</p>
                <p class="text-2xl font-bold" :class="{
                  'text-emerald-500': project.grossMargin >= 30,
                  'text-amber-500': project.grossMargin >= 15 && project.grossMargin < 30,
                  'text-red-500': project.grossMargin < 15
                }">
                  {{ project.grossMargin.toFixed(1) }}%
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Hours Logged</p>
                <p class="text-2xl font-bold">{{ project.hoursWorked.toFixed(1) }}h</p>
                <p class="text-xs text-gray-400">{{ project.billableHours.toFixed(1) }}h billable</p>
              </div>
            </UCard>
          </div>

          <!-- Tabs -->
          <UTabs
            v-model="activeTab"
            :items="[
              { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
              { label: 'Tasks', value: 'tasks', icon: 'i-lucide-check-square' },
              { label: 'Time Entries', value: 'time', icon: 'i-lucide-clock' },
              { label: 'Expenses', value: 'expenses', icon: 'i-lucide-receipt' },
              { label: 'Invoices', value: 'invoices', icon: 'i-lucide-file-text' }
            ]"
            class="mb-6"
          />

          <!-- Overview Tab -->
          <div v-if="activeTab === 'overview'" class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Project Info -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Project Information</h3>
              </template>

              <dl class="space-y-4">
                <div class="flex justify-between">
                  <dt class="text-gray-500">Client</dt>
                  <dd class="font-medium">{{ project.clientName }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Project Manager</dt>
                  <dd class="font-medium">{{ project.projectManagerName || '—' }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Start Date</dt>
                  <dd class="font-medium">{{ formatDate(project.startDate) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">End Date</dt>
                  <dd class="font-medium">{{ formatDate(project.endDate) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Billing Type</dt>
                  <dd class="font-medium capitalize">{{ project.clientBillingType }}</dd>
                </div>
                <div v-if="project.description" class="pt-4 border-t">
                  <dt class="text-gray-500 mb-2">Description</dt>
                  <dd class="text-sm">{{ project.description }}</dd>
                </div>
              </dl>
            </UCard>

            <!-- Cost Breakdown -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Cost Breakdown</h3>
              </template>

              <dl class="space-y-4">
                <div class="flex justify-between">
                  <dt class="text-gray-500">Labor Cost</dt>
                  <dd class="font-medium">{{ formatCurrency(project.laborCost) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Expenses</dt>
                  <dd class="font-medium">{{ formatCurrency(project.expenseCost) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Media Spend</dt>
                  <dd class="font-medium">{{ formatCurrency(project.mediaCost) }}</dd>
                </div>
                <div class="flex justify-between pt-4 border-t font-semibold">
                  <dt>Total Cost</dt>
                  <dd>{{ formatCurrency(project.totalCost) }}</dd>
                </div>
              </dl>
            </UCard>

            <!-- Tasks Summary -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Tasks</h3>
              </template>

              <div class="flex items-center gap-6">
                <div class="text-center">
                  <p class="text-3xl font-bold">{{ taskStats.total }}</p>
                  <p class="text-sm text-gray-500">Total</p>
                </div>
                <div class="text-center">
                  <p class="text-3xl font-bold text-emerald-500">{{ taskStats.completed }}</p>
                  <p class="text-sm text-gray-500">Completed</p>
                </div>
                <div class="text-center">
                  <p class="text-3xl font-bold text-amber-500">{{ taskStats.inProgress }}</p>
                  <p class="text-sm text-gray-500">In Progress</p>
                </div>
              </div>

              <UProgress
                v-if="taskStats.total > 0"
                :value="(taskStats.completed / taskStats.total) * 100"
                color="success"
                size="sm"
                class="mt-4"
              />
            </UCard>

            <!-- Recent Invoices -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Recent Invoices</h3>
                  <UButton
                    label="View All"
                    variant="ghost"
                    size="xs"
                    to="/agency/billing"
                  />
                </div>
              </template>

              <div v-if="invoices.length === 0" class="text-center text-gray-500 py-4">
                No invoices yet
              </div>
              <div v-else class="space-y-3">
                <div v-for="inv in invoices" :key="inv.id" class="flex items-center justify-between">
                  <div>
                    <p class="font-medium">{{ inv.invoiceNumber }}</p>
                    <p class="text-xs text-gray-500">{{ formatDate(inv.issueDate) }}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-medium">{{ formatCurrency(inv.totalAmount) }}</p>
                    <UBadge :color="getInvoiceStatusColor(inv.status)" size="xs" variant="subtle">
                      {{ inv.status }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Tasks Tab -->
          <div v-if="activeTab === 'tasks'">
            <div v-if="loadingTasks" class="flex items-center justify-center py-12">
              <XfLoader />
            </div>

            <div v-else-if="Object.keys(projectTasksByBoard).length === 0" class="text-center py-12">
              <UIcon name="i-lucide-check-square" class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-neutral-600" />
              <h3 class="font-medium">No tasks assigned to this project</h3>
              <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">Tasks linked to this project will appear here</p>
            </div>

            <div v-else class="space-y-6">
              <UCard v-for="(boardGroup, boardId) in projectTasksByBoard" :key="boardId">
                <template #header>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-layout-grid" class="w-4 h-4 text-gray-500" />
                      <h3 class="font-semibold">{{ boardGroup.boardName }}</h3>
                      <UBadge size="xs" variant="subtle" color="neutral">{{ boardGroup.tasks.length }}</UBadge>
                    </div>
                    <UButton
                      size="xs"
                      variant="ghost"
                      icon="i-lucide-external-link"
                      :to="`/agency/boards/${boardGroup.boardSlug}`"
                      label="Open Board"
                    />
                  </div>
                </template>

                <div class="divide-y divide-gray-100 dark:divide-neutral-800">
                  <div
                    v-for="task in boardGroup.tasks"
                    :key="task.id"
                    class="flex items-center gap-3 py-2.5 px-1 hover:bg-gray-50 dark:hover:bg-neutral-800 rounded cursor-pointer"
                    @click="navigateTo(`/agency/boards/${boardGroup.boardSlug}?task=${task.id}`)"
                  >
                    <div class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: task.statusColor }" />
                    <p class="text-sm flex-1 truncate">{{ task.title }}</p>
                    <UBadge size="xs" :color="task.statusCategory === 'done' ? 'success' : task.statusCategory === 'active' ? 'info' : 'neutral'" variant="subtle">
                      {{ task.statusName }}
                    </UBadge>
                    <UAvatar v-if="task.assigneeName" :alt="task.assigneeName" :src="task.assigneeAvatar" size="2xs" />
                    <span v-if="task.subtaskCount > 0" class="text-xs text-gray-400">
                      {{ task.completedSubtaskCount }}/{{ task.subtaskCount }}
                    </span>
                    <span v-if="task.dueDate" class="text-xs text-gray-500">{{ formatDate(task.dueDate) }}</span>
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- Time Entries Tab -->
          <UCard v-if="activeTab === 'time'">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Recent Time Entries</h3>
                <UButton
                  label="Log Time"
                  icon="i-lucide-plus"
                  size="sm"
                  to="/agency/time"
                />
              </div>
            </template>

            <UTable :data="timeEntries" :columns="timeColumns">
              <template #date-cell="{ row }">
                {{ formatDate((row.original as any).date) }}
              </template>
              <template #hours-cell="{ row }">
                <span class="font-medium">{{ ((row.original as any).hours || 0).toFixed(1) }}h</span>
                <UBadge v-if="(row.original as any).billable" size="xs" color="success" variant="subtle" class="ml-2">
                  Billable
                </UBadge>
              </template>
            </UTable>

            <div v-if="timeEntries.length === 0" class="text-center text-gray-500 py-8">
              No time entries yet
            </div>
          </UCard>

          <!-- Expenses Tab -->
          <UCard v-if="activeTab === 'expenses'">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Recent Expenses</h3>
                <UButton
                  label="Add Expense"
                  icon="i-lucide-plus"
                  size="sm"
                  to="/agency/expenses"
                />
              </div>
            </template>

            <UTable :data="expenses" :columns="expenseColumns">
              <template #date-cell="{ row }">
                {{ formatDate((row.original as any).date) }}
              </template>
              <template #amount-cell="{ row }">
                <span class="font-medium">{{ formatCurrency((row.original as any).amount) }}</span>
              </template>
            </UTable>

            <div v-if="expenses.length === 0" class="text-center text-gray-500 py-8">
              No expenses yet
            </div>
          </UCard>

          <!-- Invoices Tab -->
          <UCard v-if="activeTab === 'invoices'">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Invoices</h3>
                <UButton
                  label="Create Invoice"
                  icon="i-lucide-plus"
                  size="sm"
                  to="/agency/billing"
                />
              </div>
            </template>

            <div v-if="invoices.length === 0" class="text-center text-gray-500 py-8">
              No invoices for this project yet
            </div>
            <div v-else class="space-y-4">
              <div v-for="inv in invoices" :key="inv.id" class="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p class="font-medium">{{ inv.invoiceNumber }}</p>
                  <p class="text-sm text-gray-500">
                    Issued: {{ formatDate(inv.issueDate) }}
                    <span v-if="inv.dueDate"> | Due: {{ formatDate(inv.dueDate) }}</span>
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-xl font-bold">{{ formatCurrency(inv.totalAmount) }}</p>
                  <UBadge :color="getInvoiceStatusColor(inv.status)" variant="subtle">
                    {{ inv.status }}
                  </UBadge>
                </div>
              </div>
            </div>
          </UCard>
        </template>
      </div>
    </UDashboardPanel>

    <!-- Edit Modal -->
    <UModal v-model:open="showEditModal">
      <template #header>
        <h3 class="font-semibold">Edit Project</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Project Name" required>
            <UInput v-model="editForm.name" placeholder="Project name" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="editForm.description" placeholder="Project description" :rows="3" />
          </UFormField>

          <UFormField label="Status">
            <USelectMenu
              v-model="editForm.status"
              :items="[
                { label: 'Draft', value: 'draft' },
                { label: 'Active', value: 'active' },
                { label: 'On Hold', value: 'on_hold' },
                { label: 'Completed', value: 'completed' },
                { label: 'Cancelled', value: 'cancelled' }
              ]"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Budget Amount">
            <UInput v-model.number="editForm.budgetAmount" type="number" min="0" step="100" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Start Date">
              <UInput v-model="editForm.startDate" type="date" />
            </UFormField>
            <UFormField label="End Date">
              <UInput v-model="editForm.endDate" type="date" />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showEditModal = false" />
          <UButton
            color="primary"
            label="Save Changes"
            :loading="saving"
            @click="saveProject"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
