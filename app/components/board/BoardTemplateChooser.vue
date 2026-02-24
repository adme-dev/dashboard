<script setup lang="ts">
const props = defineProps<{
  /** When provided, show "Save as Template" mode for this board */
  sourceBoardId?: string
  sourceBoardName?: string
}>()

const emit = defineEmits<{
  apply: [templateId: string]
  saved: [template: { id: string; name: string }]
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const toast = useToast()
const activeTab = ref<'browse' | 'save'>('browse')
const searchQuery = ref('')
const selectedCategory = ref('all')
const isApplying = ref(false)
const isSaving = ref(false)

// Save form
const saveForm = ref({
  name: '',
  description: '',
  category: '',
  isPublic: true,
})

// Fetch templates
const { data: templatesData, refresh: refreshTemplates } = await useFetch<{
  templates: BoardTemplate[]
  categories: string[]
}>('/api/agency/boards/templates', {
  query: computed(() => ({
    search: searchQuery.value || undefined,
    category: selectedCategory.value !== 'all' ? selectedCategory.value : undefined,
  })),
})

const templates = computed(() => templatesData.value?.templates || [])
const categories = computed(() => ['all', ...(templatesData.value?.categories || [])])

interface BoardTemplate {
  id: string
  name: string
  description?: string
  category?: string
  icon: string
  color: string
  columnCount: number
  groupCount: number
  isPublic: boolean
  isSystem: boolean
  timesUsed: number
  createdByName?: string
  sourceBoardName?: string
  createdAt: string
}

// Set default tab based on mode
watch(isOpen, (val) => {
  if (val) {
    activeTab.value = props.sourceBoardId ? 'save' : 'browse'
    if (props.sourceBoardId) {
      saveForm.value.name = `${props.sourceBoardName || 'Board'} Template`
    }
  }
})

async function applyTemplate(templateId: string) {
  isApplying.value = true
  try {
    emit('apply', templateId)
    isOpen.value = false
  } finally {
    isApplying.value = false
  }
}

async function saveAsTemplate() {
  if (!props.sourceBoardId || !saveForm.value.name.trim()) return
  isSaving.value = true

  try {
    const result = await $fetch<{ id: string; name: string }>('/api/agency/boards/templates', {
      method: 'POST',
      body: {
        name: saveForm.value.name.trim(),
        description: saveForm.value.description.trim() || null,
        category: saveForm.value.category.trim() || null,
        sourceBoardId: props.sourceBoardId,
        isPublic: saveForm.value.isPublic,
      },
    })

    toast.add({
      title: 'Template saved',
      description: `"${result.name}" is now available as a board template`,
      color: 'success',
    })

    emit('saved', result)
    isOpen.value = false
    refreshTemplates()
  } catch (error: any) {
    toast.add({
      title: 'Failed to save template',
      description: error?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="isOpen" title="Board Templates">
    <template #header>
      <div>
        <h3 class="text-lg font-semibold">Board Templates</h3>
        <!-- Tabs -->
        <div v-if="sourceBoardId" class="flex gap-1 mt-4 -mb-4 border-b">
          <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px"
            :class="activeTab === 'browse' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'browse'"
          >
            Browse Templates
          </button>
          <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px"
            :class="activeTab === 'save' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'save'"
          >
            Save as Template
          </button>
        </div>
      </div>
    </template>

    <template #body>
      <!-- Browse Tab -->
      <div v-if="activeTab === 'browse'" class="space-y-4">
        <!-- Search + Filter -->
        <div class="flex items-center gap-3">
          <div class="flex-1 relative">
            <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search templates..."
              class="w-full pl-9 pr-3 py-2 text-sm border rounded-lg outline-none focus:border-primary"
            />
          </div>
          <select
            v-model="selectedCategory"
            class="px-3 py-2 text-sm border rounded-lg outline-none bg-white"
          >
            <option v-for="cat in categories" :key="cat" :value="cat">
              {{ cat === 'all' ? 'All Categories' : cat }}
            </option>
          </select>
        </div>

        <!-- Template Grid -->
        <div v-if="templates.length" class="grid grid-cols-2 gap-3 max-h-[400px] overflow-auto">
          <button
            v-for="tpl in templates"
            :key="tpl.id"
            class="text-left p-4 border rounded-lg hover:border-purple-300 hover:bg-purple-50/30 transition-all group"
            @click="applyTemplate(tpl.id)"
          >
            <div class="flex items-start gap-3">
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                :style="{ backgroundColor: tpl.color + '20' }"
              >
                <UIcon
                  :name="`i-lucide-${tpl.icon || 'layout-grid'}`"
                  class="w-5 h-5"
                  :style="{ color: tpl.color }"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-semibold truncate group-hover:text-purple-700">{{ tpl.name }}</h4>
                <p v-if="tpl.description" class="text-xs text-gray-500 mt-0.5 line-clamp-2">{{ tpl.description }}</p>
                <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
                  <span>{{ tpl.columnCount }} columns</span>
                  <span>&middot;</span>
                  <span>{{ tpl.groupCount }} groups</span>
                  <span v-if="tpl.timesUsed" class="ml-auto">Used {{ tpl.timesUsed }}x</span>
                </div>
              </div>
            </div>
          </button>
        </div>

        <!-- Empty -->
        <div v-else class="text-center py-12">
          <UIcon name="i-lucide-layout-template" class="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p class="text-sm text-gray-500">No templates found</p>
          <p v-if="searchQuery" class="text-xs text-gray-400 mt-1">Try a different search term</p>
        </div>
      </div>

      <!-- Save Tab -->
      <div v-if="activeTab === 'save'" class="space-y-4">
        <div class="p-3 bg-purple-50 rounded-lg flex items-start gap-2">
          <UIcon name="i-lucide-info" class="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
          <p class="text-xs text-purple-700">
            This will save the current board's column structure, groups, and view configurations as a reusable template.
            Task data is not included.
          </p>
        </div>

        <UFormField label="Template Name" required>
          <UInput v-model="saveForm.name" placeholder="e.g., Marketing Campaign Board" class="w-full" />
        </UFormField>

        <UFormField label="Description">
          <textarea
            v-model="saveForm.description"
            placeholder="Describe when to use this template..."
            rows="3"
            class="w-full px-3 py-2 text-sm border rounded-lg outline-none resize-none focus:border-primary"
          />
        </UFormField>

        <UFormField label="Category">
          <UInput v-model="saveForm.category" placeholder="e.g., Marketing, Engineering, HR" class="w-full" />
        </UFormField>

        <UCheckbox v-model="saveForm.isPublic" label="Make available to all team members" />
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="isOpen = false">Cancel</UButton>
        <UButton
          v-if="activeTab === 'save'"
          color="primary"
          icon="i-lucide-save"
          :loading="isSaving"
          :disabled="!saveForm.name.trim()"
          @click="saveAsTemplate"
        >
          Save Template
        </UButton>
      </div>
    </template>
  </UModal>
</template>
