<script setup lang="ts">
definePageMeta({
  title: 'Workflow Settings',
  middleware: ['auth']
})

const toast = useToast()

// Active tab
const activeTab = ref<'departments' | 'statuses' | 'labels'>('departments')

// ==================== DEPARTMENTS ====================

const { data: departmentsData, pending: loadingDepartments, refresh: refreshDepartments } = await useFetch('/api/agency/departments')
const departments = computed(() => (departmentsData.value as any[]) || [])

const showDepartmentModal = ref(false)
const editingDepartment = ref<any>(null)
const departmentForm = ref({
  name: '',
  color: '#3B82F6',
  description: ''
})

const openDepartmentModal = (dept?: any) => {
  if (dept) {
    editingDepartment.value = dept
    departmentForm.value = {
      name: dept.name,
      color: dept.color || '#3B82F6',
      description: dept.description || ''
    }
  } else {
    editingDepartment.value = null
    departmentForm.value = { name: '', color: '#3B82F6', description: '' }
  }
  showDepartmentModal.value = true
}

const savingDepartment = ref(false)
const saveDepartment = async () => {
  if (!departmentForm.value.name) {
    toast.add({ title: 'Please enter a department name', color: 'error' })
    return
  }

  savingDepartment.value = true
  try {
    if (editingDepartment.value) {
      await $fetch(`/api/agency/departments/${editingDepartment.value.id}`, {
        method: 'PUT',
        body: departmentForm.value
      })
      toast.add({ title: 'Department updated', color: 'success' })
    } else {
      await $fetch('/api/agency/departments', {
        method: 'POST',
        body: departmentForm.value
      })
      toast.add({ title: 'Department created', color: 'success' })
    }
    showDepartmentModal.value = false
    refreshDepartments()
  } catch (err: any) {
    toast.add({ title: 'Failed to save department', description: err.data?.message, color: 'error' })
  } finally {
    savingDepartment.value = false
  }
}

