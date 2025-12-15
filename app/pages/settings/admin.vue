<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold">Admin Settings</h2>
      <p class="text-gray-500 text-sm">Manage departments, task statuses, and tags for your agency.</p>
    </div>

    <!-- Tabs -->
    <UTabs v-model="activeTab" :items="tabs" />

    <!-- Departments Tab -->
    <div v-if="activeTab === 'departments'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-medium">Departments</h3>
        <UButton icon="i-heroicons-plus" size="sm" @click="openDepartmentModal()">
          Add Department
        </UButton>
      </div>

      <div v-if="departmentsPending" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="dept in departments"
          :key="dept.id"
          class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-4 h-4 rounded-full"
              :style="{ backgroundColor: dept.color }"
            />
            <div>
              <p class="font-medium">{{ dept.name }}</p>
              <p class="text-sm text-gray-500">{{ dept.memberCount }} members | {{ dept.activeTasks }} active tasks</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="!dept.isActive" color="neutral" size="xs">Inactive</UBadge>
            <UDropdown :items="getDepartmentActions(dept)">
              <UButton variant="ghost" icon="i-heroicons-ellipsis-vertical" size="xs" />
            </UDropdown>
          </div>
        </div>

        <p v-if="!departments?.length" class="text-center text-gray-500 py-8">
          No departments found. Create one to get started.
        </p>
      </div>
    </div>

    <!-- Statuses Tab -->
    <div v-if="activeTab === 'statuses'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-medium">Task Statuses</h3>
        <UButton icon="i-heroicons-plus" size="sm" @click="openStatusModal()">
          Add Status
        </UButton>
      </div>

      <div v-if="statusesPending" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <div v-else>
        <!-- Group by category -->
        <div v-for="category in statusCategories" :key="category.value" class="mb-6">
          <h4 class="text-sm font-medium text-gray-600 mb-2">{{ category.label }}</h4>
          <div class="space-y-2">
            <div
              v-for="status in getStatusesByCategory(category.value)"
              :key="status.id"
              class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-4 h-4 rounded"
                  :style="{ backgroundColor: status.color }"
                />
                <div>
                  <div class="flex items-center gap-2">
                    <p class="font-medium">{{ status.name }}</p>
                    <UBadge v-if="status.isDefault" color="primary" size="xs">Default</UBadge>
                    <UBadge v-if="status.isFinal" color="success" size="xs">Final</UBadge>
                  </div>
                  <p class="text-sm text-gray-500">
                    {{ status.departmentName || 'Global' }}
                  </p>
                </div>
              </div>
              <UDropdown :items="getStatusActions(status)">
                <UButton variant="ghost" icon="i-heroicons-ellipsis-vertical" size="xs" />
              </UDropdown>
            </div>
          </div>
        </div>

        <p v-if="!statuses?.length" class="text-center text-gray-500 py-8">
          No statuses found. Create one to get started.
        </p>
      </div>
    </div>

    <!-- Tags Tab -->
    <div v-if="activeTab === 'tags'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-medium">Global Tags</h3>
        <UButton icon="i-heroicons-plus" size="sm" @click="openTagModal()">
          Add Tag
        </UButton>
      </div>

      <div v-if="tagsPending" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <div
          v-for="tag in tags"
          :key="tag.id"
          class="inline-flex items-center gap-2 px-3 py-1.5 border rounded-full hover:bg-gray-50 group"
        >
          <div
            class="w-3 h-3 rounded-full"
            :style="{ backgroundColor: tag.color }"
          />
          <span class="text-sm font-medium">{{ tag.name }}</span>
          <span class="text-xs text-gray-400">({{ tag.usageCount }})</span>
          <UDropdown :items="getTagActions(tag)">
            <UButton
              variant="ghost"
              icon="i-heroicons-ellipsis-vertical"
              size="xs"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </UDropdown>
        </div>

        <p v-if="!tags?.length" class="text-center text-gray-500 py-8 w-full">
          No tags found. Create one to get started.
        </p>
      </div>
    </div>

    <!-- Expense Categories Tab -->
    <div v-if="activeTab === 'expense-categories'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-medium">Expense Categories</h3>
        <UButton icon="i-heroicons-plus" size="sm" @click="openExpenseCategoryModal()">
          Add Category
        </UButton>
      </div>

      <div v-if="expenseCategoriesPending" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="cat in expenseCategories"
          :key="cat.id"
          class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-mono font-medium text-gray-600">
              {{ cat.code }}
            </div>
            <div>
              <p class="font-medium">{{ cat.name }}</p>
              <div class="flex items-center gap-2 text-sm text-gray-500">
                <span>{{ cat.expenseCount }} expenses</span>
                <span v-if="cat.parentName">• Parent: {{ cat.parentName }}</span>
                <span v-if="cat.requiresApprovalAbove">• Approval above ${{ cat.requiresApprovalAbove }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="cat.isBillableDefault" color="primary" size="xs">Billable</UBadge>
            <UBadge v-if="cat.requiresReceipt" color="info" size="xs">Receipt Required</UBadge>
            <UBadge v-if="!cat.isActive" color="neutral" size="xs">Inactive</UBadge>
            <UDropdown :items="getExpenseCategoryActions(cat)">
              <UButton variant="ghost" icon="i-heroicons-ellipsis-vertical" size="xs" />
            </UDropdown>
          </div>
        </div>

        <p v-if="!expenseCategories?.length" class="text-center text-gray-500 py-8">
          No expense categories found. Create one to get started.
        </p>
      </div>
    </div>

    <!-- Department Modal -->
    <UModal v-model:open="showDepartmentModal" class="max-w-md">
      <template #header>
        <h3 class="font-semibold">{{ editingDepartment ? 'Edit' : 'Add' }} Department</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="departmentForm.name" placeholder="Department name" class="w-full" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="departmentForm.description" placeholder="Optional description" :rows="2" class="w-full" />
          </UFormField>

          <UFormField label="Color">
            <div class="flex gap-2">
              <input
                v-model="departmentForm.color"
                type="color"
                class="w-10 h-10 rounded cursor-pointer"
              />
              <UInput v-model="departmentForm.color" placeholder="#6B7280" class="flex-1" />
            </div>
          </UFormField>

          <UFormField v-if="editingDepartment">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="departmentForm.isActive"
                type="checkbox"
                class="rounded border-gray-300"
              />
              <span class="text-sm">Active</span>
            </label>
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="showDepartmentModal = false">Cancel</UButton>
          <UButton color="primary" :loading="savingDepartment" :disabled="!departmentForm.name" @click="saveDepartment">
            {{ editingDepartment ? 'Save' : 'Create' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Status Modal -->
    <UModal v-model:open="showStatusModal" class="max-w-md">
      <template #header>
        <h3 class="font-semibold">{{ editingStatus ? 'Edit' : 'Add' }} Status</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="statusForm.name" placeholder="Status name" class="w-full" />
          </UFormField>

          <UFormField label="Category" required>
            <USelectMenu
              v-model="statusForm.category"
              :items="statusCategories"
              value-key="value"
              placeholder="Select category"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Color">
            <div class="flex gap-2">
              <input
                v-model="statusForm.color"
                type="color"
                class="w-10 h-10 rounded cursor-pointer"
              />
              <UInput v-model="statusForm.color" placeholder="#6B7280" class="flex-1" />
            </div>
          </UFormField>

          <UFormField label="Department">
            <USelectMenu
              v-model="statusForm.departmentId"
              :items="departmentOptions"
              value-key="value"
              placeholder="Global (all departments)"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="statusForm.isDefault"
                  type="checkbox"
                  class="rounded border-gray-300"
                />
                <span class="text-sm">Default status</span>
              </label>
            </UFormField>

            <UFormField>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="statusForm.isFinal"
                  type="checkbox"
                  class="rounded border-gray-300"
                />
                <span class="text-sm">Final status</span>
              </label>
            </UFormField>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="showStatusModal = false">Cancel</UButton>
          <UButton color="primary" :loading="savingStatus" :disabled="!statusForm.name || !statusForm.category" @click="saveStatus">
            {{ editingStatus ? 'Save' : 'Create' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Tag Modal -->
    <UModal v-model:open="showTagModal" class="max-w-md">
      <template #header>
        <h3 class="font-semibold">{{ editingTag ? 'Edit' : 'Add' }} Tag</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="tagForm.name" placeholder="Tag name" class="w-full" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="tagForm.description" placeholder="Optional description" :rows="2" class="w-full" />
          </UFormField>

          <UFormField label="Color">
            <div class="flex gap-2">
              <input
                v-model="tagForm.color"
                type="color"
                class="w-10 h-10 rounded cursor-pointer"
              />
              <UInput v-model="tagForm.color" placeholder="#6B7280" class="flex-1" />
            </div>
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="showTagModal = false">Cancel</UButton>
          <UButton color="primary" :loading="savingTag" :disabled="!tagForm.name" @click="saveTag">
            {{ editingTag ? 'Save' : 'Create' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Expense Category Modal -->
    <UModal v-model:open="showExpenseCategoryModal" class="max-w-lg">
      <template #header>
        <h3 class="font-semibold">{{ editingExpenseCategory ? 'Edit' : 'Add' }} Expense Category</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Name" required>
              <UInput v-model="expenseCategoryForm.name" placeholder="Category name" class="w-full" />
            </UFormField>

            <UFormField label="Code">
              <UInput v-model="expenseCategoryForm.code" placeholder="AUTO" class="w-full font-mono uppercase" />
              <p class="text-xs text-gray-400 mt-1">Auto-generated if empty</p>
            </UFormField>
          </div>

          <UFormField label="Description">
            <UTextarea v-model="expenseCategoryForm.description" placeholder="Optional description" :rows="2" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Parent Category">
              <USelectMenu
                v-model="expenseCategoryForm.parentId"
                :items="parentCategoryOptions"
                value-key="value"
                placeholder="None (top-level)"
                class="w-full"
              />
            </UFormField>

            <UFormField label="GL Account">
              <UInput v-model="expenseCategoryForm.glAccount" placeholder="Optional" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Daily Limit ($)">
              <UInput v-model.number="expenseCategoryForm.dailyLimit" type="number" min="0" placeholder="No limit" class="w-full" />
            </UFormField>

            <UFormField label="Per-Transaction Limit ($)">
              <UInput v-model.number="expenseCategoryForm.perTransactionLimit" type="number" min="0" placeholder="No limit" class="w-full" />
            </UFormField>

            <UFormField label="Approval Above ($)">
              <UInput v-model.number="expenseCategoryForm.requiresApprovalAbove" type="number" min="0" placeholder="Always" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <UFormField>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="expenseCategoryForm.isBillableDefault"
                  type="checkbox"
                  class="rounded border-gray-300"
                />
                <span class="text-sm">Billable by default</span>
              </label>
            </UFormField>

            <UFormField>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="expenseCategoryForm.requiresReceipt"
                  type="checkbox"
                  class="rounded border-gray-300"
                />
                <span class="text-sm">Requires receipt</span>
              </label>
            </UFormField>

            <UFormField v-if="editingExpenseCategory">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="expenseCategoryForm.isActive"
                  type="checkbox"
                  class="rounded border-gray-300"
                />
                <span class="text-sm">Active</span>
              </label>
            </UFormField>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="showExpenseCategoryModal = false">Cancel</UButton>
          <UButton color="primary" :loading="savingExpenseCategory" :disabled="!expenseCategoryForm.name" @click="saveExpenseCategory">
            {{ editingExpenseCategory ? 'Save' : 'Create' }}
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

const toast = useToast()
const activeTab = ref('departments')

const tabs = [
  { label: 'Departments', value: 'departments' },
  { label: 'Statuses', value: 'statuses' },
  { label: 'Tags', value: 'tags' },
  { label: 'Expense Categories', value: 'expense-categories' }
]

const statusCategories = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Review', value: 'review' },
  { label: 'Done', value: 'done' },
  { label: 'Cancelled', value: 'cancelled' }
]

// Types
interface Department {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  managerId: string | null
  isActive: boolean
  sortOrder: number
  memberCount: number
  activeTasks: number
  overdueTasks: number
  completedThisWeek: number
}

interface Status {
  id: string
  departmentId: string | null
  departmentName: string | null
  name: string
  slug: string
  color: string
  icon: string | null
  category: string
  isDefault: boolean
  isFinal: boolean
  sortOrder: number
}

interface Tag {
  id: string
  name: string
  slug: string
  color: string
  description: string | null
  usageCount: number
}

interface ExpenseCategory {
  id: string
  name: string
  code: string
  description: string | null
  parentId: string | null
  parentName: string | null
  glAccount: string | null
  isBillableDefault: boolean
  requiresReceipt: boolean
  dailyLimit: number | null
  perTransactionLimit: number | null
  requiresApprovalAbove: number | null
  isActive: boolean
  expenseCount: number
}

// Data fetching
const { data: departments, pending: departmentsPending, refresh: refreshDepartments } = await useFetch<Department[]>('/api/agency/departments', {
  query: { active: 'false' }
})

const { data: statuses, pending: statusesPending, refresh: refreshStatuses } = await useFetch<Status[]>('/api/agency/statuses')

const { data: tags, pending: tagsPending, refresh: refreshTags } = await useFetch<Tag[]>('/api/agency/tags')

const { data: expenseCategories, pending: expenseCategoriesPending, refresh: refreshExpenseCategories } = await useFetch<ExpenseCategory[]>('/api/agency/expense-categories', {
  query: { active: 'false', hierarchy: 'true' }
})

// Department options for status form
const departmentOptions = computed(() => {
  const opts = [{ label: 'Global (all departments)', value: '' }]
  if (departments.value) {
    opts.push(...departments.value.map(d => ({ label: d.name, value: d.id })))
  }
  return opts
})

// Department form
const showDepartmentModal = ref(false)
const editingDepartment = ref<Department | null>(null)
const savingDepartment = ref(false)
const departmentForm = ref({
  name: '',
  description: '',
  color: '#6B7280',
  isActive: true
})

const openDepartmentModal = (dept?: Department) => {
  if (dept) {
    editingDepartment.value = dept
    departmentForm.value = {
      name: dept.name,
      description: dept.description || '',
      color: dept.color,
      isActive: dept.isActive
    }
  } else {
    editingDepartment.value = null
    departmentForm.value = {
      name: '',
      description: '',
      color: '#6B7280',
      isActive: true
    }
  }
  showDepartmentModal.value = true
}

const saveDepartment = async () => {
  if (!departmentForm.value.name) return

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
    await refreshDepartments()
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to save department', color: 'error' })
  } finally {
    savingDepartment.value = false
  }
}

const getDepartmentActions = (dept: Department) => [[
  {
    label: 'Edit',
    icon: 'i-heroicons-pencil',
    click: () => openDepartmentModal(dept)
  },
  {
    label: dept.isActive ? 'Deactivate' : 'Activate',
    icon: dept.isActive ? 'i-heroicons-eye-slash' : 'i-heroicons-eye',
    click: async () => {
      try {
        await $fetch(`/api/agency/departments/${dept.id}`, {
          method: 'PUT',
          body: { isActive: !dept.isActive }
        })
        toast.add({ title: `Department ${dept.isActive ? 'deactivated' : 'activated'}`, color: 'success' })
        await refreshDepartments()
      } catch (error: any) {
        toast.add({ title: 'Error', description: error.data?.message || 'Failed to update department', color: 'error' })
      }
    }
  }
]]

// Status form
const showStatusModal = ref(false)
const editingStatus = ref<Status | null>(null)
const savingStatus = ref(false)
const statusForm = ref({
  name: '',
  category: '',
  color: '#6B7280',
  departmentId: '',
  isDefault: false,
  isFinal: false
})

const openStatusModal = (status?: Status) => {
  if (status) {
    editingStatus.value = status
    statusForm.value = {
      name: status.name,
      category: status.category,
      color: status.color,
      departmentId: status.departmentId || '',
      isDefault: status.isDefault,
      isFinal: status.isFinal
    }
  } else {
    editingStatus.value = null
    statusForm.value = {
      name: '',
      category: '',
      color: '#6B7280',
      departmentId: '',
      isDefault: false,
      isFinal: false
    }
  }
  showStatusModal.value = true
}

const saveStatus = async () => {
  if (!statusForm.value.name || !statusForm.value.category) return

  savingStatus.value = true
  try {
    const body = {
      ...statusForm.value,
      departmentId: statusForm.value.departmentId || null
    }

    if (editingStatus.value) {
      await $fetch(`/api/agency/statuses/${editingStatus.value.id}`, {
        method: 'PUT',
        body
      })
      toast.add({ title: 'Status updated', color: 'success' })
    } else {
      await $fetch('/api/agency/statuses', {
        method: 'POST',
        body
      })
      toast.add({ title: 'Status created', color: 'success' })
    }
    showStatusModal.value = false
    await refreshStatuses()
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to save status', color: 'error' })
  } finally {
    savingStatus.value = false
  }
}

const getStatusesByCategory = (category: string): Status[] => {
  if (!statuses.value) return []
  return statuses.value.filter(s => s.category === category)
}

const getStatusActions = (status: Status) => [[
  {
    label: 'Edit',
    icon: 'i-heroicons-pencil',
    click: () => openStatusModal(status)
  }
]]

// Tag form
const showTagModal = ref(false)
const editingTag = ref<Tag | null>(null)
const savingTag = ref(false)
const tagForm = ref({
  name: '',
  description: '',
  color: '#6B7280'
})

const openTagModal = (tag?: Tag) => {
  if (tag) {
    editingTag.value = tag
    tagForm.value = {
      name: tag.name,
      description: tag.description || '',
      color: tag.color
    }
  } else {
    editingTag.value = null
    tagForm.value = {
      name: '',
      description: '',
      color: '#6B7280'
    }
  }
  showTagModal.value = true
}

const saveTag = async () => {
  if (!tagForm.value.name) return

  savingTag.value = true
  try {
    if (editingTag.value) {
      await $fetch(`/api/agency/tags/${editingTag.value.id}`, {
        method: 'PUT',
        body: tagForm.value
      })
      toast.add({ title: 'Tag updated', color: 'success' })
    } else {
      await $fetch('/api/agency/tags', {
        method: 'POST',
        body: tagForm.value
      })
      toast.add({ title: 'Tag created', color: 'success' })
    }
    showTagModal.value = false
    await refreshTags()
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to save tag', color: 'error' })
  } finally {
    savingTag.value = false
  }
}

const getTagActions = (tag: Tag) => [[
  {
    label: 'Edit',
    icon: 'i-heroicons-pencil',
    click: () => openTagModal(tag)
  },
  {
    label: 'Delete',
    icon: 'i-heroicons-trash',
    click: async () => {
      if (!confirm(`Delete tag "${tag.name}"?`)) return
      try {
        await $fetch(`/api/agency/tags/${tag.id}`, { method: 'DELETE' })
        toast.add({ title: 'Tag deleted', color: 'success' })
        await refreshTags()
      } catch (error: any) {
        toast.add({ title: 'Error', description: error.data?.message || 'Failed to delete tag', color: 'error' })
      }
    }
  }
]]

// Expense Category form
const showExpenseCategoryModal = ref(false)
const editingExpenseCategory = ref<ExpenseCategory | null>(null)
const savingExpenseCategory = ref(false)
const expenseCategoryForm = ref({
  name: '',
  code: '',
  description: '',
  parentId: '',
  glAccount: '',
  isBillableDefault: false,
  requiresReceipt: true,
  dailyLimit: null as number | null,
  perTransactionLimit: null as number | null,
  requiresApprovalAbove: null as number | null,
  isActive: true
})

const parentCategoryOptions = computed(() => {
  const opts = [{ label: 'None (top-level)', value: '' }]
  if (expenseCategories.value) {
    // Exclude current category and its children from parent options
    const currentId = editingExpenseCategory.value?.id
    opts.push(...expenseCategories.value
      .filter(c => c.id !== currentId && !c.parentId)
      .map(c => ({ label: c.name, value: c.id }))
    )
  }
  return opts
})

const openExpenseCategoryModal = (cat?: ExpenseCategory) => {
  if (cat) {
    editingExpenseCategory.value = cat
    expenseCategoryForm.value = {
      name: cat.name,
      code: cat.code,
      description: cat.description || '',
      parentId: cat.parentId || '',
      glAccount: cat.glAccount || '',
      isBillableDefault: cat.isBillableDefault,
      requiresReceipt: cat.requiresReceipt,
      dailyLimit: cat.dailyLimit,
      perTransactionLimit: cat.perTransactionLimit,
      requiresApprovalAbove: cat.requiresApprovalAbove,
      isActive: cat.isActive
    }
  } else {
    editingExpenseCategory.value = null
    expenseCategoryForm.value = {
      name: '',
      code: '',
      description: '',
      parentId: '',
      glAccount: '',
      isBillableDefault: false,
      requiresReceipt: true,
      dailyLimit: null,
      perTransactionLimit: null,
      requiresApprovalAbove: null,
      isActive: true
    }
  }
  showExpenseCategoryModal.value = true
}

const saveExpenseCategory = async () => {
  if (!expenseCategoryForm.value.name) return

  savingExpenseCategory.value = true
  try {
    const body = {
      ...expenseCategoryForm.value,
      code: expenseCategoryForm.value.code || undefined,
      parentId: expenseCategoryForm.value.parentId || null,
      glAccount: expenseCategoryForm.value.glAccount || null,
      description: expenseCategoryForm.value.description || null
    }

    if (editingExpenseCategory.value) {
      await $fetch(`/api/agency/expense-categories/${editingExpenseCategory.value.id}`, {
        method: 'PUT',
        body
      })
      toast.add({ title: 'Category updated', color: 'success' })
    } else {
      await $fetch('/api/agency/expense-categories', {
        method: 'POST',
        body
      })
      toast.add({ title: 'Category created', color: 'success' })
    }
    showExpenseCategoryModal.value = false
    await refreshExpenseCategories()
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to save category', color: 'error' })
  } finally {
    savingExpenseCategory.value = false
  }
}

const getExpenseCategoryActions = (cat: ExpenseCategory) => [[
  {
    label: 'Edit',
    icon: 'i-heroicons-pencil',
    click: () => openExpenseCategoryModal(cat)
  },
  {
    label: cat.isActive ? 'Deactivate' : 'Activate',
    icon: cat.isActive ? 'i-heroicons-eye-slash' : 'i-heroicons-eye',
    click: async () => {
      try {
        await $fetch(`/api/agency/expense-categories/${cat.id}`, {
          method: 'PUT',
          body: { isActive: !cat.isActive }
        })
        toast.add({ title: `Category ${cat.isActive ? 'deactivated' : 'activated'}`, color: 'success' })
        await refreshExpenseCategories()
      } catch (error: any) {
        toast.add({ title: 'Error', description: error.data?.message || 'Failed to update category', color: 'error' })
      }
    }
  },
  {
    label: 'Delete',
    icon: 'i-heroicons-trash',
    click: async () => {
      if (!confirm(`Delete category "${cat.name}"? ${cat.expenseCount > 0 ? 'This category has expenses and will be deactivated instead.' : ''}`)) return
      try {
        const result = await $fetch<{ deactivated?: boolean }>(`/api/agency/expense-categories/${cat.id}`, { method: 'DELETE' })
        if (result.deactivated) {
          toast.add({ title: 'Category deactivated', description: 'Category has expenses and was deactivated instead of deleted', color: 'info' })
        } else {
          toast.add({ title: 'Category deleted', color: 'success' })
        }
        await refreshExpenseCategories()
      } catch (error: any) {
        toast.add({ title: 'Error', description: error.data?.message || 'Failed to delete category', color: 'error' })
      }
    }
  }
]]
</script>
