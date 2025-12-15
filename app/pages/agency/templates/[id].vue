<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <UButton
          icon="i-heroicons-arrow-left"
          variant="ghost"
          to="/agency/templates"
        />
        <div v-if="template">
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold">{{ template.template.name }}</h1>
            <UBadge :color="template.template.isActive ? 'success' : 'neutral'" size="sm">
              {{ template.template.isActive ? 'Active' : 'Inactive' }}
            </UBadge>
          </div>
          <p class="text-gray-500">{{ template.template.category }} template</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="outline"
          color="error"
          icon="i-heroicons-trash"
          @click="showDeleteModal = true"
        >
          Delete
        </UButton>
        <UButton
          variant="outline"
          icon="i-heroicons-pencil"
          @click="openEditModal"
        >
          Edit
        </UButton>
        <UButton
          color="primary"
          icon="i-heroicons-play"
          @click="showUseModal = true"
        >
          Use Template
        </UButton>
      </div>
    </div>

    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
    </div>

    <div v-else-if="template" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Content -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Description -->
        <UCard v-if="template.template.description">
          <template #header>
            <h3 class="font-semibold">Description</h3>
          </template>
          <p class="text-gray-600 whitespace-pre-wrap">{{ template.template.description }}</p>
        </UCard>

        <!-- Phases -->
        <UCard v-if="template.phases.length">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Phases</h3>
              <UBadge variant="subtle">{{ template.phases.length }} phases</UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <div
              v-for="(phase, index) in template.phases"
              :key="phase.id"
              class="border rounded-lg p-4"
            >
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold">
                    {{ index + 1 }}
                  </div>
                  <div>
                    <h4 class="font-medium">{{ phase.name }}</h4>
                    <p v-if="phase.description" class="text-sm text-gray-500">{{ phase.description }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2 text-sm text-gray-500">
                  <span v-if="phase.durationDays">{{ phase.durationDays }} days</span>
                  <span v-if="phase.budgetPercentage">• {{ phase.budgetPercentage }}% budget</span>
                </div>
              </div>

              <!-- Phase tasks -->
              <div v-if="getTasksForPhase(phase.id).length" class="mt-3 pl-11">
                <p class="text-xs text-gray-400 mb-2">Tasks:</p>
                <div class="space-y-1">
                  <div
                    v-for="task in getTasksForPhase(phase.id)"
                    :key="task.id"
                    class="flex items-center justify-between text-sm py-1"
                  >
                    <span>{{ task.title }}</span>
                    <span v-if="task.estimatedHours" class="text-gray-400">{{ task.estimatedHours }}h</span>
                  </div>
                </div>
              </div>

              <div v-if="phase.requiresClientApproval" class="mt-2 pl-11">
                <UBadge color="warning" size="xs">Requires client approval</UBadge>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Tasks (Unphased) -->
        <UCard v-if="getTasksForPhase(null).length">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Tasks</h3>
              <UBadge variant="subtle">{{ template.tasks.length }} tasks</UBadge>
            </div>
          </template>

          <div class="space-y-2">
            <div
              v-for="task in getTasksForPhase(null)"
              :key="task.id"
              class="flex items-center justify-between p-3 border rounded-lg"
            >
              <div class="flex items-center gap-3">
                <UIcon
                  :name="getTaskTypeIcon(task.taskType)"
                  class="w-5 h-5 text-gray-400"
                />
                <div>
                  <p class="font-medium">{{ task.title }}</p>
                  <p v-if="task.description" class="text-sm text-gray-500 truncate max-w-md">
                    {{ task.description }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <UBadge v-if="task.priority" :color="getPriorityColor(task.priority)" size="xs">
                  {{ task.priority }}
                </UBadge>
                <span v-if="task.estimatedHours" class="text-sm text-gray-500">
                  {{ task.estimatedHours }}h
                </span>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Roles -->
        <UCard v-if="template.roles.length">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Team Roles</h3>
              <UBadge variant="subtle">{{ template.roles.length }} roles</UBadge>
            </div>
          </template>

          <div class="space-y-3">
            <div
              v-for="role in template.roles"
              :key="role.id"
              class="flex items-center justify-between p-3 border rounded-lg"
            >
              <div>
                <p class="font-medium">{{ role.roleName }}</p>
                <p v-if="role.description" class="text-sm text-gray-500">{{ role.description }}</p>
                <div v-if="role.requiredSkills?.length" class="flex gap-1 mt-1">
                  <UBadge
                    v-for="skill in role.requiredSkills"
                    :key="skill"
                    variant="subtle"
                    size="xs"
                  >
                    {{ skill }}
                  </UBadge>
                </div>
              </div>
              <div class="text-right text-sm">
                <p v-if="role.estimatedHours">{{ role.estimatedHours }}h estimated</p>
                <p v-if="role.hourlyRate" class="text-gray-500">{{ formatCurrency(role.hourlyRate) }}/hr</p>
                <p v-if="role.departmentName" class="text-gray-400">{{ role.departmentName }}</p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Documents -->
        <UCard v-if="template.documents.length">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Documents</h3>
              <UBadge variant="subtle">{{ template.documents.length }} documents</UBadge>
            </div>
          </template>

          <div class="space-y-2">
            <div
              v-for="doc in template.documents"
              :key="doc.id"
              class="flex items-center justify-between p-3 border rounded-lg"
            >
              <div class="flex items-center gap-3">
                <UIcon :name="getDocumentIcon(doc.documentType)" class="w-5 h-5 text-gray-400" />
                <div>
                  <p class="font-medium">{{ doc.name }}</p>
                  <p v-if="doc.description" class="text-sm text-gray-500">{{ doc.description }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="doc.includeOnCreation" color="success" size="xs">
                  Auto-include
                </UBadge>
                <UButton
                  v-if="doc.fileUrl"
                  size="xs"
                  variant="ghost"
                  icon="i-heroicons-arrow-down-tray"
                  :href="doc.fileUrl"
                  target="_blank"
                />
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Quick Info -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Template Info</h3>
          </template>

          <div class="space-y-4">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Category</span>
              <span class="font-medium">{{ template.template.category }}</span>
            </div>

            <div v-if="template.template.tags?.length" class="flex justify-between text-sm">
              <span class="text-gray-500">Tags</span>
              <div class="flex flex-wrap gap-1 justify-end">
                <UBadge
                  v-for="tag in template.template.tags"
                  :key="tag"
                  variant="subtle"
                  size="xs"
                >
                  {{ tag }}
                </UBadge>
              </div>
            </div>

            <div v-if="template.template.departmentName" class="flex justify-between text-sm">
              <span class="text-gray-500">Department</span>
              <span>{{ template.template.departmentName }}</span>
            </div>

            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Visibility</span>
              <UBadge :color="template.template.isPublic ? 'success' : 'neutral'" size="xs">
                {{ template.template.isPublic ? 'Public' : 'Private' }}
              </UBadge>
            </div>
          </div>
        </UCard>

        <!-- Estimates -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Estimates</h3>
          </template>

          <div class="space-y-4">
            <div v-if="template.template.estimatedDurationDays" class="flex justify-between text-sm">
              <span class="text-gray-500">Duration</span>
              <span class="font-medium">{{ template.template.estimatedDurationDays }} days</span>
            </div>

            <div v-if="template.template.estimatedHours" class="flex justify-between text-sm">
              <span class="text-gray-500">Estimated Hours</span>
              <span class="font-medium">{{ template.template.estimatedHours }}h</span>
            </div>

            <div v-if="template.template.defaultBudgetAmount" class="flex justify-between text-sm">
              <span class="text-gray-500">Default Budget</span>
              <span class="font-medium">{{ formatCurrency(template.template.defaultBudgetAmount) }}</span>
            </div>

            <div v-if="template.template.defaultBudgetType" class="flex justify-between text-sm">
              <span class="text-gray-500">Budget Type</span>
              <span>{{ formatBudgetType(template.template.defaultBudgetType) }}</span>
            </div>

            <div v-if="template.template.defaultHourlyRate" class="flex justify-between text-sm">
              <span class="text-gray-500">Hourly Rate</span>
              <span>{{ formatCurrency(template.template.defaultHourlyRate) }}/hr</span>
            </div>

            <div v-if="template.template.defaultBillingMethod" class="flex justify-between text-sm">
              <span class="text-gray-500">Billing Method</span>
              <span>{{ formatBillingMethod(template.template.defaultBillingMethod) }}</span>
            </div>
          </div>
        </UCard>

        <!-- Usage Stats -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Usage</h3>
          </template>

          <div class="space-y-4">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Times Used</span>
              <span class="font-medium">{{ template.template.timesUsed || 0 }}</span>
            </div>

            <div v-if="template.template.lastUsedAt" class="flex justify-between text-sm">
              <span class="text-gray-500">Last Used</span>
              <span>{{ formatDate(template.template.lastUsedAt) }}</span>
            </div>

            <div v-if="template.template.createdByName" class="flex justify-between text-sm">
              <span class="text-gray-500">Created By</span>
              <span>{{ template.template.createdByName }}</span>
            </div>

            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Created</span>
              <span>{{ formatDate(template.template.createdAt) }}</span>
            </div>
          </div>
        </UCard>

        <!-- Template Contents Summary -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Contents</h3>
          </template>

          <div class="space-y-2">
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span class="text-sm">Phases</span>
              <span class="font-medium">{{ template.phases.length }}</span>
            </div>
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span class="text-sm">Tasks</span>
              <span class="font-medium">{{ template.tasks.length }}</span>
            </div>
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span class="text-sm">Roles</span>
              <span class="font-medium">{{ template.roles.length }}</span>
            </div>
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span class="text-sm">Documents</span>
              <span class="font-medium">{{ template.documents.length }}</span>
            </div>
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span class="text-sm">Total Hours</span>
              <span class="font-medium">{{ totalEstimatedHours }}h</span>
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Use Template Modal -->
    <UModal v-model:open="showUseModal" class="max-w-lg">
      <template #header>
        <h3 class="font-semibold">Create Project from Template</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <UFormField label="Project Name" required>
            <UInput
              v-model="useForm.projectName"
              placeholder="Enter project name"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Client" required>
            <USelectMenu
              v-model="useForm.clientId"
              :items="clientOptions"
              value-key="value"
              placeholder="Select a client"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Start Date">
            <UInput
              v-model="useForm.startDate"
              type="date"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Budget Override">
            <UInput
              v-model.number="useForm.budgetOverride"
              type="number"
              min="0"
              step="100"
              placeholder="Leave empty to use template default"
              class="w-full"
            />
            <p class="text-xs text-gray-400 mt-1">
              Default: {{ formatCurrency(template?.template.defaultBudgetAmount || 0) }}
            </p>
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="showUseModal = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="creating"
            :disabled="!useForm.projectName || !useForm.clientId"
            @click="useTemplate"
          >
            Create Project
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Edit Template Modal -->
    <UModal v-model:open="showEditModal" class="max-w-2xl">
      <template #header>
        <h3 class="font-semibold">Edit Template</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Name" required class="col-span-2">
              <UInput
                v-model="editForm.name"
                placeholder="Template name"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Category">
              <UInput
                v-model="editForm.category"
                placeholder="e.g. Marketing, Design, Development"
                list="category-suggestions"
                class="w-full"
              />
              <datalist id="category-suggestions">
                <option value="Marketing" />
                <option value="Design" />
                <option value="Development" />
                <option value="Strategy" />
                <option value="Content" />
                <option value="Social Media" />
              </datalist>
            </UFormField>

            <UFormField label="Tags">
              <UInput
                v-model="editForm.tagsString"
                placeholder="Comma-separated tags"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField label="Description">
            <UTextarea
              v-model="editForm.description"
              placeholder="Template description..."
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Default Budget Type">
              <USelectMenu
                v-model="editForm.defaultBudgetType"
                :items="budgetTypeOptions"
                value-key="value"
                placeholder="Select budget type"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Default Budget Amount">
              <UInput
                v-model.number="editForm.defaultBudgetAmount"
                type="number"
                min="0"
                step="100"
                placeholder="0"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Estimated Duration (days)">
              <UInput
                v-model.number="editForm.estimatedDurationDays"
                type="number"
                min="1"
                placeholder="Days"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Estimated Hours">
              <UInput
                v-model.number="editForm.estimatedHours"
                type="number"
                min="0"
                step="0.5"
                placeholder="Hours"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Default Hourly Rate">
              <UInput
                v-model.number="editForm.defaultHourlyRate"
                type="number"
                min="0"
                step="5"
                placeholder="$/hr"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Default Billing Method">
              <USelectMenu
                v-model="editForm.defaultBillingMethod"
                :items="billingMethodOptions"
                value-key="value"
                placeholder="Select billing method"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="editForm.isActive"
                  type="checkbox"
                  class="rounded border-gray-300"
                />
                <span class="text-sm">Active</span>
              </label>
              <p class="text-xs text-gray-400 mt-1">Inactive templates won't appear in template list</p>
            </UFormField>

            <UFormField>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="editForm.isPublic"
                  type="checkbox"
                  class="rounded border-gray-300"
                />
                <span class="text-sm">Public</span>
              </label>
              <p class="text-xs text-gray-400 mt-1">Public templates are visible to all team members</p>
            </UFormField>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="showEditModal = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="saving"
            :disabled="!editForm.name"
            @click="saveTemplate"
          >
            Save Changes
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal" class="max-w-md">
      <template #header>
        <h3 class="font-semibold text-red-600">Delete Template</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <p>Are you sure you want to delete <strong>{{ template?.template.name }}</strong>?</p>
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <p class="text-sm text-red-700">
              This will permanently delete:
            </p>
            <ul class="text-sm text-red-600 mt-2 list-disc list-inside space-y-1">
              <li>{{ template?.phases.length || 0 }} phases</li>
              <li>{{ template?.tasks.length || 0 }} tasks</li>
              <li>{{ template?.roles.length || 0 }} roles</li>
              <li>{{ template?.documents.length || 0 }} documents</li>
            </ul>
            <p class="text-sm text-red-700 mt-2 font-medium">
              This action cannot be undone.
            </p>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="showDeleteModal = false">
            Cancel
          </UButton>
          <UButton
            color="error"
            :loading="deleting"
            @click="deleteTemplate"
          >
            Delete Template
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

interface Phase {
  id: string
  name: string
  description: string | null
  sortOrder: number
  durationDays: number | null
  budgetPercentage: number
  deliverables: string[] | null
  requiresClientApproval: boolean
}

interface Task {
  id: string
  phaseId: string | null
  parentTaskId: string | null
  title: string
  description: string | null
  sortOrder: number
  estimatedHours: number
  startDayOffset: number | null
  durationDays: number | null
  defaultRole: string | null
  defaultDepartmentId: string | null
  departmentName: string | null
  priority: string
  taskType: string
  dependsOnTaskIds: string[] | null
  checklist: any[] | null
  tags: string[] | null
  billable: boolean
}

interface Role {
  id: string
  roleName: string
  description: string | null
  estimatedHours: number
  hourlyRate: number
  requiredSkills: string[] | null
  departmentId: string | null
  departmentName: string | null
  defaultMemberId: string | null
  defaultMemberName: string | null
  allocationPercentage: number
}

interface Document {
  id: string
  name: string
  description: string | null
  documentType: string
  fileUrl: string | null
  includeOnCreation: boolean
}

interface TemplateData {
  template: {
    id: string
    name: string
    description: string | null
    category: string
    tags: string[] | null
    defaultBudgetType: string | null
    defaultBudgetAmount: number
    estimatedDurationDays: number | null
    estimatedHours: number
    defaultHourlyRate: number
    defaultBillingMethod: string | null
    isActive: boolean
    isPublic: boolean
    timesUsed: number
    lastUsedAt: string | null
    createdByName: string | null
    departmentName: string | null
    departmentId: string | null
    createdAt: string
    updatedAt: string
  }
  phases: Phase[]
  tasks: Task[]
  roles: Role[]
  documents: Document[]
}

// Fetch template data
const { data: template, pending } = await useFetch<TemplateData>(`/api/agency/templates/${route.params.id}`)

// Fetch clients
const { data: clientsData } = await useFetch<Array<{ id: string; name: string }>>('/api/agency/clients')

// Computed
const clientOptions = computed(() => {
  return (clientsData.value || []).map(c => ({
    label: c.name,
    value: c.id
  }))
})

const totalEstimatedHours = computed(() => {
  if (!template.value) return 0
  return template.value.tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0)
})

// Use template modal
const showUseModal = ref(false)
const creating = ref(false)
const useForm = ref({
  projectName: '',
  clientId: '',
  startDate: new Date().toISOString().split('T')[0],
  budgetOverride: null as number | null
})

// Edit template modal
const showEditModal = ref(false)
const saving = ref(false)
const editForm = ref({
  name: '',
  description: '',
  category: '',
  tagsString: '',
  defaultBudgetType: '',
  defaultBudgetAmount: 0,
  estimatedDurationDays: 0,
  estimatedHours: 0,
  defaultHourlyRate: 0,
  defaultBillingMethod: '',
  isActive: true,
  isPublic: false
})

// Delete modal
const showDeleteModal = ref(false)
const deleting = ref(false)

// Options for selects
const budgetTypeOptions = [
  { label: 'Fixed Price', value: 'fixed' },
  { label: 'Time & Materials', value: 'time_materials' },
  { label: 'Retainer', value: 'retainer' },
  { label: 'Milestone-based', value: 'milestone' }
]

const billingMethodOptions = [
  { label: 'Hourly', value: 'hourly' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Per Milestone', value: 'milestone' },
  { label: 'Monthly Retainer', value: 'retainer' }
]

// Methods
const getTasksForPhase = (phaseId: string | null): Task[] => {
  if (!template.value) return []
  return template.value.tasks.filter(t => t.phaseId === phaseId)
}

const openEditModal = () => {
  if (!template.value) return

  const t = template.value.template
  editForm.value = {
    name: t.name,
    description: t.description || '',
    category: t.category,
    tagsString: (t.tags || []).join(', '),
    defaultBudgetType: t.defaultBudgetType || '',
    defaultBudgetAmount: t.defaultBudgetAmount || 0,
    estimatedDurationDays: t.estimatedDurationDays || 0,
    estimatedHours: t.estimatedHours || 0,
    defaultHourlyRate: t.defaultHourlyRate || 0,
    defaultBillingMethod: t.defaultBillingMethod || '',
    isActive: t.isActive,
    isPublic: t.isPublic
  }
  showEditModal.value = true
}

const saveTemplate = async () => {
  if (!editForm.value.name) return

  saving.value = true
  try {
    const tags = editForm.value.tagsString
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    await $fetch(`/api/agency/templates/${route.params.id}`, {
      method: 'PUT',
      body: {
        name: editForm.value.name,
        description: editForm.value.description || null,
        category: editForm.value.category || 'General',
        tags: tags.length > 0 ? tags : null,
        defaultBudgetType: editForm.value.defaultBudgetType || null,
        defaultBudgetAmount: editForm.value.defaultBudgetAmount || null,
        estimatedDurationDays: editForm.value.estimatedDurationDays || null,
        estimatedHours: editForm.value.estimatedHours || null,
        defaultHourlyRate: editForm.value.defaultHourlyRate || null,
        defaultBillingMethod: editForm.value.defaultBillingMethod || null,
        isActive: editForm.value.isActive,
        isPublic: editForm.value.isPublic
      }
    })

    toast.add({
      title: 'Template updated',
      description: 'Template settings saved successfully',
      color: 'success'
    })

    showEditModal.value = false
    // Refresh template data
    await refreshNuxtData()
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to update template',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const deleteTemplate = async () => {
  deleting.value = true
  try {
    await $fetch(`/api/agency/templates/${route.params.id}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Template deleted',
      description: 'Template has been permanently deleted',
      color: 'success'
    })

    router.push('/agency/templates')
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to delete template',
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

const useTemplate = async () => {
  if (!useForm.value.projectName || !useForm.value.clientId) return

  creating.value = true
  try {
    const result = await $fetch<{ project: { id: string; name: string }; tasksCreated: number }>(`/api/agency/templates/${route.params.id}/use`, {
      method: 'POST',
      body: {
        projectName: useForm.value.projectName,
        clientId: useForm.value.clientId,
        startDate: useForm.value.startDate || undefined,
        budgetOverride: useForm.value.budgetOverride || undefined
      }
    })

    toast.add({
      title: 'Project created',
      description: `${result.project.name} created with ${result.tasksCreated} tasks`,
      color: 'success'
    })

    showUseModal.value = false
    router.push(`/agency/projects/${result.project.id}`)
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to create project',
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

// Formatting
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const formatBudgetType = (type: string): string => {
  const types: Record<string, string> = {
    fixed: 'Fixed Price',
    time_materials: 'Time & Materials',
    retainer: 'Retainer',
    milestone: 'Milestone-based'
  }
  return types[type] || type
}

const formatBillingMethod = (method: string): string => {
  const methods: Record<string, string> = {
    hourly: 'Hourly',
    fixed: 'Fixed',
    milestone: 'Per Milestone',
    retainer: 'Monthly Retainer'
  }
  return methods[method] || method
}

const getTaskTypeIcon = (type: string): string => {
  const icons: Record<string, string> = {
    task: 'i-heroicons-check-circle',
    milestone: 'i-heroicons-flag',
    epic: 'i-heroicons-rectangle-stack',
    story: 'i-heroicons-bookmark',
    bug: 'i-heroicons-bug-ant',
    feature: 'i-heroicons-light-bulb'
  }
  return icons[type] || 'i-heroicons-document'
}

const getPriorityColor = (priority: string): 'error' | 'warning' | 'info' | 'neutral' => {
  const colors: Record<string, 'error' | 'warning' | 'info' | 'neutral'> = {
    urgent: 'error',
    high: 'warning',
    medium: 'info',
    low: 'neutral'
  }
  return colors[priority] || 'neutral'
}

const getDocumentIcon = (type: string): string => {
  const icons: Record<string, string> = {
    contract: 'i-heroicons-document-text',
    brief: 'i-heroicons-clipboard-document',
    scope: 'i-heroicons-document-check',
    checklist: 'i-heroicons-clipboard-document-check',
    template: 'i-heroicons-document-duplicate',
    guide: 'i-heroicons-book-open'
  }
  return icons[type] || 'i-heroicons-document'
}
</script>
