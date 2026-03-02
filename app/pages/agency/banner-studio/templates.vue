<script setup lang="ts">
import type { BannerTemplateDB } from '~/types/banner-studio'

definePageMeta({ layout: 'agency' })

const router = useRouter()
const toast = useToast()

const searchQuery = ref('')
const activeCategory = ref('all')
const showDeleteModal = ref(false)
const deleteTarget = ref<BannerTemplateDB | null>(null)

const categories = [
  { label: 'All', value: 'all' },
  { label: 'Automotive', value: 'automotive' },
  { label: 'Real Estate', value: 'real-estate' },
  { label: 'Retail', value: 'retail' },
  { label: 'Food', value: 'food' },
  { label: 'Finance', value: 'finance' },
  { label: 'Lifestyle', value: 'lifestyle' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Custom', value: 'custom' },
]

const fetchParams = computed(() => ({
  category: activeCategory.value !== 'all' ? activeCategory.value : undefined,
  search: searchQuery.value || undefined,
}))

const { data: templates, refresh } = useFetch<BannerTemplateDB[]>('/api/agency/banner-studio/templates', {
  query: fetchParams,
  default: () => [],
})

function useTemplate(tpl: BannerTemplateDB) {
  // Increment usage count in background
  $fetch(`/api/agency/banner-studio/templates/${tpl.id}/use`, { method: 'POST' }).catch(() => {})
  // Navigate to new project with template
  router.push({ path: '/agency/banner-studio/new', query: { template: tpl.id } })
}

function confirmDelete(tpl: BannerTemplateDB) {
  deleteTarget.value = tpl
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await $fetch(`/api/agency/banner-studio/templates/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `"${deleteTarget.value.name}" has been removed`, color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to delete template', color: 'error' })
  }
}

const dropdownItems = (tpl: BannerTemplateDB) => {
  const items: any[][] = [
    [{ label: 'Use Template', icon: 'i-lucide-play', onSelect: () => useTemplate(tpl) }],
  ]
  if (!tpl.isSystem) {
    items.push([
      { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => confirmDelete(tpl) },
    ])
  }
  return items
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          size="sm"
          @click="router.push('/agency/banner-studio')"
        />
        <BrandCube color="yellow" :size="32" :animated="false" />
        <div>
          <h1 class="text-2xl font-bold">Template Gallery</h1>
          <p class="text-sm text-(--ui-text-muted) mt-0.5">Browse and use banner templates</p>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 bg-(--ui-bg-elevated)/50 rounded-lg px-4 py-3 border border-(--ui-border)">
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        placeholder="Search templates..."
        class="w-72"
        size="sm"
      />
      <span class="text-xs text-(--ui-text-muted) ml-auto">{{ templates.length }} template{{ templates.length !== 1 ? 's' : '' }}</span>
    </div>

    <!-- Category Tabs -->
    <div class="flex items-center gap-1.5 mb-6 flex-wrap">
      <NbButton
        v-for="cat in categories"
        :key="cat.value"
        :variant="activeCategory === cat.value ? 'primary' : 'ghost'"
        size="sm"
        @click="activeCategory = cat.value"
      >
        {{ cat.label }}
      </NbButton>
    </div>

    <!-- Template Grid -->
    <div v-if="templates.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <NbCard
        v-for="tpl in templates"
        :key="tpl.id"
        hoverable
        body-class="!p-0"
        class="overflow-hidden group"
      >
        <!-- Thumbnail -->
        <div class="aspect-video bg-(--ui-bg) flex items-center justify-center relative">
          <img
            v-if="tpl.thumbnailUrl"
            :src="tpl.thumbnailUrl"
            :alt="tpl.name"
            class="w-full h-full object-cover"
          >
          <UIcon v-else name="i-lucide-layout-template" class="w-10 h-10 text-(--ui-text-muted)/30" />
          <NbBadge
            v-if="tpl.isSystem"
            variant="primary"
            class="absolute top-2 left-2"
          >
            System
          </NbBadge>
          <!-- Hover overlay -->
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
            <span class="text-white text-xs font-semibold tracking-wide">Use Template</span>
          </div>
        </div>

        <!-- Info -->
        <div class="p-3">
          <div class="flex items-start justify-between">
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-semibold truncate">{{ tpl.name }}</h3>
              <p
                v-if="tpl.description"
                class="text-xs text-(--ui-text-muted) mt-0.5 line-clamp-2"
              >
                {{ tpl.description }}
              </p>
            </div>
            <UDropdownMenu :items="dropdownItems(tpl)">
              <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
            </UDropdownMenu>
          </div>

          <div class="flex items-center gap-2 mt-2 flex-wrap">
            <NbBadge variant="secondary">
              {{ tpl.category }}
            </NbBadge>
            <span
              v-if="tpl.formats?.length"
              class="text-[11px] text-(--ui-text-muted) flex items-center gap-0.5"
            >
              <UIcon name="i-lucide-layout-grid" class="w-3 h-3" />
              {{ tpl.formats.length }} {{ tpl.formats.length === 1 ? 'size' : 'sizes' }}
            </span>
            <span class="text-[11px] text-(--ui-text-muted) flex items-center gap-0.5">
              <UIcon name="i-lucide-download" class="w-3 h-3" />
              {{ tpl.usageCount || 0 }}
            </span>
          </div>

          <div class="mt-3">
            <NbButton
              variant="secondary"
              icon="i-lucide-play"
              size="sm"
              block
              @click="useTemplate(tpl)"
            >
              Use Template
            </NbButton>
          </div>
        </div>
      </NbCard>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-16">
      <div class="flex justify-center mb-4">
        <BrandCube color="yellow" :size="48" />
      </div>
      <h3 class="text-lg font-semibold mb-1">No templates found</h3>
      <p class="text-sm text-(--ui-text-muted) mb-5">
        {{ searchQuery || activeCategory !== 'all' ? 'Try adjusting your search or category filter' : 'Save a project as a template to get started' }}
      </p>
      <NbButton
        v-if="searchQuery || activeCategory !== 'all'"
        variant="secondary"
        icon="i-lucide-x"
        @click="searchQuery = ''; activeCategory = 'all'"
      >
        Clear Filters
      </NbButton>
    </div>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-4">
          <h3 class="text-lg font-semibold mb-2">Delete Template</h3>
          <p class="text-sm text-(--ui-text-muted) mb-4">
            Are you sure you want to delete "{{ deleteTarget?.name }}"? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="outline" size="sm" @click="showDeleteModal = false" />
            <UButton label="Delete" color="error" size="sm" @click="doDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
