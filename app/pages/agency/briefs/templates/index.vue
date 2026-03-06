<script setup lang="ts">
definePageMeta({
  title: 'Brief Templates',
  middleware: ['auth']
})

const toast = useToast()

// Fetch categories
const { data: categoriesData, refresh: refreshCategories } = await useFetch('/api/agency/briefs/categories')
const categories = computed(() => (categoriesData.value || []) as any[])

// Active category tab
const activeTab = ref('all')

// Search
const searchQuery = ref('')

// Fetch templates
const { data: templatesData, pending, refresh: refreshTemplates } = await useFetch('/api/agency/briefs/templates')

// Filtered templates
const filteredTemplates = computed(() => {
  if (!templatesData.value) return []
  let result = templatesData.value as any[]

  // Filter by category tab
  if (activeTab.value !== 'all') {
    result = result.filter((t: any) => t.categoryId === activeTab.value)
  }

  // Filter by search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter((t: any) =>
      t.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.category?.name?.toLowerCase().includes(q)
    )
  }

  return result
})

// Category tabs with counts
const categoryTabs = computed(() => {
  const all = (templatesData.value || []) as any[]
  const tabs = [{ label: 'All', value: 'all', count: all.length }]
  for (const cat of categories.value) {
    const count = all.filter((t: any) => t.categoryId === cat.id).length
    tabs.push({ label: cat.name, value: cat.id, count })
  }
  return tabs
})

// Icon options for the icon picker
const iconOptions = [
  { label: 'Document', value: 'i-lucide-file-text' },
  { label: 'Briefcase', value: 'i-lucide-briefcase' },
  { label: 'Megaphone', value: 'i-lucide-megaphone' },
  { label: 'Palette', value: 'i-lucide-palette' },
  { label: 'Code', value: 'i-lucide-code' },
  { label: 'Camera', value: 'i-lucide-camera' },
  { label: 'Globe', value: 'i-lucide-globe' },
  { label: 'Target', value: 'i-lucide-target' },
  { label: 'Layout', value: 'i-lucide-layout' },
  { label: 'Pen Tool', value: 'i-lucide-pen-tool' },
  { label: 'Video', value: 'i-lucide-video' },
  { label: 'Chart', value: 'i-lucide-bar-chart-3' },
  { label: 'Clipboard', value: 'i-lucide-clipboard' },
  { label: 'Lightbulb', value: 'i-lucide-lightbulb' },
  { label: 'Rocket', value: 'i-lucide-rocket' },
  { label: 'Sparkles', value: 'i-lucide-sparkles' }
]

// Create template modal
const showCreateModal = ref(false)
const creating = ref(false)
const createForm = ref({
  name: '',
  slug: '',
  description: '',
  categoryId: 'none' as string,
  icon: 'i-lucide-file-text'
})

// Auto-generate slug from name
watch(() => createForm.value.name, (name) => {
  createForm.value.slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
})

const categorySelectItems = computed(() => {
  return [
    { label: 'Select a category...', value: 'none' },
    ...categories.value.map((c: any) => ({ label: c.name, value: c.id }))
  ]
})

