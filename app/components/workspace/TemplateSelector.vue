<template>
  <UModal v-model:open="isOpen" fullscreen>
    <template #content>
      <div class="h-full flex flex-col bg-white">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="text-xl font-semibold">Template center</h2>
          <UButton variant="ghost" color="neutral" icon="i-lucide-x" size="sm" @click="isOpen = false" />
        </div>

        <div class="flex-1 flex overflow-hidden">
          <!-- Sidebar -->
          <div class="w-64 border-r bg-gray-50 p-4 overflow-auto">
            <div class="space-y-1">
              <button
                v-for="category in categories"
                :key="category.id"
                class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                :class="selectedCategory === category.id ? 'bg-white shadow-sm text-primary font-medium' : 'hover:bg-white/50 text-gray-600'"
                @click="selectedCategory = category.id"
              >
                <UIcon :name="category.icon" class="w-4 h-4" />
                {{ category.name }}
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <!-- Search -->
            <div class="p-4 border-b">
              <UInput
                v-model="searchQuery"
                icon="i-lucide-search"
                placeholder="Search by template name, creator or description"
                class="w-full"
              />
            </div>

            <!-- Templates Grid -->
            <div class="flex-1 overflow-auto p-6">
              <div class="max-w-6xl mx-auto">
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  <div
                    v-for="template in filteredTemplates"
                    :key="template.id"
                    class="group bg-white rounded-lg border hover:shadow-md hover:border-primary transition-all cursor-pointer overflow-hidden max-w-[280px]"
                    @click="selectTemplate(template)"
                  >
                    <!-- Preview -->
                    <div class="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                      <img 
                        v-if="template.image" 
                        :src="template.image" 
                        class="w-full h-full object-cover"
                        :alt="template.name"
                      />
                      <div v-else class="w-full h-full flex items-center justify-center">
                        <UIcon name="i-lucide-layout-grid" class="w-8 h-8 text-gray-300" />
                      </div>
                      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                    </div>

                    <!-- Info -->
                    <div class="p-3">
                      <h3 class="font-medium text-sm text-gray-900 group-hover:text-primary transition-colors truncate">
                        {{ template.name }}
                      </h3>
                      <p class="text-xs text-gray-500 mt-0.5">by {{ template.creator }}</p>
                      <p class="text-xs text-gray-600 mt-1 line-clamp-2">
                        {{ template.description }}
                      </p>
                      
                      <!-- Tags -->
                      <div class="flex items-center gap-2 mt-2">
                        <UBadge v-if="template.isAiPowered" size="xs" color="primary" variant="soft" class="text-[10px]">
                          <UIcon name="i-lucide-sparkles" class="w-3 h-3 mr-0.5" />
                          AI
                        </UBadge>
                        <span v-if="template.downloads" class="text-[10px] text-gray-500 flex items-center gap-0.5">
                          <UIcon name="i-lucide-download" class="w-3 h-3" />
                          {{ formatDownloads(template.downloads) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Empty State -->
              <div v-if="filteredTemplates.length === 0" class="text-center py-12">
                <UIcon name="i-lucide-search-x" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 class="font-medium">No templates found</h3>
                <p class="text-sm text-gray-500 mt-1">Try adjusting your search</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'select': [template: any]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const searchQuery = ref('')
const selectedCategory = ref('all')

const categories = [
  { id: 'all', name: 'All templates', icon: 'i-lucide-layout-grid' },
  { id: 'recommended', name: 'Recommended for you', icon: 'i-lucide-star' },
  { id: 'marketing', name: 'Marketing', icon: 'i-lucide-megaphone' },
  { id: 'content', name: 'Content Production', icon: 'i-lucide-palette' },
  { id: 'project', name: 'Project Management', icon: 'i-lucide-briefcase' },
  { id: 'crm', name: 'Sales & CRM', icon: 'i-lucide-users' },
  { id: 'design', name: 'Design', icon: 'i-lucide-pen-tool' },
  { id: 'hr', name: 'HR', icon: 'i-lucide-user-plus' },
  { id: 'operations', name: 'Operations', icon: 'i-lucide-settings' },
]

// Mock templates - in real app, fetch from API
const templates = ref([
  {
    id: 'single-project',
    name: 'Single Project',
    creator: 'monday.com',
    description: 'Plan any project flow in one workspace and track its progress.',
    image: null,
    category: 'project',
    isAiPowered: true,
    downloads: 220000
  },
  {
    id: 'contacts',
    name: 'Contacts',
    creator: 'monday.com',
    description: 'Keep track of all contact information in one, secure place.',
    image: null,
    category: 'crm',
    isAiPowered: false,
    downloads: 220000
  },
  {
    id: 'project-requests',
    name: 'Project Requests and Approvals',
    creator: 'monday.com',
    description: 'Streamline requests and approvals to ensure projects are running smoothly.',
    image: null,
    category: 'project',
    isAiPowered: true,
    downloads: null
  },
  {
    id: 'marketing-campaign',
    name: 'Marketing Campaign',
    creator: 'ADME',
    description: 'Plan and execute marketing campaigns from start to finish.',
    image: null,
    category: 'marketing',
    isAiPowered: false,
    downloads: 1500
  },
  {
    id: 'content-calendar',
    name: 'Content Calendar',
    creator: 'ADME',
    description: 'Organize your content production and publishing schedule.',
    image: null,
    category: 'content',
    isAiPowered: true,
    downloads: 3200
  },
  {
    id: 'client-onboarding',
    name: 'Client Onboarding',
    creator: 'ADME',
    description: 'Streamline your client onboarding process.',
    image: null,
    category: 'crm',
    isAiPowered: false,
    downloads: 890
  },
  {
    id: 'creative-approvals',
    name: 'Creative Approvals',
    creator: 'ADME',
    description: 'Manage creative review and approval workflows.',
    image: null,
    category: 'design',
    isAiPowered: false,
    downloads: 2100
  },
  {
    id: 'ad-campaigns',
    name: 'Digital Advertising Campaigns',
    creator: 'ADME',
    description: 'Track and manage digital ad campaigns across platforms.',
    image: null,
    category: 'marketing',
    isAiPowered: true,
    downloads: 4500
  }
])

const filteredTemplates = computed(() => {
  let result = templates.value

  // Filter by category
  if (selectedCategory.value !== 'all') {
    result = result.filter(t => t.category === selectedCategory.value)
  }

  // Filter by search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(t => 
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.creator.toLowerCase().includes(query)
    )
  }

  return result
})

const formatDownloads = (count: number) => {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M'
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K'
  return count.toString()
}

const selectTemplate = (template: any) => {
  emit('select', template)
  isOpen.value = false
}
</script>