const deleteDepartment = async (id: string) => {
  if (!confirm('Are you sure you want to delete this department? All tasks in this department will need to be reassigned.')) return

  try {
    await $fetch(`/api/agency/departments/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Department deleted', color: 'success' })
    refreshDepartments()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete department', description: err.data?.message, color: 'error' })
  }
}

// ==================== STATUSES ====================

const selectedDepartmentId = ref<string | null>(null)
const { data: statusesData, pending: loadingStatuses, refresh: refreshStatuses } = await useFetch('/api/agency/statuses', {
  query: { departmentId: selectedDepartmentId }
})
const statuses = computed(() => (statusesData.value as any[]) || [])

// Watch departments and select first one
watch(departments, (depts) => {
  if (depts.length > 0 && !selectedDepartmentId.value) {
    selectedDepartmentId.value = depts[0].id
  }
}, { immediate: true })

const showStatusModal = ref(false)
const editingStatus = ref<any>(null)
const statusForm = ref({
  name: '',
  color: '#3B82F6',
  category: 'todo' as string,
  description: ''
})

const statusCategories = [
  { label: 'To Do', value: 'todo' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Review', value: 'review' },
  { label: 'Done', value: 'done' }
]

const openStatusModal = (status?: any) => {
  if (status) {
    editingStatus.value = status
    statusForm.value = {
      name: status.name,
      color: status.color || '#3B82F6',
      category: status.category || 'todo',
      description: status.description || ''
    }
  } else {
    editingStatus.value = null
    statusForm.value = { name: '', color: '#3B82F6', category: 'todo', description: '' }
  }
  showStatusModal.value = true
}

const savingStatus = ref(false)
const saveStatus = async () => {
  if (!statusForm.value.name || !selectedDepartmentId.value) {
    toast.add({ title: 'Please enter a status name', color: 'error' })
    return
  }

  savingStatus.value = true
  try {
    if (editingStatus.value) {
      await $fetch(`/api/agency/statuses/${editingStatus.value.id}`, {
        method: 'PUT',
        body: statusForm.value
      })
      toast.add({ title: 'Status updated', color: 'success' })
    } else {
      await $fetch('/api/agency/statuses', {
        method: 'POST',
        body: {
          ...statusForm.value,
          departmentId: selectedDepartmentId.value
        }
      })
      toast.add({ title: 'Status created', color: 'success' })
    }
    showStatusModal.value = false
    refreshStatuses()
  } catch (err: any) {
    toast.add({ title: 'Failed to save status', description: err.data?.message, color: 'error' })
  } finally {
    savingStatus.value = false
  }
}

const deleteStatus = async (id: string) => {
  if (!confirm('Are you sure you want to delete this status? Tasks with this status will need to be reassigned.')) return

  try {
    await $fetch(`/api/agency/statuses/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Status deleted', color: 'success' })
    refreshStatuses()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete status', description: err.data?.message, color: 'error' })
  }
}

// Reorder statuses
const moveStatus = async (status: any, direction: 'up' | 'down') => {
  const index = statuses.value.findIndex((s: any) => s.id === status.id)
  const newIndex = direction === 'up' ? index - 1 : index + 1

  if (newIndex < 0 || newIndex >= statuses.value.length) return

  const newOrder = statuses.value.map((s: any, i: number) => {
    if (i === index) return { id: statuses.value[newIndex].id, sortOrder: index }
    if (i === newIndex) return { id: status.id, sortOrder: newIndex }
    return { id: s.id, sortOrder: i }
  })

  try {
    await $fetch('/api/agency/statuses/reorder', {
      method: 'PATCH',
      body: { statuses: newOrder }
    })
    refreshStatuses()
  } catch (err: any) {
    toast.add({ title: 'Failed to reorder statuses', color: 'error' })
  }
}

// ==================== LABELS ====================

const { data: labelsData, pending: loadingLabels, refresh: refreshLabels } = await useFetch('/api/agency/labels')
const labels = computed(() => (labelsData.value as any[]) || [])

const showLabelModal = ref(false)
const editingLabel = ref<any>(null)
const labelForm = ref({
  name: '',
  color: '#3B82F6',
  description: ''
})

const openLabelModal = (label?: any) => {
  if (label) {
    editingLabel.value = label
    labelForm.value = {
      name: label.name,
      color: label.color || '#3B82F6',
      description: label.description || ''
    }
  } else {
    editingLabel.value = null
    labelForm.value = { name: '', color: '#3B82F6', description: '' }
  }
  showLabelModal.value = true
}

const savingLabel = ref(false)
const saveLabel = async () => {
  if (!labelForm.value.name) {
    toast.add({ title: 'Please enter a label name', color: 'error' })
    return
  }

  savingLabel.value = true
  try {
    if (editingLabel.value) {
      await $fetch(`/api/agency/labels/${editingLabel.value.id}`, {
        method: 'PUT',
        body: labelForm.value
      })
      toast.add({ title: 'Label updated', color: 'success' })
    } else {
      await $fetch('/api/agency/labels', {
        method: 'POST',
        body: labelForm.value
      })
      toast.add({ title: 'Label created', color: 'success' })
    }
    showLabelModal.value = false
    refreshLabels()
  } catch (err: any) {
    toast.add({ title: 'Failed to save label', description: err.data?.message, color: 'error' })
  } finally {
    savingLabel.value = false
  }
}

const deleteLabel = async (id: string) => {
  if (!confirm('Are you sure you want to delete this label?')) return

  try {
    await $fetch(`/api/agency/labels/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Label deleted', color: 'success' })
    refreshLabels()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete label', description: err.data?.message, color: 'error' })
  }
}

// Preset colors
const presetColors = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E', '#6B7280', '#374151', '#1F2937'
]
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Workflow Settings" />

      <UDashboardPanelContent>
        <!-- Tab Navigation -->
        <div class="flex items-center gap-4 mb-6 border-b border-gray-200 dark:border-gray-700">
          <button
            class="pb-3 px-1 text-sm font-medium transition-colors relative"
            :class="activeTab === 'departments' ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'departments'"
          >
            Departments
            <span
              v-if="activeTab === 'departments'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
            />
          </button>
          <button
            class="pb-3 px-1 text-sm font-medium transition-colors relative"
            :class="activeTab === 'statuses' ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'statuses'"
          >
            Statuses
            <span
              v-if="activeTab === 'statuses'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
            />
          </button>
          <button
            class="pb-3 px-1 text-sm font-medium transition-colors relative"
            :class="activeTab === 'labels' ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'labels'"
          >
            Labels
            <span
              v-if="activeTab === 'labels'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
            />
          </button>
        </div>

        <!-- Departments Tab -->
        <div v-if="activeTab === 'departments'">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-lg font-semibold">Departments</h2>
              <p class="text-sm text-gray-500">Organize your workflow into departments</p>
            </div>
            <UButton
              color="primary"
              icon="i-lucide-plus"
              label="Add Department"
              @click="openDepartmentModal()"
            />
          </div>

          <div v-if="loadingDepartments" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <UCard
              v-for="dept in departments"
              :key="dept.id"
              class="hover:shadow-md transition-shadow"
            >
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <div
                    class="w-4 h-4 rounded-full"
                    :style="{ backgroundColor: dept.color }"
                  />
                  <div>
                    <h3 class="font-semibold">{{ dept.name }}</h3>
                    <p v-if="dept.description" class="text-sm text-gray-500 mt-1">
                      {{ dept.description }}
                    </p>
                  </div>
                </div>
                <UDropdownMenu
                  :items="[[
                    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openDepartmentModal(dept) }
                  ], [
                    { label: 'Delete', icon: 'i-lucide-trash', color: 'error', onSelect: () => deleteDepartment(dept.id) }
                  ]]"
                >
                  <UButton variant="ghost" size="sm" icon="i-lucide-more-vertical" />
                </UDropdownMenu>
              </div>

              <div class="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <p class="text-xs text-gray-400">Statuses</p>
                  <p class="font-semibold">{{ dept.statusCount || 0 }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Tasks</p>
                  <p class="font-semibold">{{ dept.taskCount || 0 }}</p>
                </div>
              </div>
            </UCard>

            <div v-if="departments.length === 0" class="col-span-full text-center py-12 text-gray-500">
              <UIcon name="i-lucide-layout-grid" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No departments yet. Create one to get started!</p>
            </div>
          </div>
        </div>

        <!-- Statuses Tab -->
        <div v-if="activeTab === 'statuses'">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-4">
              <div>
                <h2 class="text-lg font-semibold">Statuses</h2>
                <p class="text-sm text-gray-500">Configure workflow statuses for each department</p>
              </div>
              <USelectMenu
                v-if="departments.length > 0"
                v-model="selectedDepartmentId"
                :items="departments.map((d: any) => ({ label: d.name, value: d.id }))"
                value-key="value"
                class="w-48"
              />
            </div>
            <UButton
              color="primary"
              icon="i-lucide-plus"
              label="Add Status"
              :disabled="!selectedDepartmentId"
              @click="openStatusModal()"
            />
          </div>

          <div v-if="loadingStatuses" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <div v-else-if="!selectedDepartmentId" class="text-center py-12 text-gray-500">
            <UIcon name="i-lucide-list" class="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Select a department to manage its statuses</p>
          </div>

          <div v-else class="space-y-2">
            <UCard
              v-for="(status, index) in statuses"
              :key="status.id"
              class="hover:shadow-md transition-shadow"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="flex flex-col gap-0.5">
                    <UButton
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-chevron-up"
                      :disabled="index === 0"
                      @click="moveStatus(status, 'up')"
                    />
                    <UButton
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-chevron-down"
                      :disabled="index === statuses.length - 1"
                      @click="moveStatus(status, 'down')"
                    />
                  </div>

                  <div
                    class="w-4 h-4 rounded-full"
                    :style="{ backgroundColor: status.color }"
                  />

                  <div>
                    <h3 class="font-semibold">{{ status.name }}</h3>
                    <div class="flex items-center gap-2 mt-1">
                      <UBadge variant="subtle" size="xs">
                        {{ status.category?.replace('_', ' ') || 'todo' }}
                      </UBadge>
                      <span v-if="status.description" class="text-xs text-gray-500">
                        {{ status.description }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-4">
                  <div class="text-right">
                    <p class="text-xs text-gray-400">Tasks</p>
                    <p class="font-semibold">{{ status.taskCount || 0 }}</p>
                  </div>

                  <UDropdownMenu
                    :items="[[
                      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openStatusModal(status) }
                    ], [
                      { label: 'Delete', icon: 'i-lucide-trash', color: 'error', onSelect: () => deleteStatus(status.id) }
                    ]]"
                  >
                    <UButton variant="ghost" size="sm" icon="i-lucide-more-vertical" />
                  </UDropdownMenu>
                </div>
              </div>
            </UCard>

            <div v-if="statuses.length === 0" class="text-center py-12 text-gray-500">
              <UIcon name="i-lucide-list" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No statuses for this department. Add one to get started!</p>
            </div>
          </div>
        </div>

        <!-- Labels Tab -->
        <div v-if="activeTab === 'labels'">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-lg font-semibold">Labels</h2>
              <p class="text-sm text-gray-500">Create labels to categorize and filter tasks</p>
            </div>
            <UButton
              color="primary"
              icon="i-lucide-plus"
              label="Add Label"
              @click="openLabelModal()"
            />
          </div>

          <div v-if="loadingLabels" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <div v-else class="flex flex-wrap gap-3">
            <div
              v-for="label in labels"
              :key="label.id"
              class="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
            >
              <div
                class="w-3 h-3 rounded-full"
                :style="{ backgroundColor: label.color }"
              />
              <span class="font-medium">{{ label.name }}</span>
              <UDropdownMenu
                :items="[[
                  { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openLabelModal(label) }
                ], [
                  { label: 'Delete', icon: 'i-lucide-trash', color: 'error', onSelect: () => deleteLabel(label.id) }
                ]]"
              >
                <UButton variant="ghost" size="xs" icon="i-lucide-more-vertical" />
              </UDropdownMenu>
            </div>

            <div v-if="labels.length === 0" class="w-full text-center py-12 text-gray-500">
              <UIcon name="i-lucide-tags" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No labels yet. Create one to get started!</p>
            </div>
          </div>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>

    <!-- Department Modal -->
    <UModal v-model:open="showDepartmentModal">
      <template #header>
        <h3 class="font-semibold">{{ editingDepartment ? 'Edit Department' : 'Add Department' }}</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="departmentForm.name" placeholder="e.g., Design, Development" />
          </UFormField>

          <UFormField label="Color">
            <div class="flex items-center gap-2">
              <input
                v-model="departmentForm.color"
                type="color"
                class="w-10 h-10 rounded cursor-pointer"
              />
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="color in presetColors"
                  :key="color"
                  class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  :class="departmentForm.color === color ? 'border-gray-900 dark:border-white' : 'border-transparent'"
                  :style="{ backgroundColor: color }"
                  @click="departmentForm.color = color"
                />
              </div>
            </div>
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="departmentForm.description" :rows="2" placeholder="Optional description" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showDepartmentModal = false" />
          <UButton
            color="primary"
            :label="editingDepartment ? 'Update' : 'Create'"
            :loading="savingDepartment"
            @click="saveDepartment"
          />
        </div>
      </template>
    </UModal>

    <!-- Status Modal -->
    <UModal v-model:open="showStatusModal">
      <template #header>
        <h3 class="font-semibold">{{ editingStatus ? 'Edit Status' : 'Add Status' }}</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="statusForm.name" placeholder="e.g., To Do, In Progress" />
          </UFormField>

          <UFormField label="Category" required>
            <USelectMenu
              v-model="statusForm.category"
              :items="statusCategories"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Color">
            <div class="flex items-center gap-2">
              <input
                v-model="statusForm.color"
                type="color"
                class="w-10 h-10 rounded cursor-pointer"
              />
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="color in presetColors"
                  :key="color"
                  class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  :class="statusForm.color === color ? 'border-gray-900 dark:border-white' : 'border-transparent'"
                  :style="{ backgroundColor: color }"
                  @click="statusForm.color = color"
                />
              </div>
            </div>
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="statusForm.description" :rows="2" placeholder="Optional description" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showStatusModal = false" />
          <UButton
            color="primary"
            :label="editingStatus ? 'Update' : 'Create'"
            :loading="savingStatus"
            @click="saveStatus"
          />
        </div>
      </template>
    </UModal>

    <!-- Label Modal -->
    <UModal v-model:open="showLabelModal">
      <template #header>
        <h3 class="font-semibold">{{ editingLabel ? 'Edit Label' : 'Add Label' }}</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="labelForm.name" placeholder="e.g., Bug, Feature, Urgent" />
          </UFormField>

          <UFormField label="Color">
            <div class="flex items-center gap-2">
              <input
                v-model="labelForm.color"
                type="color"
                class="w-10 h-10 rounded cursor-pointer"
              />
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="color in presetColors"
                  :key="color"
                  class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  :class="labelForm.color === color ? 'border-gray-900 dark:border-white' : 'border-transparent'"
                  :style="{ backgroundColor: color }"
                  @click="labelForm.color = color"
                />
              </div>
            </div>
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="labelForm.description" :rows="2" placeholder="Optional description" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showLabelModal = false" />
          <UButton
            color="primary"
            :label="editingLabel ? 'Update' : 'Create'"
            :loading="savingLabel"
            @click="saveLabel"
          />
        </div>
      </template>
    </UModal>
  </UDashboardPage>
</template>