async function createTemplate() {
  if (!createForm.value.name.trim()) {
    toast.add({ title: 'Name is required', color: 'error' })
    return
  }
  if (createForm.value.categoryId === 'none') {
    toast.add({ title: 'Please select a category', color: 'error' })
    return
  }

  creating.value = true
  try {
    const result = await $fetch('/api/agency/briefs/templates', {
      method: 'POST',
      body: {
        name: createForm.value.name.trim(),
        description: createForm.value.description || null,
        categoryId: createForm.value.categoryId,
        icon: createForm.value.icon
      }
    }) as any

    toast.add({
      title: 'Template created',
      description: `${result.name} has been created`,
      color: 'success'
    })

    showCreateModal.value = false
    resetForm()
    await refreshTemplates()
    navigateTo(`/agency/briefs/templates/${result.id}`)
  } catch (err: any) {
    toast.add({
      title: 'Failed to create template',
      description: err.data?.statusMessage || err.message,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

function resetForm() {
  createForm.value = {
    name: '',
    slug: '',
    description: '',
    categoryId: 'none',
    icon: 'i-lucide-file-text'
  }
}

// Delete template
const showDeleteModal = ref(false)
const templateToDelete = ref<any>(null)
const deleting = ref(false)

function confirmDelete(tmpl: any) {
  templateToDelete.value = tmpl
  showDeleteModal.value = true
}

async function deleteTemplate() {
  if (!templateToDelete.value) return
  deleting.value = true
  try {
    await $fetch(`/api/agency/briefs/templates/${templateToDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Template archived', color: 'success' })
    showDeleteModal.value = false
    templateToDelete.value = null
    await refreshTemplates()
  } catch (err: any) {
    toast.add({
      title: 'Failed to delete template',
      description: err.data?.statusMessage || err.message,
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

// Duplicate template
async function duplicateTemplate(tmpl: any) {
  try {
    const result = await $fetch('/api/agency/briefs/templates', {
      method: 'POST',
      body: {
        categoryId: tmpl.categoryId,
        name: `${tmpl.name} (Copy)`,
        description: tmpl.description,
        icon: tmpl.icon,
        isMultiStep: tmpl.isMultiStep,
        requiresApproval: tmpl.requiresApproval,
        defaultPriority: tmpl.defaultPriority,
        allowAttachments: tmpl.allowAttachments,
        maxAttachments: tmpl.maxAttachments,
        isPublic: tmpl.isPublic
      }
    }) as any
    toast.add({ title: 'Template duplicated', color: 'success' })
    await refreshTemplates()
    navigateTo(`/agency/briefs/templates/${result.id}`)
  } catch (err: any) {
    toast.add({
      title: 'Failed to duplicate template',
      description: err.data?.statusMessage || err.message,
      color: 'error'
    })
  }
}

// Dropdown actions for template card
function getTemplateActions(tmpl: any) {
  return [
    [
      { label: 'Edit', icon: 'i-lucide-pencil', click: () => navigateTo(`/agency/briefs/templates/${tmpl.id}`) },
      { label: 'Duplicate', icon: 'i-lucide-copy', click: () => duplicateTemplate(tmpl) }
    ],
    [
      { label: 'Archive', icon: 'i-lucide-archive', click: () => confirmDelete(tmpl) }
    ]
  ]
}

// Category management modal
const showCategoryModal = ref(false)
const categoryForm = ref({ name: '', description: '', icon: 'i-lucide-folder', color: 'blue' })
const editingCategory = ref<any>(null)
const savingCategory = ref(false)

function openCategoryManager() {
  editingCategory.value = null
  categoryForm.value = { name: '', description: '', icon: 'i-lucide-folder', color: 'blue' }
  showCategoryModal.value = true
}

function openEditCategory(cat: any) {
  editingCategory.value = cat
  categoryForm.value = { name: cat.name, description: cat.description || '', icon: cat.icon, color: cat.color }
  showCategoryModal.value = true
}

async function saveCategory() {
  if (!categoryForm.value.name.trim()) {
    toast.add({ title: 'Name is required', color: 'error' })
    return
  }
  savingCategory.value = true
  try {
    if (editingCategory.value) {
      await $fetch(`/api/agency/briefs/categories/${editingCategory.value.id}`, {
        method: 'PUT',
        body: categoryForm.value
      })
      toast.add({ title: 'Category updated', color: 'success' })
    } else {
      await $fetch('/api/agency/briefs/categories', {
        method: 'POST',
        body: categoryForm.value
      })
      toast.add({ title: 'Category created', color: 'success' })
    }
    showCategoryModal.value = false
    await refreshCategories()
    await refreshTemplates()
  } catch (err: any) {
    toast.add({
      title: 'Failed to save category',
      description: err.data?.statusMessage || err.message,
      color: 'error'
    })
  } finally {
    savingCategory.value = false
  }
}

async function deleteCategory(catId: string) {
  try {
    await $fetch(`/api/agency/briefs/categories/${catId}`, { method: 'DELETE' })
    toast.add({ title: 'Category deleted', color: 'success' })
    await refreshCategories()
    await refreshTemplates()
    if (activeTab.value === catId) activeTab.value = 'all'
  } catch (err: any) {
    toast.add({
      title: 'Failed to delete category',
      description: err.data?.statusMessage || err.message,
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0">
    <UDashboardPanel :ui="{ root: 'max-h-svh' }">
      <UDashboardNavbar title="Brief Templates">
        <template #right>
          <UButton
            variant="outline"
            icon="i-lucide-settings"
            label="Categories"
            size="sm"
            @click="openCategoryManager"
          />
          <UButton
            label="Create Template"
            icon="i-lucide-plus"
            color="primary"
            @click="showCreateModal = true"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Search -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            placeholder="Search templates..."
            icon="i-lucide-search"
            class="w-full sm:w-80"
          />
        </div>

        <!-- Category Tabs -->
        <div class="flex flex-wrap gap-2 mb-6">
          <UButton
            v-for="tab in categoryTabs"
            :key="tab.value"
            :variant="activeTab === tab.value ? 'solid' : 'soft'"
            :color="activeTab === tab.value ? 'primary' : 'neutral'"
            size="sm"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
            <UBadge
              color="neutral"
              variant="subtle"
              size="xs"
              class="ml-1.5"
            >
              {{ tab.count }}
            </UBadge>
          </UButton>
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-16">
          <XfLoader />
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredTemplates.length === 0"
          class="flex flex-col items-center justify-center py-16 text-center"
        >
          <div class="w-16 h-16 rounded-full bg-elevated flex items-center justify-center mb-4">
            <UIcon name="i-lucide-file-text" class="w-8 h-8 text-muted" />
          </div>
          <h3 class="text-lg font-semibold mb-1">No templates found</h3>
          <p class="text-sm text-muted mb-4">
            {{ searchQuery ? 'Try adjusting your search or filters.' : 'Create your first brief template to get started.' }}
          </p>
          <UButton
            v-if="!searchQuery"
            label="Create Template"
            icon="i-lucide-plus"
            color="primary"
            @click="showCreateModal = true"
          />
        </div>

        <!-- Template Cards Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="tmpl in filteredTemplates"
            :key="tmpl.id"
            class="border border-default rounded-lg p-4 hover:border-[var(--ui-color-primary)]/50 transition-all cursor-pointer group bg-default hover:shadow-sm"
            @click="navigateTo(`/agency/briefs/templates/${tmpl.id}`)"
          >
            <!-- Header row -->
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--ui-color-primary)]/10 shrink-0">
                  <UIcon
                    :name="tmpl.icon || 'i-lucide-file-text'"
                    class="w-5 h-5 text-[var(--ui-color-primary)]"
                  />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold truncate">{{ tmpl.name }}</p>
                  <UBadge
                    v-if="tmpl.category"
                    variant="subtle"
                    color="neutral"
                    size="xs"
                    class="mt-0.5"
                  >
                    <UIcon
                      v-if="tmpl.category?.icon"
                      :name="tmpl.category.icon"
                      class="w-3 h-3 mr-1"
                    />
                    {{ tmpl.category.name }}
                  </UBadge>
                </div>
              </div>

              <UDropdownMenu :items="getTemplateActions(tmpl)" @click.stop>
                <UButton
                  icon="i-lucide-more-vertical"
                  variant="ghost"
                  size="xs"
                  class="opacity-0 group-hover:opacity-100 shrink-0"
                  @click.stop
                />
              </UDropdownMenu>
            </div>

            <!-- Description -->
            <p v-if="tmpl.description" class="text-xs text-muted line-clamp-2 mb-3">
              {{ tmpl.description }}
            </p>

            <!-- Stats badges -->
            <div class="flex items-center gap-2 flex-wrap mt-auto pt-3 border-t border-default">
              <div class="flex items-center gap-1 text-xs text-muted">
                <UIcon name="i-lucide-list" class="w-3.5 h-3.5" />
                <span>{{ tmpl.fieldCount || 0 }} fields</span>
              </div>
              <div class="flex items-center gap-1 text-xs text-muted">
                <UIcon name="i-lucide-file-check" class="w-3.5 h-3.5" />
                <span>{{ tmpl.briefCount || 0 }} briefs</span>
              </div>
              <UBadge v-if="tmpl.isMultiStep" variant="subtle" size="xs">
                Multi-step
              </UBadge>
              <UBadge v-if="tmpl.isPublic" variant="subtle" color="success" size="xs">
                Public
              </UBadge>
            </div>
          </div>
        </div>
      </div>
    </UDashboardPanel>

    <!-- Create Template Modal -->
    <UModal v-model:open="showCreateModal">
      <template #content>
        <div class="p-6 space-y-5">
          <h2 class="text-lg font-semibold">Create Brief Template</h2>

          <UFormField label="Template Name" required>
            <UInput
              v-model="createForm.name"
              placeholder="e.g., Social Media Campaign Brief"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Slug">
            <UInput
              v-model="createForm.slug"
              placeholder="auto-generated-from-name"
              class="w-full font-mono text-xs"
              disabled
            />
            <p class="text-xs text-muted mt-1">Auto-generated from the template name</p>
          </UFormField>

          <UFormField label="Description">
            <UTextarea
              v-model="createForm.description"
              placeholder="Describe the purpose of this brief template..."
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Category" required>
            <USelectMenu
              v-model="createForm.categoryId"
              :items="categorySelectItems"
              value-key="value"
              placeholder="Select a category"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Icon">
            <USelectMenu
              v-model="createForm.icon"
              :items="iconOptions"
              value-key="value"
              class="w-full"
            >
              <template #leading>
                <UIcon :name="createForm.icon" class="w-4 h-4" />
              </template>
            </USelectMenu>
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              label="Cancel"
              @click="showCreateModal = false"
            />
            <UButton
              color="primary"
              label="Create Template"
              icon="i-lucide-plus"
              :loading="creating"
              :disabled="!createForm.name.trim() || createForm.categoryId === 'none'"
              @click="createTemplate"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h2 class="text-lg font-semibold">Archive Template</h2>
          <p class="text-sm text-muted">
            Are you sure you want to archive "{{ templateToDelete?.name }}"? Existing briefs using this template will not be affected.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" label="Cancel" @click="showDeleteModal = false" />
            <UButton color="error" label="Archive" :loading="deleting" @click="deleteTemplate" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Category Management Modal -->
    <UModal v-model:open="showCategoryModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h2 class="text-lg font-semibold">
            {{ editingCategory ? 'Edit Category' : 'Manage Categories' }}
          </h2>

          <UFormField label="Name" required>
            <UInput v-model="categoryForm.name" placeholder="e.g. Design" class="w-full" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="categoryForm.description" placeholder="Category description" :rows="2" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Icon">
              <UInput v-model="categoryForm.icon" placeholder="i-lucide-folder" class="w-full font-mono text-xs" />
            </UFormField>
            <UFormField label="Color">
              <UInput v-model="categoryForm.color" placeholder="blue" class="w-full" />
            </UFormField>
          </div>

          <!-- Existing categories list -->
          <div v-if="categories?.length" class="space-y-2 pt-3 border-t border-default">
            <p class="text-xs font-semibold text-muted uppercase tracking-wider">Existing Categories</p>
            <div
              v-for="cat in categories"
              :key="cat.id"
              class="flex items-center justify-between py-1.5"
            >
              <div class="flex items-center gap-2">
                <UIcon :name="cat.icon || 'i-lucide-folder'" class="w-4 h-4 text-muted" />
                <span class="text-sm">{{ cat.name }}</span>
                <UBadge variant="subtle" size="xs">{{ cat.templateCount }} templates</UBadge>
              </div>
              <div class="flex items-center gap-1">
                <UButton icon="i-lucide-pencil" variant="ghost" size="xs" @click="openEditCategory(cat)" />
                <UButton icon="i-lucide-trash-2" variant="ghost" size="xs" color="error" @click="deleteCategory(cat.id)" />
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" label="Cancel" @click="showCategoryModal = false" />
            <UButton :loading="savingCategory" @click="saveCategory">
              {{ editingCategory ? 'Update' : 'Create' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
